import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Role } from '../../generated/prisma/client.js';
import type { AuthenticatedUser } from '../auth.types.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';

export const ROLE_REQUIRED_CODE = 'ROLE_REQUIRED';

/**
 * Role-based access control. Must run after JwtAuthGuard, which sets `request.user.role` from the
 * DATABASE (not from the token), so this guard needs no lookup of its own and a demoted admin loses
 * access immediately. Fails closed: with no @Roles() on the route, or no authenticated user, nobody gets in.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowed = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const user = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>().user;
    if (!user) throw new UnauthorizedException(); // JwtAuthGuard did not run first
    if (!allowed || allowed.length === 0 || !allowed.includes(user.role)) {
      throw new ForbiddenException({ message: 'You do not have access to this.', code: ROLE_REQUIRED_CODE });
    }
    return true;
  }
}
