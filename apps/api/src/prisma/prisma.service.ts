import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { readPoolSettings } from './prisma.pool.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService) {
    const settings = readPoolSettings(config);
    super({
      adapter: new PrismaPg({ connectionString: config.getOrThrow<string>('DATABASE_URL'), ...settings.pool }),
      // Prisma's own 2 second wait for a connection is shorter than a cold connection to a hosted database (see prisma.pool.ts).
      transactionOptions: { maxWait: settings.transactionMaxWaitMs, timeout: settings.transactionTimeoutMs },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
