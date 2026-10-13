import { SetMetadata } from '@nestjs/common';
import type { Role } from '../../generated/prisma/client.js';

export const ROLES_KEY = 'roles';

/**
 * Limits a route (or a whole controller) to accounts with one of these roles. Use it together with
 * JwtAuthGuard, listed first: `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(Role.ADMIN)`.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
