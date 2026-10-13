import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthenticatedUser, JwtPayload } from '../auth.types.js';

export const ACCOUNT_BANNED_CODE = 'ACCOUNT_BANNED';

/** The 403 a suspended account gets everywhere (API requests, login, chat connections). */
export function accountBanned(): ForbiddenException {
  // No reason in the body: the admin's note is internal and may name other people.
  return new ForbiddenException({
    message: 'This account has been suspended. Contact Bongah support.',
    code: ACCOUNT_BANNED_CODE,
  });
}

/**
 * Protects a route: requires `Authorization: Bearer <access token>` and sets `request.user`.
 *
 * The token only proves who is calling. What they may do is decided by the database on EVERY request:
 * `request.user.role` is the role stored now (a demoted admin or a promoted agency is not held to the
 * role in an old token), a deleted account is refused (401), and a banned one is refused (403
 * ACCOUNT_BANNED), so a ban takes effect on the very next request instead of when the token expires.
 * One primary-key lookup per request.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException();
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException();
    }

    const account = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { role: true, bannedAt: true },
    });
    if (!account) throw new UnauthorizedException(); // a valid token for an account that no longer exists
    if (account.bannedAt) throw accountBanned();

    request.user = { id: payload.sub, role: account.role };
    return true;
  }
}
