import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { PerksService } from './perks.service.js';

const REQUIRES_PERKS = 'requiresPerks';

/** Marks a route as agency-perks only. Pair it with JwtAuthGuard (which sets the user) and PerksGuard. */
export const RequiresPerks = () => SetMetadata(REQUIRES_PERKS, true);

export const PERKS_REQUIRED_CODE = 'PERKS_REQUIRED';

/**
 * Lets a request through only when the signed-in account currently has the agency perks.
 * Order matters: `@UseGuards(JwtAuthGuard, PerksGuard)`. Without `@RequiresPerks()` it does nothing.
 */
@Injectable()
export class PerksGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly perks: PerksService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean | undefined>(REQUIRES_PERKS, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const user = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>().user;
    if (!user) throw new ForbiddenException();
    if (await this.perks.reasonFor(user.id)) return true;

    throw new ForbiddenException({
      message: 'This needs an active agency subscription.',
      code: PERKS_REQUIRED_CODE,
    });
  }
}
