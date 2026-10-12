import type { SendOtpResponse, User, VerifyOtpResponse } from '@bongah/shared-types';

// The wire shapes live in @bongah/shared-types so the mobile app and the API cannot drift apart.
export type { SendOtpResponse, VerifyOtpResponse };
export type AuthUserDto = User;
