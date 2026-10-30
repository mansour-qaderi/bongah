import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { User } from '@bongah/shared-types';
import { PrismaService } from '../prisma/prisma.service.js';
import type { RegisterUserDto } from './dto/register-user.dto.js';
import type { UpdatePreferencesDto } from './dto/update-preferences.dto.js';
import { toUser } from './user.mapper.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** The signed-in user's current record: the app refreshes the role and name from here. */
  async me(userId: string): Promise<User> {
    const row = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!row) throw new UnauthorizedException();
    return toUser(row);
  }

  /**
   * Completes the profile of the signed-in user. The account was already created by the first
   * OTP login; this only sets the name and avatar. Phone number and role are never taken from
   * the request.
   */
  async register(userId: string, input: RegisterUserDto): Promise<User> {
    const existing = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!existing) throw new UnauthorizedException();

    const row = await this.prisma.user.update({
      where: { id: userId },
      data: {
        fullName: input.full_name,
        // `undefined` leaves the current avatar alone; `null` clears it.
        avatar: input.avatar,
      },
    });
    return toUser(row);
  }

  /**
   * Changes the signed-in user's own settings, the market they work in among them (it only changes what the apps offer
   * and list next; listings already published keep the market they were published in). The welcome flag can only be raised (the schema refuses `false`),
   * and raising it twice is harmless, so the app may retry freely.
   */
  async updatePreferences(userId: string, input: UpdatePreferencesDto): Promise<User> {
    const existing = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!existing) throw new UnauthorizedException();

    const row = await this.prisma.user.update({
      where: { id: userId },
      data: {
        enableDailyMotivation: input.enable_daily_motivation,
        hasSeenWelcome: input.has_seen_welcome,
        market: input.market,
      },
    });
    return toUser(row);
  }
}
