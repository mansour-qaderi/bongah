import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Payment webhooks are signed over the exact bytes received, so keep them (req.rawBody).
    rawBody: true,
  });
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
