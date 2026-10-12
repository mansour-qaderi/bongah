import type { RegisterAgencyInput } from '@bongah/validation';

export { registerAgencySchema } from '@bongah/validation';

/** POST /agencies/register body (already validated). */
export type RegisterAgencyDto = RegisterAgencyInput;
