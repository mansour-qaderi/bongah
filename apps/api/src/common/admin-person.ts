import type { AdminPerson } from '@bongah/shared-types';

/** The columns toAdminPerson needs; select them wherever a person is shown to an admin. */
export const adminPersonSelect = { id: true, fullName: true, phoneNumber: true, bannedAt: true } as const;

export function toAdminPerson(user: {
  id: string;
  fullName: string | null;
  phoneNumber: string;
  bannedAt: Date | null;
}): AdminPerson {
  return {
    id: user.id,
    full_name: user.fullName,
    phone_number: user.phoneNumber,
    banned_at: user.bannedAt?.toISOString() ?? null,
  };
}
