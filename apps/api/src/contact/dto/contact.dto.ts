import type { ContactAccess, ContactQuota } from '@bongah/shared-types';
import type { UnlockContactInput } from '@bongah/validation';

export { unlockContactSchema } from '@bongah/validation';

export type ContactAccessDto = ContactAccess;
export type ContactQuotaDto = ContactQuota;
export type UnlockContactDto = UnlockContactInput;
