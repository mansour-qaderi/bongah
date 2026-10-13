import type { User } from '@bongah/shared-types';

/** The fields of a users row the wire `User` is built from. */
export interface UserRow {
  id: string;
  phoneNumber: string;
  fullName: string | null;
  role: User['role'];
  avatar: string | null;
  enableDailyMotivation: boolean;
  hasSeenWelcome: boolean;
}

/** The one place a users row becomes the `User` the API sends (login, /users/me, register, preferences). */
export function toUser(row: UserRow): User {
  return {
    id: row.id,
    phone_number: row.phoneNumber,
    full_name: row.fullName,
    role: row.role,
    avatar: row.avatar,
    enable_daily_motivation: row.enableDailyMotivation,
    has_seen_welcome: row.hasSeenWelcome,
  };
}
