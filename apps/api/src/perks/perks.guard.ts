import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  applyDecorators,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { PerksService } from './perks.service.js';

const REQUIRES_PERKS = 'requiresPerks';
const ALLOWS_TRIAL = 'perksAllowTrial';

/**
 * Marks a route as agency-perks only. Pair it with JwtAuthGuard (which sets the user) and PerksGuard.
 * `orTrial`: an agency in its free trial passes too. Only for routes that do the trial's own job (publishing and
 * editing listings, in bulk); a route that hands out a subscription's value (contact reveals, chat tools) must not.
 */
export const RequiresPerks = (options: { orTrial?: boolean } = {}) =>
  applyDecorators(SetMetadata(REQUIRES_PERKS, true), SetMetadata(ALLOWS_TRIAL, options.orTrial === true));

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
    const orTrial = this.reflector.getAllAndOverride<boolean | undefined>(ALLOWS_TRIAL, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (orTrial && (await this.perks.inTrial(user.id))) return true;

    throw new ForbiddenException({
      message: 'This needs an active agency subscription.',
      code: PERKS_REQUIRED_CODE,
    });
  }
}
