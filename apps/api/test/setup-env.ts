import 'dotenv/config';

// Test-only environment. Real values from .env win; these fill the gaps.
process.env.NODE_ENV = 'test';
process.env.SMS_PROVIDER = 'mock';
process.env.JWT_SECRET ??= 'e2e-only-jwt-secret-not-for-real-use-0123456789';
// Prefer a dedicated database for e2e runs if one is configured.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

// Payments: the mock gateway signs webhooks with this secret; prices/days are fixed so tests can assert on them.
process.env.HESABPAY_MODE = 'mock';
process.env.HESABPAY_WEBHOOK_SECRET = 'e2e-only-webhook-secret-0123456789';
process.env.HESABPAY_CURRENCY = 'AFGHANI';
process.env.HESABPAY_PRICE_SUBSCRIPTION_MONTHLY = '1000';
process.env.HESABPAY_PRICE_SUBSCRIPTION_QUARTERLY = '2700';
process.env.HESABPAY_PRICE_SUBSCRIPTION_YEARLY = '9600';
process.env.HESABPAY_PRICE_LADDER = '50';
process.env.HESABPAY_PRICE_FEATURED_AD = '100.50';
process.env.HESABPAY_FEATURED_AD_DAYS = '7';
