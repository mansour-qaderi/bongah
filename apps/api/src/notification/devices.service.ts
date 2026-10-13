import { Injectable } from '@nestjs/common';
import { PUSH_MAX_DEVICES_PER_USER } from '@bongah/shared-types';
import type { RegisterDeviceInput } from '@bongah/validation';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Remembers that this phone can receive this user's pushes. Safe to call on every app start.
   * A token already registered to someone else (the phone changed hands, or a different account signed in on
   * it) moves to this user: a token is a phone, and a phone belongs to whoever is signed in on it now.
   * A user keeps at most PUSH_MAX_DEVICES_PER_USER phones; the ones not seen for longest are dropped.
   */
  async register(userId: string, input: RegisterDeviceInput): Promise<void> {
    await this.prisma.$transaction(async (db) => {
      const now = new Date();
      await db.pushDevice.upsert({
        where: { token: input.token },
        create: { userId, token: input.token, platform: input.platform, language: input.language, lastSeenAt: now },
        update: { userId, platform: input.platform, language: input.language, lastSeenAt: now },
      });
      const stale = await db.pushDevice.findMany({
        where: { userId },
        orderBy: [{ lastSeenAt: 'desc' }, { id: 'asc' }],
        skip: PUSH_MAX_DEVICES_PER_USER,
        select: { id: true },
      });
      if (stale.length > 0) await db.pushDevice.deleteMany({ where: { id: { in: stale.map((device) => device.id) } } });
    });
  }

  /** Forgets one of the user's own phones (sign-out). Unknown tokens, and other people's, are ignored. */
  async remove(userId: string, token: string): Promise<void> {
    await this.prisma.pushDevice.deleteMany({ where: { userId, token } });
  }
}
