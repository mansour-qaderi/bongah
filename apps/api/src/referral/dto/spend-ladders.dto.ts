import type { SpendLaddersInput } from '@bongah/validation';

export { spendLaddersSchema } from '@bongah/validation';

/** POST /rewards/ladders/spend body (already validated). */
export type SpendLaddersDto = SpendLaddersInput;
