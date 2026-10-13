import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHmac, randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import type { VerifyOtpResponse } from '@bongah/shared-types';
import { Role } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

export const hasDb = Boolean(process.env.DATABASE_URL);

export interface TestUser {
  id: string;
  phone: string;
  /** A valid access token for this user. */
  token: string;
}

/**
 * Boots the real AppModule against the test database, the way main.ts does (rawBody on).
 * Everything the tests create is tracked and removed in close().
 */
export class TestContext {
  readonly userIds: string[] = [];

  private constructor(
    readonly app: INestApplication,
    readonly prisma: PrismaService,
    readonly jwt: JwtService,
  ) {}

  static async create(): Promise<TestContext> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      // Many requests come from one IP in tests; the per-IP limiter is not what's under test here.
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const app = moduleRef.createNestApplication({ rawBody: true });
    await app.init();
    return new TestContext(app, app.get(PrismaService), app.get(JwtService));
  }

  get http() {
    return this.app.getHttpServer();
  }

  /** Creates a user straight in the database (bypassing OTP) and returns it with a token. */
  async user(role: Role = Role.USER): Promise<TestUser> {
    const phone = randomPhone();
    const row = await this.prisma.user.create({ data: { phoneNumber: phone, role } });
    this.userIds.push(row.id);
    return { id: row.id, phone, token: await this.tokenFor(row.id, role) };
  }

  /** Asks for an OTP the way the app does and returns the code (the mock SMS gateway hands it back in tests). */
  async otpFor(phone: string): Promise<string> {
    // A second code for the same number would hit the resend cooldown; the cooldown is not what's under test.
    await this.prisma.otpCode.updateMany({ where: { phoneNumber: phone }, data: { createdAt: new Date(Date.now() - 2 * 3_600_000) } });
    const sent = await this.post('/auth/send-otp', { phone_number: phone }).expect(200);
    return sent.body.dev_otp as string;
  }

  /** POST /auth/verify-otp, optionally with a referral code. Returns the request so callers pick the status they expect. */
  verifyOtp = (phone: string, otp: string, referralCode?: string) =>
    this.post('/auth/verify-otp', {
      phone_number: phone,
      otp_code: otp,
      ...(referralCode === undefined ? {} : { referral_code: referralCode }),
    });

  /** Signs a NEW user up through the real OTP flow (optionally with a referral code). Removed in close(). */
  async signUp(referralCode?: string): Promise<TestUser & { response: VerifyOtpResponse }> {
    const phone = randomPhone();
    const res = await this.verifyOtp(phone, await this.otpFor(phone), referralCode).expect(200);
    const response = res.body as VerifyOtpResponse;
    this.userIds.push(response.user.id);
    return { id: response.user.id, phone, token: response.access_token, response };
  }

  /** The referral code of a user (every user has one). */
  async codeOf(userId: string): Promise<string> {
    return (await this.prisma.user.findUniqueOrThrow({ where: { id: userId } })).referralCode;
  }

  /** A token that claims `role`, whatever the database says. */
  tokenFor(userId: string, role: Role): Promise<string> {
    return this.jwt.signAsync({ sub: userId, role });
  }

  /** A user with role AGENCY and an agency profile; optionally with a currently active subscription. */
  async agency(withSubscription: boolean): Promise<TestUser & { agencyId: string }> {
    const user = await this.user(Role.AGENCY);
    const agency = await this.prisma.agency.create({
      data: {
        userId: user.id,
        agencyName: 'Test Agency',
        licensePhoto: 'https://example.com/license.jpg',
        address: 'Kabul', // no office pin: that is a subscription feature
      },
    });
    if (withSubscription) {
      await this.prisma.subscription.create({
        data: {
          agencyId: agency.id,
          packageType: 'MONTHLY',
          startDate: new Date(Date.now() - 86_400_000),
          endDate: new Date(Date.now() + 30 * 86_400_000),
        },
      });
    }
    return { ...user, agencyId: agency.id };
  }

  /** An agency whose only subscription ran out yesterday (still marked ACTIVE, as the status column is not swept). */
  async lapsedAgency(): Promise<TestUser & { agencyId: string }> {
    const agency = await this.agency(false);
    await this.prisma.subscription.create({
      data: {
        agencyId: agency.agencyId,
        packageType: 'MONTHLY',
        startDate: new Date(Date.now() - 31 * 86_400_000),
        endDate: new Date(Date.now() - 86_400_000),
      },
    });
    return agency;
  }

  /** Gives a user `count` unspent map location tokens (without going through a payment). */
  async giveTokens(userId: string, count: number, source: 'REFERRAL' | 'ADMIN_GRANT' = 'ADMIN_GRANT') {
    await this.prisma.mapLocationToken.createMany({
      data: Array.from({ length: count }, () => ({ userId, source })),
    });
  }

  /** Removes everything the test created, children before parents. */
  async close(): Promise<void> {
    const userIds = this.userIds;
    const agencies = await this.prisma.agency.findMany({
      where: { userId: { in: userIds } },
      select: { id: true },
    });
    const agencyIds = agencies.map((a) => a.id);
    await this.prisma.subscription.deleteMany({ where: { agencyId: { in: agencyIds } } });
    // Rewards point at users and listings; invited users point at their inviter.
    await this.prisma.reward.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { inviteeId: { in: userIds } }] } });
    await this.prisma.user.updateMany({ where: { id: { in: userIds } }, data: { referredById: null } });
    // Tokens point at both payments and listings, so they go first.
    await this.prisma.mapLocationToken.deleteMany({ where: { userId: { in: userIds } } });
    await this.prisma.transaction.deleteMany({ where: { userId: { in: userIds } } });
    await this.prisma.property.deleteMany({ where: { userId: { in: userIds } } });
    await this.prisma.agency.deleteMany({ where: { id: { in: agencyIds } } });
    await this.prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await this.app.close();
  }

  // Thin wrappers so specs read as requests.
  get = (path: string, token?: string) => withAuth(request(this.http).get(path), token);
  post = (path: string, body: object, token?: string) =>
    withAuth(request(this.http).post(path).send(body), token);
  put = (path: string, body: object, token?: string) =>
    withAuth(request(this.http).put(path).send(body), token);
  patch = (path: string, body: object, token?: string) =>
    withAuth(request(this.http).patch(path).send(body), token);
  del = (path: string, token?: string) => withAuth(request(this.http).delete(path), token);
}

