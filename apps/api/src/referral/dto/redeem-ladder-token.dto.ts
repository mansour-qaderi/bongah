import type { RedeemLadderTokenInput } from '@bongah/validation';

export { redeemLadderTokenSchema } from '@bongah/validation';

/** POST /rewards/ladder-tokens/redeem body (already validated). */
export type RedeemLadderTokenDto = RedeemLadderTokenInput;
