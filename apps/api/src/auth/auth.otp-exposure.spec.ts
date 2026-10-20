import { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';
import { MockOtpGateway } from './otp/mock-otp.gateway.js';
import { OtpGateway } from './otp/otp-gateway.js';

/** An AuthService over a database that accepts every write, so only what sendOtp RETURNS is under test. */
function serviceWith(
  env: Record<string, string>,
  gateway: OtpGateway = new MockOtpGateway(),
  calls: string[] = [],
): AuthService {
  const tx = {
    otpCode: {
      deleteMany: async () => ({ count: 0 }),
      create: async () => ({ id: 'otp-1' }),
    },
  };
  const prisma = {
    otpCode: {
      findMany: async () => [],
      updateMany: async () => {
        calls.push('consume-older');
        return { count: 0 };
      },
      delete: async () => {
        calls.push('delete-new');
        return {};
      },
    },
    $transaction: async (run: (client: typeof tx) => unknown) => run(tx),
  } as unknown as PrismaService;
  const config = new ConfigService({ JWT_SECRET: 'unit-test-secret-0123456789-0123456789', ...env });
  return new AuthService(prisma, {} as JwtService, gateway, config);
}

describe('AuthService.sendOtp: when the code is handed back to the app', () => {
  it('returns the code in mock mode, in development and in test', async () => {
    for (const NODE_ENV of ['development', 'test']) {
      const response = await serviceWith({ OTP_PROVIDER: 'mock', NODE_ENV }).sendOtp('+93790049201');
      expect(response.dev_otp).toMatch(/^\d{6}$/);
    }
  });

  it('returns the code in mock mode on a deployed (production) server too, so a build without WhatsApp can sign in', async () => {
    const response = await serviceWith({ OTP_PROVIDER: 'mock', NODE_ENV: 'production' }).sendOtp('+93790049201');
    expect(response.dev_otp).toMatch(/^\d{6}$/);
  });

  it('never returns the code when WhatsApp is the provider', async () => {
    const sent: string[] = [];
    class Recording extends OtpGateway {
      async send(_phone: string, code: string): Promise<void> {
        sent.push(code);
      }
    }
    const response = await serviceWith({ OTP_PROVIDER: 'whatsapp', NODE_ENV: 'production' }, new Recording()).sendOtp('+93790049201');
    expect(response.dev_otp).toBeUndefined();
    expect(sent).toHaveLength(1);
    expect(JSON.stringify(response)).not.toContain(sent[0]);
  });
});

describe('AuthService.sendOtp: when the gateway fails', () => {
  class Failing extends OtpGateway {
    async send(): Promise<void> {
      throw new Error('gateway down');
    }
  }

  it('with the dev fallback off: 503, only the new code is dropped and the older one is left valid', async () => {
    const calls: string[] = [];
    const service = serviceWith({ OTP_PROVIDER: 'whatsapp', OTP_DEV_FALLBACK: 'false', NODE_ENV: 'development' }, new Failing(), calls);
    await expect(service.sendOtp('+93790049201')).rejects.toMatchObject({ status: 503 });
    expect(calls).toEqual(['delete-new']);
  });

  it('with the dev fallback on: the code comes back in the response so login is never blocked', async () => {
    const calls: string[] = [];
    const service = serviceWith({ OTP_PROVIDER: 'whatsapp', OTP_DEV_FALLBACK: 'true', NODE_ENV: 'development' }, new Failing(), calls);
    const response = await service.sendOtp('+93790049201');
    expect(response.dev_otp).toMatch(/^\d{6}$/);
    expect(calls).toEqual(['consume-older']);
  });

  it('is off by default in production: a failing gateway is a 503, never a code in the response', async () => {
    const service = serviceWith({ OTP_PROVIDER: 'whatsapp', NODE_ENV: 'production' }, new Failing());
    await expect(service.sendOtp('+93790049201')).rejects.toMatchObject({ status: 503 });
  });

  it('older codes are only replaced after the new one was sent', async () => {
    const calls: string[] = [];
    class Recording extends OtpGateway {
      async send(): Promise<void> {
        calls.push('send');
      }
    }
    await serviceWith({ OTP_PROVIDER: 'whatsapp', NODE_ENV: 'production' }, new Recording(), calls).sendOtp('+93790049201');
    expect(calls).toEqual(['send', 'consume-older']);
  });
});
