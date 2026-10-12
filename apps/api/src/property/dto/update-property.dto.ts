import type { UpdatePropertyInput } from '@bongah/validation';

export { updatePropertySchema } from '@bongah/validation';

/** PATCH /properties/:id body: a non-empty subset of the editable fields. */
export type UpdatePropertyDto = UpdatePropertyInput;
