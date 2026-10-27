import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { readPoolSettings, type PoolSettings } from './prisma.pool.js';
import { RetryingPool } from './prisma.retrying-pool.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly settings: PoolSettings;
  private keepWarm: NodeJS.Timeout | null = null;

  constructor(config: ConfigService) {
    const settings = readPoolSettings(config);
    const logger = new Logger(PrismaService.name);
    // Our own pool (instead of letting the adapter build one) so opening a connection can be retried (prisma.retrying-pool.ts).
    const pool = new RetryingPool(
      { connectionString: config.getOrThrow<string>('DATABASE_URL'), ...settings.pool },
      {
        retries: settings.connectRetries,
        baseDelayMs: 250,
        onRetry: (attempt, error) =>
          logger.warn(`Opening a database connection failed (${error instanceof Error ? error.message : String(error)}); retry ${attempt}/${settings.connectRetries}.`),
      },
    );
    super({
      adapter: new PrismaPg(pool, { disposeExternalPool: true }),
      // Prisma's own 2 second wait for a connection is shorter than a cold connection to a hosted database (see prisma.pool.ts).
      transactionOptions: { maxWait: settings.transactionMaxWaitMs, timeout: settings.transactionTimeoutMs },
    });
    this.settings = settings;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    // Pay for the first (slow) connection now, at startup, not on the first person's request. A failure here is not
    // fatal: the API starts and each request then retries on its own.
    await this.ping('warm-up');
    const every = this.settings.keepAliveIntervalMs;
    if (every > 0) {
      this.keepWarm = setInterval(() => void this.ping('keep-warm'), every);
      this.keepWarm.unref();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.keepWarm) clearInterval(this.keepWarm);
    await this.$disconnect();
  }

  private async ping(what: string): Promise<void> {
    const started = Date.now();
    try {
      await this.$queryRaw`SELECT 1`;
      if (what === 'warm-up') this.logger.log(`Database connection ready in ${Date.now() - started} ms.`);
    } catch (error) {
      this.logger.warn(`Database ${what} failed after ${Date.now() - started} ms: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
