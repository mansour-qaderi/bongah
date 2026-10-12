import 'dotenv/config';

// Test-only environment. Real values from .env win; these fill the gaps.
process.env.NODE_ENV = 'test';
process.env.SMS_PROVIDER = 'mock';
process.env.JWT_SECRET ??= 'e2e-only-jwt-secret-not-for-real-use-0123456789';
// Prefer a dedicated database for e2e runs if one is configured.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
