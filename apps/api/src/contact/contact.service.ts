import { ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type {
  ContactAccess,
  ContactLimitReachedBody,
  ContactQuota,
  ContactUnlockMethod as WireUnlockMethod,
  PropertyContact,
} from '@bongah/shared-types';
import { ContactUnlockMethod, Prisma, PropertyStatus, type Role } from '../generated/prisma/client.js';
import { accountPerkReason } from '../perks/perks.access.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CONTACT_SETTINGS, type ContactSettings } from './contact.config.js';
import { contactCreditBalance, spendContactCredit } from './contact.credits.js';
import { kabulDayKey, nextKabulMidnight } from './contact.time.js';

export const CONTACT_LIMIT_REACHED_CODE = 'CONTACT_LIMIT_REACHED';

interface Listing {
  id: string;
  userId: string;
  contact: PropertyContact;
}

@Injectable()
export class ContactService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONTACT_SETTINGS) private readonly settings: ContactSettings,
  ) {}

  /**
   * Whether the signed-in user can already see this listing's phone number, and what is left of
   * their allowance. Changes nothing: only {@link unlock} counts a reveal.
   *
   * The public listing and search responses never carry phone numbers, so they cannot be scraped
   * in bulk; this is the only way to one, and it is metered.
   */
  async getAccess(viewerId: string, propertyId: string): Promise<ContactAccess> {
    const now = new Date();
    const [listing, viewer] = await Promise.all([
      this.findListing(this.prisma, propertyId),
      this.findViewer(this.prisma, viewerId),
    ]);

    const quota = await this.buildQuota(this.prisma, viewerId, viewer.role, now);
    if (listing.userId === viewerId) return this.granted(listing, quota, true, null);

    const unlocked = await this.findTodaysUnlock(this.prisma, viewerId, listing.userId, now);
    return unlocked ? this.granted(listing, quota, false, null) : this.locked(quota);
  }

  /**
   * Reveals the listing's phone number to the signed-in user, in this order:
   *  1. Their own listing: shown, never counted.
   *  2. Already revealed today (same owner, any of their listings, phone or WhatsApp): shown, free.
   *  3. Agency perks: shown, unlimited.
   *  4. A free daily reveal left (CONTACT_DAILY_FREE_LIMIT per Kabul day): uses one.
   *  5. `useCredit` and a credit left: spends one. The caller must ask for this explicitly: a plain
   *     "show me the number" never costs money.
   *  6. Otherwise 403 CONTACT_LIMIT_REACHED with the quota, so the app can offer credits.
   *
   * A reveal is good for the Kabul day it was made, however it was paid for.
   *
   * The viewer's user row is locked for the whole transaction, so two simultaneous reveals cannot
   * both see "one free left", and a double-tap cannot spend two credits on the same number.
   */
  async unlock(viewerId: string, propertyId: string, useCredit: boolean): Promise<ContactAccess> {
    const now = new Date();
    return this.prisma.$transaction(async (db) => {
      const listing = await this.findListing(db, propertyId);

      // NO KEY UPDATE: serialises this user's reveals without blocking the foreign-key checks of
      // the rows we insert (the same lock the referral code takes on an inviter).
      const locked = await db.$queryRaw<{ role: Role }[]>`
        SELECT role FROM users WHERE id = ${viewerId}::uuid FOR NO KEY UPDATE`;
      if (locked.length === 0) throw new UnauthorizedException();
      const role = locked[0].role;

      if (listing.userId === viewerId) {
        return this.granted(listing, await this.buildQuota(db, viewerId, role, now), true, null);
      }

      if (await this.findTodaysUnlock(db, viewerId, listing.userId, now)) {
        return this.granted(listing, await this.buildQuota(db, viewerId, role, now), false, null);
      }

      const dayKey = kabulDayKey(now);
      const record = (method: ContactUnlockMethod, creditId: string | null) =>
        db.contactUnlockLog.create({
          data: {
            userId: viewerId,
            contactUserId: listing.userId,
            propertyId: listing.id,
            dayKey,
            method,
            creditId,
          },
        });

      let paidWith: ContactUnlockMethod | null = null;
      if (await accountPerkReason(db, viewerId, role, now)) {
        await record(ContactUnlockMethod.PERK, null);
        paidWith = ContactUnlockMethod.PERK;
      } else if ((await this.countFreeToday(db, viewerId, now)) < this.settings.dailyFreeLimit) {
        await record(ContactUnlockMethod.FREE_DAILY, null);
        paidWith = ContactUnlockMethod.FREE_DAILY;
      } else {
        const creditId = useCredit ? await spendContactCredit(db, viewerId) : null;
        if (!creditId) {
          const limitReached: ContactLimitReachedBody = {
            message: 'You have used your free phone number reveals for today.',
            code: CONTACT_LIMIT_REACHED_CODE,
            quota: await this.buildQuota(db, viewerId, role, now),
          };
          throw new ForbiddenException(limitReached);
        }
        await record(ContactUnlockMethod.CREDIT, creditId);
        paidWith = ContactUnlockMethod.CREDIT;
      }

      return this.granted(listing, await this.buildQuota(db, viewerId, role, now), false, paidWith);
    });
  }

  private async findListing(db: Prisma.TransactionClient, propertyId: string): Promise<Listing> {
    const row = await db.property.findFirst({
      where: { id: propertyId, status: { not: PropertyStatus.ARCHIVED } },
      select: {
        id: true,
        userId: true,
        user: { select: { fullName: true, phoneNumber: true } },
        agency: { select: { agencyName: true } },
      },
    });
    if (!row) throw new NotFoundException('Property not found.');
    return {
      id: row.id,
      userId: row.userId,
      contact: {
        full_name: row.user.fullName,
        phone_number: row.user.phoneNumber,
        agency_name: row.agency?.agencyName ?? null,
      },
    };
  }

  private async findViewer(db: Prisma.TransactionClient, viewerId: string): Promise<{ role: Role }> {
    const viewer = await db.user.findUnique({ where: { id: viewerId }, select: { role: true } });
    if (!viewer) throw new UnauthorizedException();
    return viewer;
  }

  private findTodaysUnlock(db: Prisma.TransactionClient, viewerId: string, contactUserId: string, now: Date) {
    return db.contactUnlockLog.findUnique({
      where: { userId_contactUserId_dayKey: { userId: viewerId, contactUserId, dayKey: kabulDayKey(now) } },
      select: { id: true },
    });
  }

  /** Only free-daily reveals use up the free allowance: a perk or credit reveal never does. */
  private countFreeToday(db: Prisma.TransactionClient, viewerId: string, now: Date): Promise<number> {
    return db.contactUnlockLog.count({
      where: { userId: viewerId, dayKey: kabulDayKey(now), method: ContactUnlockMethod.FREE_DAILY },
    });
  }

  private async buildQuota(
    db: Prisma.TransactionClient,
    viewerId: string,
    role: Role,
    now: Date,
  ): Promise<ContactQuota> {
    const [used, balance, perk] = await Promise.all([
      this.countFreeToday(db, viewerId, now),
      contactCreditBalance(db, viewerId),
      accountPerkReason(db, viewerId, role, now),
    ]);
    const limit = this.settings.dailyFreeLimit;
    return {
      free_limit: limit,
      free_used: used,
      free_remaining: Math.max(0, limit - used),
      credits: balance.total,
      referral_credits: balance.referral,
      unlimited: perk !== null,
      unlimited_reason: perk,
      resets_at: nextKabulMidnight(now).toISOString(),
    };
  }

  private granted(
    listing: Listing,
    quota: ContactQuota,
    isOwner: boolean,
    paidWith: ContactUnlockMethod | null,
  ): ContactAccess {
    return {
      unlocked: true,
      is_owner: isOwner,
      contact: listing.contact,
      quota,
      paid_with: paidWith satisfies WireUnlockMethod | null,
    };
  }

  private locked(quota: ContactQuota): ContactAccess {
    return { unlocked: false, is_owner: false, contact: null, quota, paid_with: null };
  }
}
