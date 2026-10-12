import type { RegisterUserInput } from '@bongah/validation';

export { registerUserSchema } from '@bongah/validation';

/** POST /users/register body (already validated). */
export type RegisterUserDto = RegisterUserInput;
