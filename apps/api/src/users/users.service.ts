import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { User } from '@bongah/shared-types';
import { PrismaService } from '../prisma/prisma.service.js';
import type { RegisterUserDto } from './dto/register-user.dto.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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
    return {
      id: row.id,
      phone_number: row.phoneNumber,
      full_name: row.fullName,
      role: row.role,
      avatar: row.avatar,
    };
  }
}
