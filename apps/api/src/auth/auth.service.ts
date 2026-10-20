import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OTP_LENGTH } from '@bongah/validation';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { Prisma, Role, type User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { readJwtSettings } from './auth.config.js';
import {
  OTP_MAX_SENDS_PER_HOUR,
  OTP_MAX_VERIFY_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_RETENTION_MS,
  OTP_TTL_SECONDS,
} from './auth.constants.js';
import type { JwtPayload } from './auth.types.js';
import { accountBanned } from './guards/jwt-auth.guard.js';
import { toUser } from '../users/user.mapper.js';
import type { SendOtpResponse, VerifyOtpResponse } from './dto/auth-response.dto.js';
import { OtpGateway, readOtpDevFallback, readOtpProvider } from './otp/index.js';
import { WELCOME_LISTING_CREDITS } from '../property/property.constants.js';
import { readReferralSettings } from '../referral/referral.config.js';
import { findReferrerId, grantSignupRewards } from '../referral/referral.signup.js';

const HOUR_MS = 60 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly secret: string;
  private readonly accessTokenTtlSeconds: number;
  private readonly exposeDevOtp: boolean;
  private readonly devFallback: boolean;
  private readonly maxRewardedInvites: number;
  private readonly referralContactCredits: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly otp: OtpGateway,
    config: ConfigService,
  ) {
    const settings = readJwtSettings(config);
    this.secret = settings.secret;
    this.accessTokenTtlSeconds = settings.expiresInSeconds;
    const referral = readReferralSettings(config);
    this.maxRewardedInvites = referral.maxRewardedInvites;
    this.referralContactCredits = referral.contactCredits;
    // Only the mock gateway hands the code back in the HTTP response (the app then shows it): nothing is sent anywhere
    // in mock mode, so without this nobody could ever read the code. In production the mock is a deliberate, warned-about
    // choice (see AuthModule); the real WhatsApp gateway never returns the code.
    this.exposeDevOtp = readOtpProvider(config).provider === 'mock';
    // A real gateway that fails (credentials, template, a number Meta does not allow yet) must not lock a developer out
    // of the app: where this is on, the code is handed back like in mock mode. Off in production unless asked for.
    this.devFallback = readOtpDevFallback(config);
  }

  /**
   * Creates a one-time code for the phone number and sends it to the user's WhatsApp.
   * Behaves identically for new and existing users so it can't be used to discover accounts.
   */
  async sendOtp(phone: string): Promise<SendOtpResponse> {
    const now = new Date();

    // Newest first. recent[0] drives the resend cooldown; the OTP_MAX_SENDS_PER_HOUR-th
    // entry (if there is one) is the send that must age out of the window before another is allowed.
    const recent = await this.prisma.otpCode.findMany({
      where: { phoneNumber: phone, createdAt: { gt: new Date(now.getTime() - HOUR_MS) } },
      orderBy: { createdAt: 'desc' },
      take: OTP_MAX_SENDS_PER_HOUR,
      select: { createdAt: true },
    });

    if (recent.length > 0) {
      const wait = OTP_RESEND_COOLDOWN_SECONDS - secondsBetween(recent[0].createdAt, now);
      if (wait > 0) {
        throw tooManyRequests('Please wait before requesting another code.', wait);
      }
    }
    if (recent.length >= OTP_MAX_SENDS_PER_HOUR) {
      const oldestInWindow = recent[recent.length - 1].createdAt;
      const wait = Math.ceil((oldestInWindow.getTime() + HOUR_MS - now.getTime()) / 1000);
      throw tooManyRequests('Too many codes requested. Try again later.', Math.max(wait, 1));
    }

    const code = generateOtp();

    const otp = await this.prisma.$transaction(async (tx) => {
      await tx.otpCode.deleteMany({
        where: { phoneNumber: phone, createdAt: { lt: new Date(now.getTime() - OTP_RETENTION_MS) } },
      });
      return tx.otpCode.create({
        data: {
          phoneNumber: phone,
          codeHash: this.hash(phone, code),
          expiresAt: new Date(now.getTime() + OTP_TTL_SECONDS * 1000),
        },
      });
    });

    let handedBack = this.exposeDevOtp;
    try {
      await this.otp.send(phone, code);
    } catch (error) {
      this.logger.error(`OTP gateway failed for ${maskPhone(phone)}`, error instanceof Error ? error.stack : error);
      if (!this.devFallback) {
        // Don't make the user wait out the cooldown (or burn hourly quota) for a code we never sent. Only the new code
        // goes: the one the person may already hold from the last request stays valid, because it is only replaced
        // once the new one is really on its way.
        await this.prisma.otpCode.delete({ where: { id: otp.id } }).catch(() => undefined);
        throw new ServiceUnavailableException('Could not send the verification code. Please try again.');
      }
      this.logger.warn(
        `OTP_DEV_FALLBACK: the code for ${maskPhone(phone)} was not delivered; it is returned in the response instead.`,
      );
      handedBack = true;
    }

    // A new code replaces any earlier one: only the newest can ever be used.
    await this.prisma.otpCode.updateMany({
      where: { phoneNumber: phone, consumedAt: null, id: { not: otp.id } },
      data: { consumedAt: now },
    });

    return {
      message: 'Verification code sent.',
      expires_in: OTP_TTL_SECONDS,
      resend_after: OTP_RESEND_COOLDOWN_SECONDS,
      ...(handedBack ? { dev_otp: code } : {}),
    };
  }

  /**
   * Checks the code, signs the user in (creating the account on first login) and returns a JWT.
   *
   * `referralCode` (already normalised) only matters on a first login: the new account is linked to
   * the inviter and both get their reward, in the same transaction that creates the account.
   * An existing user's code is ignored, so a returning user can't be tricked into, or blocked by, it.
   */
  async verifyOtp(phone: string, code: string, referralCode?: string): Promise<VerifyOtpResponse> {
    const now = new Date();

    const otp = await this.prisma.otpCode.findFirst({
      where: { phoneNumber: phone, consumedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) throw invalidCode();

    // Spend an attempt atomically *before* comparing, so parallel guesses can't exceed the limit.
    const attempt = await this.prisma.otpCode.updateMany({
      where: { id: otp.id, consumedAt: null, attempts: { lt: OTP_MAX_VERIFY_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    if (attempt.count !== 1) throw invalidCode();

    if (!this.matches(otp.codeHash, this.hash(phone, code))) throw invalidCode();

    // Only after the OTP is proven: an unknown code is refused here, BEFORE the OTP is spent, so the
    // person can fix the code or carry on without one. Checked after the OTP so nobody can use this
    // endpoint to find out which referral codes exist.
    let referrerId: string | null = null;
    if (referralCode && !(await this.prisma.user.findUnique({ where: { phoneNumber: phone }, select: { id: true } }))) {
      referrerId = await findReferrerId(this.prisma, referralCode);
      if (!referrerId) {
        throw new BadRequestException({
          message: 'This referral code does not exist.',
          code: 'INVALID_REFERRAL_CODE',
        });
      }
    }

    // Single use, even if the same correct code arrives twice at the same instant.
    const consumed = await this.prisma.otpCode.updateMany({
      where: { id: otp.id, consumedAt: null },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) throw invalidCode();

    const found = await this.findOrCreateUser(phone, referrerId);
    const { isNewUser, referralApplied } = found;
    // A suspended account cannot sign in. (Checked after the code is proven, so this endpoint cannot
    // be used to find out which numbers are banned.)
    if (found.user.bannedAt) throw accountBanned();
    const user = await this.prisma.user.update({ where: { id: found.user.id }, data: { lastLoginAt: now } });

    const payload: JwtPayload = { sub: user.id, role: user.role };
    return {
      access_token: await this.jwt.signAsync(payload),
      token_type: 'Bearer',
      expires_in: this.accessTokenTtlSeconds,
      is_new_user: isNewUser,
      referral_applied: referralApplied,
      user: toUser(user),
    };
  }

  private async findOrCreateUser(
    phone: string,
    referrerId: string | null,
  ): Promise<{ user: User; isNewUser: boolean; referralApplied: boolean }> {
    const existing = await this.prisma.user.findUnique({ where: { phoneNumber: phone } });
    if (existing) return { user: existing, isNewUser: false, referralApplied: false };

    try {
      // The account and the rewards it earns are created together or not at all.
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            phoneNumber: phone,
            role: Role.USER,
            referredById: referrerId,
            welcomeListingCredits: WELCOME_LISTING_CREDITS,
          },
        });
        if (referrerId) {
          await grantSignupRewards(tx, {
            referrerId,
            inviteeId: user.id,
            maxRewardedInvites: this.maxRewardedInvites,
            contactCredits: this.referralContactCredits,
          });
        }
        return { user, isNewUser: true, referralApplied: referrerId !== null };
      });
    } catch (error) {
      // Lost a race with a concurrent first login for the same number: use the account that won.
      // (It got no referral rewards from us: our transaction rolled back whole.)
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const user = await this.prisma.user.findUnique({ where: { phoneNumber: phone } });
        if (user) return { user, isNewUser: false, referralApplied: false };
      }
      throw error;
    }
  }

  /** Keyed hash (HMAC), bound to the phone number, so a leaked table can't be reversed cheaply. */
  private hash(phone: string, code: string): string {
    return createHmac('sha256', this.secret).update(`otp:${phone}:${code}`).digest('hex');
  }

  private matches(expectedHex: string, actualHex: string): boolean {
    const expected = Buffer.from(expectedHex, 'hex');
    const actual = Buffer.from(actualHex, 'hex');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}

function generateOtp(): string {
  return randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, '0');
}

function secondsBetween(earlier: Date, later: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / 1000);
}

function maskPhone(phone: string): string {
  return `${phone.slice(0, 5)}****${phone.slice(-3)}`;
}

function invalidCode(): UnauthorizedException {
  // One message for wrong, expired, used and locked codes: don't tell an attacker which it was.
  return new UnauthorizedException('Invalid or expired verification code.');
}

function tooManyRequests(message: string, retryAfterSeconds: number): HttpException {
  return new HttpException(
    {
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      error: 'Too Many Requests',
      message,
      retry_after: retryAfterSeconds,
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
