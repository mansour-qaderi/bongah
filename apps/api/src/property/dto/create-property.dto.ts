import type { CreatePropertyInput } from '@bongah/validation';

export { createPropertySchema } from '@bongah/validation';

/** POST /properties body (already validated and normalised). */
export type CreatePropertyDto = CreatePropertyInput;
