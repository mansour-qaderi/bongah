import type { SetAgencyLocationInput } from '@bongah/validation';

export { setAgencyLocationSchema } from '@bongah/validation';

/** PUT /agencies/me/location body (already validated). */
export type SetAgencyLocationDto = SetAgencyLocationInput;
