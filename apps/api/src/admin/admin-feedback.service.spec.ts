import { NotFoundException } from '@nestjs/common';
import { AdminFeedbackService } from './admin-feedback.service.js';
import type { PushGateway, PushMessage, PushResult } from '../notification/push.gateway.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const NOW = new Date('2026-10-30T08:00:00.000Z');
const person = { id: 'u1', phoneNumber: '+93790049201', fullName: 'منصور', bannedAt: null };

/** A prisma stand-in with one feedback row, one admin audit table and some push devices. */
function setup(devices: { token: string; language: string }[], results: PushResult[]) {
  const row: Record<string, unknown> = {
    id: 'f1',
    userId: 'u1',
    category: 'PROBLEM',
    message: 'نقشه کند است',
    appVersion: '2.1.4',
    createdAt: NOW,
    adminReply: null,
    repliedAt: null,
    repliedById: null,
    user: person,
  };
  const audits: unknown[] = [];
  const deleted: string[][] = [];
  const db = {
    feedback: {
      findUnique: async ({ where }: { where: { id: string } }) => (where.id === 'f1' ? { id: 'f1', userId: 'u1' } : null),
      update: async ({ data }: { data: Record<string, unknown> }) => Object.assign(row, data),
    },
    adminAuditLog: { create: async ({ data }: { data: unknown }) => audits.push(data) },
    pushDevice: {
      findMany: async () => devices,
      deleteMany: async ({ where }: { where: { token: { in: string[] } } }) => deleted.push(where.token.in),
    },
  };
  const prisma = { ...db, $transaction: async (cb: (tx: typeof db) => unknown) => cb(db) } as unknown as PrismaService;
  const sent: PushMessage[] = [];
  const gateway: PushGateway = {
    send: async (message) => {
      sent.push(message);
      return results[sent.length - 1] ?? { ok: true };
    },
  };
  return { service: new AdminFeedbackService(prisma, gateway), row, audits, sent, deleted };
}

describe('AdminFeedbackService.reply', () => {
  it('saves the answer, writes an audit line and pushes every phone of the person in its own language', async () => {
    const { service, row, audits, sent } = setup(
      [
        { token: 'a', language: 'prs' },
        { token: 'b', language: 'ps' },
      ],
      [],
    );
    const result = await service.reply('admin1', 'f1', { message: 'سلام، بررسی شد.' });
    expect(row).toMatchObject({ adminReply: 'سلام، بررسی شد.', repliedById: 'admin1' });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actorId: 'admin1', action: 'FEEDBACK_REPLIED', targetType: 'feedback', targetId: 'f1' });
    expect(sent.map((m) => m.token)).toEqual(['a', 'b']);
    expect(sent[0]!.title).not.toBe(sent[1]!.title);
    expect(sent[0]).toMatchObject({ body: 'سلام، بررسی شد.', data: { type: 'FEEDBACK_REPLY', feedback_id: 'f1' } });
    expect(result.notified).toBe(true);
    expect(result.item.reply?.message).toBe('سلام، بررسی شد.');
  });

  it('keeps the answer even when no phone can be reached, and says so', async () => {
    const none = setup([], []);
    expect((await none.service.reply('admin1', 'f1', { message: 'سلام' })).notified).toBe(false);
    const down = setup([{ token: 'a', language: 'prs' }], [{ ok: false, code: 'TRANSIENT', detail: 'down' }]);
    const result = await down.service.reply('admin1', 'f1', { message: 'سلام' });
    expect(result.notified).toBe(false);
    expect(down.row.adminReply).toBe('سلام');
  });

  it('forgets a phone the provider says is gone, and shortens a long answer in the push only', async () => {
    const { service, sent, deleted, row } = setup(
      [
        { token: 'dead', language: 'prs' },
        { token: 'live', language: 'prs' },
      ],
      [{ ok: false, code: 'UNREGISTERED', detail: 'gone' }, { ok: true }],
    );
    const long = 'الف'.repeat(300);
    const result = await service.reply('admin1', 'f1', { message: long });
    expect(deleted).toEqual([['dead']]);
    expect(result.notified).toBe(true);
    expect(sent[0]!.body.length).toBeLessThanOrEqual(180);
    expect(sent[0]!.body.endsWith('…')).toBe(true);
    expect(row.adminReply).toBe(long);
  });

  it('answers 404 for a message that does not exist, and writes nothing', async () => {
    const { service, audits, sent } = setup([{ token: 'a', language: 'prs' }], []);
    await expect(service.reply('admin1', 'nope', { message: 'سلام' })).rejects.toBeInstanceOf(NotFoundException);
    expect(audits).toEqual([]);
    expect(sent).toEqual([]);
  });
});
