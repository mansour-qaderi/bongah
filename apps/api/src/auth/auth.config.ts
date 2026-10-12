import { ConfigService } from '@nestjs/config';
import { DEFAULT_JWT_EXPIRES_IN_SECONDS } from './auth.constants.js';

export interface JwtSettings {
  secret: string;
  expiresInSeconds: number;
}

/** Reads and validates JWT settings once, so a bad config fails at startup rather than at first login. */
export function readJwtSettings(config: ConfigService): JwtSettings {
  const secret = config.get<string>('JWT_SECRET');
  if (!secret || secret.length < 32) {
    throw new Error(
      'JWT_SECRET must be set to a random string of at least 32 characters. ' +
        `Generate one with: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`,
    );
  }

  const expiresInSeconds = Number(
    config.get<string>('JWT_EXPIRES_IN_SECONDS') ?? DEFAULT_JWT_EXPIRES_IN_SECONDS,
  );
  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds <= 0) {
    throw new Error('JWT_EXPIRES_IN_SECONDS must be a positive whole number of seconds.');
  }

  return { secret, expiresInSeconds };
}
