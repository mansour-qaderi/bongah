/** How long a code can be used after it is sent. */
export const OTP_TTL_SECONDS = 5 * 60;
/** Minimum gap between two codes for the same phone number. */
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
/** Wrong guesses allowed per code before it is burned. */
export const OTP_MAX_VERIFY_ATTEMPTS = 5;
/** Codes that can be sent to one phone number per rolling hour (limits SMS cost abuse). */
export const OTP_MAX_SENDS_PER_HOUR = 5;
/** Old code rows for a phone are deleted when it asks for a new code. */
export const OTP_RETENTION_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_JWT_EXPIRES_IN_SECONDS = 7 * 24 * 60 * 60;