/** A fresh Afghan number (+9370xxxxxxx) so tests never share a user. */
export function randomPhone(): string {
  const tail = String(Math.floor(Math.random() * 1e7)).padStart(7, '0');
  return `+9370${tail}`;
}

function withAuth<T extends request.Test>(req: T, token?: string): T {
  return token ? (req.set('Authorization', `Bearer ${token}`) as T) : req;
}

/** The pin used by tests that need one. */
export const PIN = { lat: 34.5333, lng: 69.1667 };

/** A valid POST /properties body WITHOUT a map pin (add `...PIN` to pin it). `tag` makes the province unique so list tests see only their own rows. */
export function propertyBody(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Two bedroom apartment',
    description: 'Bright apartment close to the market.',
    type: 'APARTMENT',
    deal_type: 'SALE',
    price: 85000,
    currency: 'USD',
    area_sqm: 90,
    bedrooms: 2,
    bathrooms: 1,
    province: 'Kabul',
    district: 'Shar-e-Naw',
    neighborhood: 'Qala-e-Fathullah',
    address: 'Street 4, near the park',
    images: ['https://example.com/a.jpg'],
    ...overrides,
  };
}

/** A province name no other test (or real data) uses. */
export const uniqueProvince = () => `Prov-${randomUUID().slice(0, 8)}`;

/** Signs a webhook body the way the mock gateway expects. */
export function signWebhook(rawBody: string, secret = process.env.HESABPAY_WEBHOOK_SECRET!): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}
