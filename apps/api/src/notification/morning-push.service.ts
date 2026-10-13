import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import type { Language, MorningPushDay, TestPushResult } from '@bongah/shared-types';
import { kabulDayKey, kabulDayList } from '../contact/contact.time.js';
import { MorningPushStatus, Prisma, QuoteCategory, type PushDevice } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NOTIFICATION_SETTINGS, type NotificationSettings } from './notification.config.js';
import { MORNING_PUSH_TTL_SECONDS, MORNING_PUSH_TYPE, MORNING_TITLE, TEST_BODY } from './notification.messages.js';
import { PUSH_GATEWAY, type PushGateway, type PushResult } from './push.gateway.js';
import { pickMorningQuote, type QuotesByLanguage } from './quote-selection.js';

/** How many users one claim statement reserves. */
export const MORNING_PUSH_BATCH = 500;
/** How many pushes are in flight at once. */
const SEND_CONCURRENCY = 10;
/** Claim rows older than this are deleted; the stats screen shows 14 days. */
const KEEP_DAYS = 30;
const STATS_DAYS = 14;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

export const PUSH_DISABLED_CODE = 'PUSH_DISABLED';

export interface MorningPushRun {
  day: string;
  /** Why nothing was done, when that is the case. */
  skipped?: 'PUSH_DISABLED' | 'NO_QUOTES';
  /** Users this run reserved. */
  claimed: number;
  sent: number;
  /** Refused for good (the token is dead, or the provider rejected the message). Not retried. */
  failed: number;
  /** Failed for a reason that may pass (provider down); the reservation was released so the next run tries again. */
  retryable: number;
  /** The provider rejected our credentials, so the run stopped. */
  aborted: boolean;
}

interface Quote {
  id: string;
  text: string;
  language: string;
}

