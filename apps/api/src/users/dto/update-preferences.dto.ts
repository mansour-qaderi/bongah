import type { UpdatePreferencesInput } from '@bongah/validation';

export { updatePreferencesSchema } from '@bongah/validation';

/** PATCH /users/me/preferences body (already validated). */
export type UpdatePreferencesDto = UpdatePreferencesInput;
