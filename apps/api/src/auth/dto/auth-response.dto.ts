import type { Role } from '../../generated/prisma/client.js';

export interface SendOtpResponse {
  message: string;
  /** Seconds until the code expires. */
  expires_in: number;
  /** Seconds before another code can be requested. */
  resend_after: number;
  /** The code itself. Only present with the mock SMS gateway outside production. */
  dev_otp?: string;
}

export interface AuthUserDto {
  id: string;
  phone_number: string;
  full_name: string | null;
  role: Role;
  avatar: string | null;
}

export interface VerifyOtpResponse {
  access_token: string;
  token_type: 'Bearer';
  /** Seconds until the access token expires. */
  expires_in: number;
  /** True when this login created the account (the app can then ask for a name). */
  is_new_user: boolean;
  user: AuthUserDto;
}