@Injectable()
export class MorningPushService {
  private readonly logger = new Logger(MorningPushService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_SETTINGS) private readonly settings: NotificationSettings,
    @Inject(PUSH_GATEWAY) private readonly gateway: PushGateway,
  ) {}

  /**
   * Sends today's morning quote to everyone who wants it and has not had it yet today.
   *
   * Safe to run again and safe to run on several servers at once: each user is first RESERVED for the Kabul day
   * with one INSERT whose primary key is (day, user), and only the run whose insert succeeded sends to that user.
   * So a user gets at most one morning push per day, never two. The price of that guarantee: if the server
   * dies between reserving and sending, that user simply misses today's push (the reservation is not undone).
   * When the provider is merely unreachable the reservation IS undone, so the next run tries again.
   */
  async runMorningPush(now = new Date()): Promise<MorningPushRun> {
    const dayKey = kabulDayKey(now);
    const day = dayKey.toISOString().slice(0, 10);
    const run: MorningPushRun = { day, claimed: 0, sent: 0, failed: 0, retryable: 0, aborted: false };

    if (this.settings.provider === 'off') return { ...run, skipped: 'PUSH_DISABLED' };

    const quotes = await this.loadMorningQuotes();
    if (quotes.size === 0) {
      this.logger.warn('No active morning quotes: nothing to send today. Add one under /admin/quotes.');
      return { ...run, skipped: 'NO_QUOTES' };
    }

    let cursor = NIL_UUID;
    while (!run.aborted) {
      const claimed = await this.claimBatch(day, cursor);
      if (claimed.length === 0) break;
      cursor = claimed.reduce((max, id) => (id > max ? id : max), cursor);
      run.claimed += claimed.length;
      await this.deliver(claimed, day, dayKey, quotes, run);
    }

    await this.prune(dayKey);
    this.logger.log(
      `Morning push ${day}: claimed ${run.claimed}, sent ${run.sent}, failed ${run.failed}, retryable ${run.retryable}` +
        (run.aborted ? ' (stopped: the push provider refused our credentials)' : ''),
    );
    return run;
  }

  /** The last STATS_DAYS Kabul days, oldest first, for the admin screen. */
  async stats(now = new Date()): Promise<MorningPushDay[]> {
    const days = kabulDayList(kabulDayKey(now), STATS_DAYS);
    const rows = await this.prisma.morningPushSend.groupBy({
      by: ['day', 'status'],
      where: { day: { gte: new Date(`${days[0]}T00:00:00Z`) } },
      _count: { _all: true },
    });
    const byDay = new Map<string, MorningPushDay>(days.map((d) => [d, { day: d, claimed: 0, sent: 0, failed: 0 }]));
    for (const row of rows) {
      const entry = byDay.get(row.day.toISOString().slice(0, 10));
      if (!entry) continue;
      entry.claimed += row._count._all;
      if (row.status === MorningPushStatus.SENT) entry.sent += row._count._all;
      if (row.status === MorningPushStatus.FAILED) entry.failed += row._count._all;
    }
    return days.map((d) => byDay.get(d)!);
  }

  /** A real push to the admin's own registered phones, to check the provider setup before relying on 08:00. */
  async sendTest(userId: string): Promise<TestPushResult> {
    if (this.settings.provider === 'off') {
      throw new ConflictException({ message: 'Push notifications are switched off (PUSH_PROVIDER=off).', code: PUSH_DISABLED_CODE });
    }
    const devices = await this.prisma.pushDevice.findMany({ where: { userId }, orderBy: [{ lastSeenAt: 'desc' }, { id: 'asc' }] });
    const quotes = await this.loadMorningQuotes();

    let delivered = 0;
    let failed = 0;
    const dead: string[] = [];
    for (const device of devices) {
      const language = device.language as Language;
      const quote = pickMorningQuote(quotes, language, kabulDayKey(new Date()));
      const result = await this.gateway.send({
        token: device.token,
        title: MORNING_TITLE[language] ?? MORNING_TITLE.prs,
        body: quote?.text ?? TEST_BODY[language] ?? TEST_BODY.prs,
        data: { type: MORNING_PUSH_TYPE },
        ttlSeconds: MORNING_PUSH_TTL_SECONDS,
      });
      if (result.ok) delivered++;
      else {
        failed++;
        if (result.code === 'UNREGISTERED') dead.push(device.token);
        this.logger.warn(`Test push failed (${result.code}): ${result.detail}`);
      }
    }
    if (dead.length > 0) await this.prisma.pushDevice.deleteMany({ where: { token: { in: dead } } });
    return { devices: devices.length, delivered, failed };
  }

  // ───────────── the run, step by step ─────────────

  /** Active morning quotes grouped by language, each list oldest first. */
  private async loadMorningQuotes(): Promise<Map<string, Quote[]>> {
    const rows = await this.prisma.dailyQuote.findMany({
      where: { category: QuoteCategory.MORNING_NOTIFICATION, isActive: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, text: true, language: true },
    });
    const byLanguage = new Map<string, Quote[]>();
    for (const row of rows) byLanguage.set(row.language, [...(byLanguage.get(row.language) ?? []), row]);
    return byLanguage;
  }

  /**
   * Reserves the next batch: users after `cursor` who want the push, are not banned, have a phone registered,
   * and have no reservation for `day`. One statement does the choosing and the reserving, so a user who switches
   * the preference off or is banned a moment earlier is not reserved, and two servers running this at once reserve
   * disjoint sets (ON CONFLICT DO NOTHING hands each user to exactly one of them).
   */
  private async claimBatch(day: string, cursor: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ user_id: string }>>(Prisma.sql`
      INSERT INTO morning_push_sends (day, user_id, status)
      SELECT ${day}::date, u.id, 'CLAIMED'::morning_push_status
        FROM users u
       WHERE u.enable_daily_motivation
         AND u.banned_at IS NULL
         AND u.id > ${cursor}::uuid
         AND EXISTS (SELECT 1 FROM push_devices d WHERE d.user_id = u.id)
         AND NOT EXISTS (SELECT 1 FROM morning_push_sends s WHERE s.day = ${day}::date AND s.user_id = u.id)
       ORDER BY u.id
       LIMIT ${MORNING_PUSH_BATCH}
      ON CONFLICT (day, user_id) DO NOTHING
      RETURNING user_id
    `);
    return rows.map((row) => row.user_id);
  }

  private async deliver(
    userIds: string[],
    day: string,
    dayKey: Date,
    quotes: QuotesByLanguage<Quote>,
    run: MorningPushRun,
  ): Promise<void> {
    const devices = await this.prisma.pushDevice.findMany({
      where: { userId: { in: userIds } },
      orderBy: [{ lastSeenAt: 'desc' }, { id: 'asc' }],
    });
    const byUser = new Map<string, PushDevice[]>();
    for (const device of devices) byUser.set(device.userId, [...(byUser.get(device.userId) ?? []), device]);

    const dead: string[] = [];
    const unsent: string[] = [];
    const work = userIds.map((userId) => async () => {
      if (run.aborted) {
        run.retryable++;
        unsent.push(userId);
        return;
      }
      let outcome: Awaited<ReturnType<MorningPushService['pushToUser']>>;
      try {
        outcome = await this.pushToUser(userId, day, dayKey, quotes, byUser.get(userId) ?? [], dead);
      } catch (error) {
        // A database hiccup for one user must not abandon the rest of the batch: give this user back for the next run.
        this.logger.error(`Morning push for one user failed: ${error instanceof Error ? error.message : 'unknown error'}`);
        outcome = 'RETRY';
      }
      if (outcome === 'SENT') run.sent++;
      else if (outcome === 'FAILED') run.failed++;
      else {
        run.retryable++;
        unsent.push(userId);
        if (outcome === 'AUTH') run.aborted = true;
      }
    });
    await runLimited(work, SEND_CONCURRENCY);

    if (dead.length > 0) await this.prisma.pushDevice.deleteMany({ where: { token: { in: dead } } });
    // Give back the reservations of users who were not pushed for a reason that may pass, so the next run retries them.
    if (unsent.length > 0) {
      await this.prisma.morningPushSend.deleteMany({
        where: { day: dayKey, userId: { in: unsent }, status: MorningPushStatus.CLAIMED },
      });
    }
  }

  /** Pushes one user's phones with one quote (chosen by the language of the phone seen most recently). */
  private async pushToUser(
    userId: string,
    day: string,
    dayKey: Date,
    quotes: QuotesByLanguage<Quote>,
    devices: PushDevice[],
    dead: string[],
  ): Promise<'SENT' | 'FAILED' | 'RETRY' | 'AUTH'> {
    const language = (devices[0]?.language ?? 'prs') as Language;
    const quote = pickMorningQuote(quotes, language, dayKey);
    if (devices.length === 0 || !quote) {
      await this.record(day, userId, quote?.id ?? null, MorningPushStatus.FAILED, devices.length === 0 ? 'NO_DEVICE' : 'NO_QUOTE');
      return 'FAILED';
    }

    const results: PushResult[] = [];
    for (const device of devices) {
      const result = await this.gateway.send({
        token: device.token,
        title: MORNING_TITLE[language],
        body: quote.text,
        data: { type: MORNING_PUSH_TYPE },
        ttlSeconds: MORNING_PUSH_TTL_SECONDS,
      });
      results.push(result);
      if (!result.ok && result.code === 'UNREGISTERED') dead.push(device.token);
    }

    if (results.some((result) => result.ok)) {
      await this.record(day, userId, quote.id, MorningPushStatus.SENT, null);
      return 'SENT';
    }
    const failures = results.filter((result): result is Extract<PushResult, { ok: false }> => !result.ok);
    if (failures.some((failure) => failure.code === 'AUTH')) {
      this.logger.error(`The push provider refused our credentials: ${failures[0]?.detail}`);
      return 'AUTH';
    }
    // Any phone that failed for a reason that may pass is worth another try; the dead ones are forgotten meanwhile.
    if (failures.some((failure) => failure.code === 'TRANSIENT')) return 'RETRY';
    await this.record(day, userId, quote.id, MorningPushStatus.FAILED, failures[0]?.code ?? 'INVALID');
    return 'FAILED';
  }

  private async record(day: string, userId: string, quoteId: string | null, status: MorningPushStatus, error: string | null): Promise<void> {
    await this.prisma.morningPushSend.updateMany({
      where: { day: new Date(`${day}T00:00:00Z`), userId },
      data: { status, quoteId, error },
    });
  }

  private async prune(dayKey: Date): Promise<void> {
    const cutoff = new Date(dayKey.getTime() - KEEP_DAYS * 24 * 60 * 60 * 1000);
    await this.prisma.morningPushSend.deleteMany({ where: { day: { lt: cutoff } } });
  }
}

/** Runs the jobs with at most `limit` in flight; a job that throws is logged by its caller, not swallowed here. */
async function runLimited(jobs: Array<() => Promise<void>>, limit: number): Promise<void> {
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < jobs.length) {
      const job = jobs[next++]!;
      await job();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
}
