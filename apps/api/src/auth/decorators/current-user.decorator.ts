import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth.types.js';

/**
 * The signed-in user set by JwtAuthGuard. Only use on routes behind that guard.
 * `role` comes from the token and can be up to JWT_EXPIRES_IN_SECONDS old: for anything that
 * depends on the role, read it from the database instead.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();
    return request.user;
  },
);
