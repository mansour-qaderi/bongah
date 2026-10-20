import { Controller, Get, INestApplication, Module, Req, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AuthModule } from '../src/auth/auth.module.js';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard.js';
import { OtpGateway } from '../src/auth/otp/otp-gateway.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

@Controller('test-protected')
class ProtectedController {
  @Get()
  @UseGuards(JwtAuthGuard)
  whoami(@Req() req: { user: unknown }) {
    return req.user;
  }
}

// Mirrors how a real feature module uses auth: import AuthModule, then guard its routes.
@Module({ imports: [AuthModule], controllers: [ProtectedController] })
class ProtectedTestModule {}

const hasDb = Boolean(process.env.DATABASE_URL);
const usedPhones = new Set<string>();

/** A fresh, valid Afghan number per test so tests never interfere with each other. */
function newPhone(): { e164: string; local: string } {
  const tail = String(Math.floor(Math.random() * 1e7)).padStart(7, '0');
  const national = `70${tail}`;
  usedPhones.add(`+93${national}`);
  return { e164: `+93${national}`, local: `0${national}` };
}

describe.skipIf(!hasDb)('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, ProtectedTestModule],
    })
      // Many requests come from one IP in tests; the per-IP limiter is not what's under test here.
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
  });

  afterAll(async () => {
    const phones = [...usedPhones];
    await prisma.otpCode.deleteMany({ where: { phoneNumber: { in: phones } } });
    await prisma.user.deleteMany({ where: { phoneNumber: { in: phones } } });
    await app.close();
  });

  const sendOtp = (phone_number: string) =>
    request(app.getHttpServer()).post('/auth/send-otp').send({ phone_number });
  const verifyOtp = (phone_number: string, otp_code: string) =>
    request(app.getHttpServer()).post('/auth/verify-otp').send({ phone_number, otp_code });
  /** Sends a code and returns it (the mock gateway exposes it as dev_otp). */
  const requestCode = async (phone: string): Promise<string> => {
    const res = await sendOtp(phone).expect(200);
    return res.body.dev_otp as string;
  };
  const wrongCode = (code: string) => (code === '000000' ? '111111' : '000000');

  describe('POST /auth/send-otp', () => {
    it('rejects invalid phone numbers with field errors', async () => {
      for (const bad of ['', '123', '0699123456', '+14155552671', '07991234567']) {
        const res = await sendOtp(bad).expect(400);
        expect(res.body.errors[0].field).toBe('phone_number');
      }
      await request(app.getHttpServer()).post('/auth/send-otp').send({}).expect(400);
    });

    it('sends a 6-digit code and stores only its hash', async () => {
      const phone = newPhone();
      const res = await sendOtp(phone.e164).expect(200);
      expect(res.body.dev_otp).toMatch(/^\d{6}$/);
      expect(res.body.expires_in).toBe(300);

      const row = await prisma.otpCode.findFirstOrThrow({ where: { phoneNumber: phone.e164 } });
      expect(row.codeHash).not.toContain(res.body.dev_otp);
      expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('stores every spelling of a number under one canonical +93 form', async () => {
      const phone = newPhone();
      const persian = phone.local.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
      for (const spelling of [phone.local, phone.e164, `0093${phone.e164.slice(3)}`, persian]) {
        await prisma.otpCode.deleteMany({ where: { phoneNumber: phone.e164 } }); // skip cooldown
        await sendOtp(spelling).expect(200);
        expect(await prisma.otpCode.count({ where: { phoneNumber: phone.e164 } })).toBe(1);
      }
    });

    it('enforces the resend cooldown', async () => {
      const phone = newPhone();
      await sendOtp(phone.e164).expect(200);
      const res = await sendOtp(phone.e164).expect(429);
      expect(res.body.retry_after).toBeGreaterThan(0);
    });

    it('enforces the hourly cap per phone', async () => {
      const phone = newPhone();
      for (let i = 0; i < 5; i++) {
        await sendOtp(phone.e164).expect(200);
        // Age every row past the cooldown so only the hourly cap can block the next send.
        await prisma.otpCode.updateMany({
          where: { phoneNumber: phone.e164 },
          data: { createdAt: new Date(Date.now() - 120_000) },
        });
      }
      const res = await sendOtp(phone.e164).expect(429);
      expect(res.body.message).toMatch(/too many/i);
    });

    it('a newer code invalidates the previous one', async () => {
      const phone = newPhone();
      const first = await requestCode(phone.e164);
      await prisma.otpCode.updateMany({
        where: { phoneNumber: phone.e164 },
        data: { createdAt: new Date(Date.now() - 120_000) },
      });
      const second = await requestCode(phone.e164);
      if (first !== second) await verifyOtp(phone.e164, first).expect(401);
      await verifyOtp(phone.e164, second).expect(200);
    });

    /** An app whose WhatsApp gateway is down; `fallback` is OTP_DEV_FALLBACK while it is built. */
    const appWithFailingGateway = async (fallback: 'true' | 'false') => {
      const before = process.env.OTP_DEV_FALLBACK;
      process.env.OTP_DEV_FALLBACK = fallback;
      try {
        const failing = await Test.createTestingModule({ imports: [AppModule] })
          .overrideGuard(ThrottlerGuard)
          .useValue({ canActivate: () => true })
          .overrideProvider(OtpGateway)
          .useValue({ send: async () => Promise.reject(new Error('gateway down')) })
          .compile();
        const failingApp = failing.createNestApplication();
        await failingApp.init();
        return failingApp;
      } finally {
        if (before === undefined) delete process.env.OTP_DEV_FALLBACK;
        else process.env.OTP_DEV_FALLBACK = before;
      }
    };

    it('does not keep the code or burn quota when the OTP gateway fails (fallback off)', async () => {
      const failingApp = await appWithFailingGateway('false');
      try {
        const phone = newPhone();
        await request(failingApp.getHttpServer())
          .post('/auth/send-otp')
          .send({ phone_number: phone.e164 })
          .expect(503);
        expect(await prisma.otpCode.count({ where: { phoneNumber: phone.e164 } })).toBe(0);
      } finally {
        await failingApp.close();
      }
    });

    it('leaves the code the person already holds valid when a resend cannot be delivered', async () => {
      const phone = newPhone();
      const held = await requestCode(phone.e164);
      // Past the resend cooldown, so the next send is allowed.
      await prisma.otpCode.updateMany({
        where: { phoneNumber: phone.e164 },
        data: { createdAt: new Date(Date.now() - 5 * 60_000) },
      });
      const failingApp = await appWithFailingGateway('false');
      try {
        await request(failingApp.getHttpServer())
          .post('/auth/send-otp')
          .send({ phone_number: phone.e164 })
          .expect(503);
      } finally {
        await failingApp.close();
      }
      await verifyOtp(phone.e164, held).expect(200);
    });

    it('hands the code back when the gateway fails and the dev fallback is on, so sign-in is never blocked', async () => {
      const failingApp = await appWithFailingGateway('true');
      try {
        const phone = newPhone();
        const res = await request(failingApp.getHttpServer())
          .post('/auth/send-otp')
          .send({ phone_number: phone.e164 })
          .expect(200);
        expect(res.body.dev_otp).toMatch(/^\d{6}$/);
        const login = await request(failingApp.getHttpServer())
          .post('/auth/verify-otp')
          .send({ phone_number: phone.e164, otp_code: res.body.dev_otp })
          .expect(200);
        expect(login.body.access_token).toEqual(expect.any(String));
      } finally {
        await failingApp.close();
      }
    });
  });

  describe('POST /auth/verify-otp', () => {
    it('creates a USER on first login and returns a valid JWT', async () => {
      const phone = newPhone();
      const code = await requestCode(phone.e164);

      const res = await verifyOtp(phone.local, code).expect(200); // local spelling on purpose
      expect(res.body).toMatchObject({
        token_type: 'Bearer',
        is_new_user: true,
        user: { phone_number: phone.e164, role: 'USER', full_name: null, avatar: null, enable_daily_motivation: true, has_seen_welcome: false, welcome_listing_credits: 1 },
      });

      const payload = await jwt.verifyAsync(res.body.access_token);
      expect(payload).toMatchObject({ sub: res.body.user.id, role: 'USER' });
      expect(payload.exp - payload.iat).toBe(res.body.expires_in);
      expect(await prisma.user.count({ where: { phoneNumber: phone.e164 } })).toBe(1);
    });

    it('gives the welcome gift once, to the new account only', async () => {
      const phone = newPhone();
      const first = await verifyOtp(phone.e164, await requestCode(phone.e164)).expect(200);
      expect(first.body.user.welcome_listing_credits).toBe(1);
      await prisma.user.update({ where: { id: first.body.user.id }, data: { welcomeListingCredits: 0 } }); // spent
      await prisma.otpCode.updateMany({ where: { phoneNumber: phone.e164 }, data: { createdAt: new Date(Date.now() - 120_000) } });
      const again = await verifyOtp(phone.e164, await requestCode(phone.e164)).expect(200);
      expect(again.body.user.welcome_listing_credits).toBe(0); // signing in again does not refill it
    });

    it('logs an existing user back in without creating a duplicate', async () => {
      const phone = newPhone();
      const first = await verifyOtp(phone.e164, await requestCode(phone.e164)).expect(200);
      await prisma.otpCode.updateMany({
        where: { phoneNumber: phone.e164 },
        data: { createdAt: new Date(Date.now() - 120_000) },
      });
      const second = await verifyOtp(phone.local, await requestCode(phone.e164)).expect(200);

      expect(second.body.is_new_user).toBe(false);
      expect(second.body.user.id).toBe(first.body.user.id);
      expect(await prisma.user.count({ where: { phoneNumber: phone.e164 } })).toBe(1);
    });

    it('accepts Persian digits in the code', async () => {
      const phone = newPhone();
      const code = await requestCode(phone.e164);
      const persian = code.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
      await verifyOtp(phone.e164, persian).expect(200);
    });

    it('rejects a wrong code and creates no user', async () => {
      const phone = newPhone();
      const code = await requestCode(phone.e164);
      await verifyOtp(phone.e164, wrongCode(code)).expect(401);
      expect(await prisma.user.count({ where: { phoneNumber: phone.e164 } })).toBe(0);
    });

    it('rejects malformed codes with 400', async () => {
      const phone = newPhone();
      await requestCode(phone.e164);
      for (const bad of ['', '12345', '1234567', '12a456']) {
        await verifyOtp(phone.e164, bad).expect(400);
      }
    });

    it('rejects when no code was requested', async () => {
      await verifyOtp(newPhone().e164, '123456').expect(401);
    });

    it('rejects an expired code', async () => {
      const phone = newPhone();
      const code = await requestCode(phone.e164);
      await prisma.otpCode.updateMany({
        where: { phoneNumber: phone.e164 },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await verifyOtp(phone.e164, code).expect(401);
    });

    it('is single use: replaying a used code fails', async () => {
      const phone = newPhone();
      const code = await requestCode(phone.e164);
      await verifyOtp(phone.e164, code).expect(200);
      await verifyOtp(phone.e164, code).expect(401);
    });

    it('locks the code after 5 wrong attempts, even for the right code', async () => {
      const phone = newPhone();
      const code = await requestCode(phone.e164);
      for (let i = 0; i < 5; i++) await verifyOtp(phone.e164, wrongCode(code)).expect(401);
      await verifyOtp(phone.e164, code).expect(401);
      expect(await prisma.user.count({ where: { phoneNumber: phone.e164 } })).toBe(0);
    });

    it('lets exactly one of several simultaneous requests succeed', async () => {
      const phone = newPhone();
      const code = await requestCode(phone.e164);
      const results = await Promise.all(
        Array.from({ length: 5 }, () => verifyOtp(phone.e164, code)),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 401)).toHaveLength(4);
      expect(await prisma.user.count({ where: { phoneNumber: phone.e164 } })).toBe(1);
    });

    it('stays single use when requests interleave after claiming their attempt', async () => {
      // Hold every request just after it has claimed an attempt, so all of them pass the
      // "not consumed yet" filter and only the final atomic consume can pick a single winner.
      const phone = newPhone();
      const code = await requestCode(phone.e164);
      const original = prisma.otpCode.updateMany.bind(prisma.otpCode);
      const spy = vi.spyOn(prisma.otpCode, 'updateMany').mockImplementation(((args: any) =>
        original(args).then(async (result: unknown) => {
          if (args?.data?.attempts) await new Promise((resolve) => setTimeout(resolve, 150));
          return result;
        })) as typeof prisma.otpCode.updateMany);
      try {
        const results = await Promise.all(
          Array.from({ length: 5 }, () => verifyOtp(phone.e164, code)),
        );
        expect(results.filter((r) => r.status === 200)).toHaveLength(1);
        expect(results.filter((r) => r.status === 401)).toHaveLength(4);
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('JwtAuthGuard', () => {
    it('lets a valid token through and rejects missing or bad ones', async () => {
      const phone = newPhone();
      const login = await verifyOtp(phone.e164, await requestCode(phone.e164)).expect(200);
      const server = app.getHttpServer();

      const ok = await request(server)
        .get('/test-protected')
        .set('Authorization', `Bearer ${login.body.access_token}`)
        .expect(200);
      expect(ok.body).toEqual({ id: login.body.user.id, role: 'USER' });

      await request(server).get('/test-protected').expect(401);
      await request(server).get('/test-protected').set('Authorization', 'Bearer nonsense').expect(401);
      const forged = await new JwtService({ secret: 'some-other-secret-some-other-secret!!' }).signAsync({
        sub: login.body.user.id,
        role: 'ADMIN',
      });
      await request(server).get('/test-protected').set('Authorization', `Bearer ${forged}`).expect(401);
    });
  });
});
