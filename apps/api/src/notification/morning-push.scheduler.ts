import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { KABUL_TIME_ZONE, NOTIFICATION_SETTINGS, type NotificationSettings } from './notification.config.js';
import { MorningPushService } from './morning-push.service.js';

/**
 * Every 10 minutes from 08:00 to 10:50, Kabul time. The first tick (08:00) sends to everyone; the later
 * ones are a safety net, not a repeat: they pick up only users the earlier ticks did not reach (the server was
 * down at 08:00, the push provider was briefly unreachable, a phone was registered a moment ago) because
 * each user is reserved once per day. After 10:50 a missed day stays missed: a "good morning" at noon is not one.
 */
export const MORNING_PUSH_CRON = '*/10 8-10 * * *';
export const MORNING_PUSH_JOB = 'morning-push';

@Injectable()
export class MorningPushScheduler {
  private readonly logger = new Logger(MorningPushScheduler.name);
  /** A slow run must not overlap the next tick on this server (other servers are covered by the reservation). */
  private running = false;

  constructor(
    private readonly push: MorningPushService,
    @Inject(NOTIFICATION_SETTINGS) private readonly settings: NotificationSettings,
  ) {}

  @Cron(MORNING_PUSH_CRON, { name: MORNING_PUSH_JOB, timeZone: KABUL_TIME_ZONE })
  async tick(): Promise<void> {
    if (!this.settings.schedulerEnabled || this.settings.provider === 'off') return;
    if (this.running) {
      this.logger.warn('The previous morning push run is still going; skipping this tick.');
      return;
    }
    this.running = true;
    try {
      await this.push.runMorningPush();
    } catch (error) {
      this.logger.error(`Morning push run failed: ${error instanceof Error ? error.stack : 'unknown error'}`);
    } finally {
      this.running = false;
    }
  }
}
