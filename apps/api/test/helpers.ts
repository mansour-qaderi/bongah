import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHmac, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
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

  private readonly sockets: Socket[] = [];

  /** Starts the app on a free port (sockets need a real one) and returns its base URL. Idempotent. */
  async listen(): Promise<string> {
    const server = this.app.getHttpServer();
    if (!server.listening) await this.app.listen(0, '127.0.0.1');
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  /** A connected chat socket for `token` (closed in close()). Rejects with the server's reason if the handshake is refused. */
  async connectSocket(token: string | undefined): Promise<Socket> {
    const url = await this.listen();
    const socket = io(url, { auth: token === undefined ? {} : { token }, transports: ['websocket'], reconnection: false });
    this.sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', (error) => reject(error));
    });
    return socket;
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

  /** Gives a user a batch of contact reveal credits (without going through a payment). */
  async giveContactCredits(userId: string, amount: number, source: 'REFERRAL' | 'ADMIN_GRANT' = 'ADMIN_GRANT') {
    await this.prisma.userCredit.create({
      data: {
        userId,
        source,
        amount,
        remaining: amount,
        // A referral batch names the friend it came from; tests use the user's own id.
        inviteeId: source === 'REFERRAL' ? userId : null,
      },
    });
  }

  /** Creates an ACTIVE listing owned by `owner` straight in the database. */
  async listing(owner: { id: string }, overrides: Record<string, unknown> = {}) {
    const agency = await this.prisma.agency.findUnique({ where: { userId: owner.id }, select: { id: true } });
    return this.prisma.property.create({
      data: {
        userId: owner.id,
        agencyId: agency?.id ?? null,
        title: 'Chat test apartment',
        description: 'Bright apartment close to the market.',
        type: 'APARTMENT',
        dealType: 'SALE',
        price: 85000,
        currency: 'USD',
        areaSqm: 90,
        province: 'Kabul',
        district: 'Shar-e-Naw',
        neighborhood: 'Qala-e-Fathullah',
        address: 'Street 4',
        images: ['https://example.com/a.jpg'],
        ...overrides,
      },
    });
  }

  /** An ADMIN account (created directly: no API can grant the role). */
  admin(): Promise<TestUser> {
    return this.user(Role.ADMIN);
  }

  /**
   * Pays for something the way the app does: starts the payment, then HesabPay's signed webhook
   * confirms it (unless `confirm` is false). Returns the payment's id.
   */
  async pay(user: TestUser, body: object, confirm = true): Promise<string> {
    const started = await this.post('/hesabpay/payments', body, user.token).expect(201);
    if (confirm) await this.confirmPayment(started.body.id as string);
    return started.body.id as string;
  }

  /** Sends HesabPay's SUCCESS webhook for one of our payments. */
  async confirmPayment(paymentId: string): Promise<void> {
    const tx = await this.prisma.transaction.findUniqueOrThrow({ where: { id: paymentId } });
    const raw = JSON.stringify({ transaction_id: tx.hesabpayTxId, status: 'SUCCESS' });
    await request(this.http)
      .post('/hesabpay/webhook')
      .set('content-type', 'application/json')
      .set('x-hesabpay-signature', signWebhook(raw))
      .send(raw)
      .expect(200);
  }

  /** Uploads raw picture bytes (the way the app does) to `path`, e.g. /property-images. */
  upload(path: string, user: { token: string } | null, bytes: Buffer, type = 'image/jpeg') {
    const req = request(this.http).post(path).set('Content-Type', type);
    return (user ? req.set('Authorization', `Bearer ${user.token}`) : req).send(bytes);
  }

  /** Removes everything the test created, children before parents. */
  async close(): Promise<void> {
    for (const socket of this.sockets) socket.close();
    const userIds = this.userIds;
    const agencies = await this.prisma.agency.findMany({
      where: { userId: { in: userIds } },
      select: { id: true },
    });
    const agencyIds = agencies.map((a) => a.id);
    // Chat and contact reveals point at users and listings (and messages at pictures, unlocks at credits).
    await this.prisma.message.deleteMany({ where: { senderId: { in: userIds } } });
    await this.prisma.conversation.deleteMany({
      where: { OR: [{ buyerId: { in: userIds } }, { sellerId: { in: userIds } }] },
    });
    await this.prisma.chatImage.deleteMany({ where: { uploaderId: { in: userIds } } });
    await this.prisma.chatTemplate.deleteMany({ where: { userId: { in: userIds } } });
    await this.prisma.contactUnlockLog.deleteMany({
      where: { OR: [{ userId: { in: userIds } }, { contactUserId: { in: userIds } }] },
    });
    await this.prisma.userCredit.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { inviteeId: { in: userIds } }] } });
    await this.prisma.subscription.deleteMany({ where: { agencyId: { in: agencyIds } } });
    // Rewards point at users and listings; invited users point at their inviter.
    await this.prisma.reward.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { inviteeId: { in: userIds } }] } });
    await this.prisma.user.updateMany({ where: { id: { in: userIds } }, data: { referredById: null } });
    // Moderation, banners, prices, audit lines and uploaded pictures point at users and listings.
    await this.prisma.abuseReport.deleteMany({
      where: { OR: [{ reporterId: { in: userIds } }, { targetUserId: { in: userIds } }, { resolvedById: { in: userIds } }] },
    });
    await this.prisma.banner.deleteMany({
      where: { OR: [{ createdById: { in: userIds } }, { linkProperty: { userId: { in: userIds } } }] },
    });
    await this.prisma.pricingOverride.deleteMany({ where: { updatedById: { in: userIds } } });
    await this.prisma.adminAuditLog.deleteMany({
      where: { OR: [{ actorId: { in: userIds } }, { targetType: 'user', targetId: { in: userIds } }] },
    });
    await this.prisma.propertyImage.deleteMany({ where: { uploaderId: { in: userIds } } });
    await this.prisma.propertyViewDay.deleteMany({ where: { property: { userId: { in: userIds } } } });
    await this.prisma.agency.updateMany({ where: { reviewedById: { in: userIds } }, data: { reviewedById: null } });
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
  /** DELETE with a JSON body (DELETE /notifications/devices). */
  delWith = (path: string, body: object, token?: string) =>
    withAuth(request(this.http).delete(path).send(body), token);
}

/** A fresh Afghan number (+9370xxxxxxx) so tests never share a user. */
export function randomPhone(): string {
  const tail = String(Math.floor(Math.random() * 1e7)).padStart(7, '0');
  return `+9370${tail}`;
}

function withAuth<T extends request.Test>(req: T, token?: string): T {
  return token ? (req.set('Authorization', `Bearer ${token}`) as T) : req;
}

/** Bytes that start like a real JPEG, padded to `size`. */
export const jpegBytes = (size = 2000) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(size - 4, 7)]);
/** Bytes that start like a real PNG, padded to `size`. */
export const pngBytes = (size = 500) =>
  Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(size - 8, 1)]);

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
