import type { Role } from '../generated/prisma/client.js';

export interface JwtPayload {
  sub: string; // user id
  role: Role;
}

export interface AuthenticatedUser {
  id: string;
  role: Role;
}
