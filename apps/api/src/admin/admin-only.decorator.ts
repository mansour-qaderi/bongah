import { applyDecorators, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/client.js';

/**
 * Everything under /admin: a signed-in, not-banned account whose role in the DATABASE is ADMIN.
 * Put it on the controller class, so a new route can never be added without it.
 */
export const AdminOnly = () => applyDecorators(UseGuards(JwtAuthGuard, RolesGuard), Roles(Role.ADMIN));
