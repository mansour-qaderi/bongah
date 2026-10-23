import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { applyCors } from './cors.js';
import { applyTrustProxy } from './trust-proxy.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Payment webhooks are signed over the exact bytes received, so keep them (req.rawBody).
    rawBody: true,
  });
  applyCors(app);
  // Opt-in (TRUST_PROXY): which proxies' X-Forwarded-For to believe, so rate limits count the real client.
  applyTrustProxy(app);
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
