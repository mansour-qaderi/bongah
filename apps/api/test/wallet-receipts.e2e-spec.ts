import { randomUUID } from 'node:crypto';
import type { PaymentSummary, Receipt, Wallet } from '@bongah/shared-types';
import { hasDb, TestContext } from './helpers.js';

const DAY = 86_400_000;
const RECEIPT_NUMBER = /^BNG-\d{6}-\d{6}$/;

describe.skipIf(!hasDb)('Wallet, payment history and receipts (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await TestContext.create();
  });
  afterAll(async () => {
    await ctx.close();
  });

  const near = (actual: number, expected: number, toleranceMs = 60_000) =>
    expect(Math.abs(actual - expected)).toBeLessThan(toleranceMs);

  describe('receipts', () => {
    it('are issued when the payment is confirmed, with the details a customer needs', async () => {
      const agency = await ctx.agency(false);
      await ctx.prisma.user.update({ where: { id: agency.id }, data: { fullName: 'Ahmad Zahir' } });
      const id = await ctx.pay(agency, { purpose: 'SUBSCRIPTION', package_type: 'QUARTERLY' });

      const res = await ctx.get(`/hesabpay/payments/${id}/receipt`, agency.token).expect(200);
      const receipt = res.body as Receipt;
      expect(receipt).toMatchObject({
        payment_id: id,
        purpose: 'SUBSCRIPTION',
        package_type: 'QUARTERLY',
        quantity: null,
        property: null,
        amount: 2400,
        currency: 'AFGHANI',
        payer: { full_name: 'Ahmad Zahir', phone_number: agency.phone, agency_name: 'Test Agency' },
      });
      expect(receipt.receipt_number).toMatch(RECEIPT_NUMBER);
      expect(receipt.reference).toEqual(expect.any(String));
      near(new Date(receipt.issued_at).getTime(), Date.now());

      // The receipt number and the confirmation time are written together with the status.
      const row = await ctx.prisma.transaction.findUniqueOrThrow({ where: { id } });
      expect(row.status).toBe('SUCCESS');
      expect(row.receiptNumber).toBe(receipt.receipt_number);
      expect(row.paidAt!.toISOString()).toBe(receipt.issued_at);
    });

    it('carry the listing for ladder and featured payments and the days / credits bought', async () => {
      const owner = await ctx.user();
      const listing = await ctx.listing(owner, { title: 'Receipt villa' });
      const featuredId = await ctx.pay(owner, { purpose: 'FEATURED_AD', property_id: listing.id });
      const featured = (await ctx.get(`/hesabpay/payments/${featuredId}/receipt`, owner.token).expect(200)).body as Receipt;
      expect(featured).toMatchObject({
        purpose: 'FEATURED_AD',
        quantity: 7,
        amount: 100,
        property: { id: listing.id, title: 'Receipt villa' },
        payer: { agency_name: null },
      });

      const buyer = await ctx.user();
      const creditsId = await ctx.pay(buyer, { purpose: 'CONTACT_CREDITS' });
      const credits = (await ctx.get(`/hesabpay/payments/${creditsId}/receipt`, buyer.token).expect(200)).body as Receipt;
      expect(credits).toMatchObject({ purpose: 'CONTACT_CREDITS', quantity: 10, amount: 40, property: null });
    });

    it('get unique, increasing numbers even when many payments are confirmed at once', async () => {
      const users = await Promise.all(Array.from({ length: 6 }, () => ctx.user()));
      const started = await Promise.all(
        users.map((user) => ctx.pay(user, { purpose: 'MAP_LOCATION' }, false)),
      );
      await Promise.all(started.map((id) => ctx.confirmPayment(id)));
      const rows = await ctx.prisma.transaction.findMany({ where: { id: { in: started } } });
      const numbers = rows.map((row) => row.receiptNumber!);
      expect(new Set(numbers).size).toBe(6);
      for (const number of numbers) expect(number).toMatch(RECEIPT_NUMBER);
    });

    it('use the month in Kabul, and keep counting across months', async () => {
      const [{ n }] = await ctx.prisma.$queryRaw<{ n: string }[]>`SELECT next_receipt_number() AS n`;
      const [{ m }] = await ctx.prisma.$queryRaw<{ m: string }[]>`
        SELECT to_char((now() AT TIME ZONE 'UTC') + interval '270 minutes', 'YYYYMM') AS m`;
      expect(n).toMatch(RECEIPT_NUMBER);
      expect(n.slice(4, 10)).toBe(m);
      const [{ n: next }] = await ctx.prisma.$queryRaw<{ n: string }[]>`SELECT next_receipt_number() AS n`;
      expect(Number(next.slice(11))).toBeGreaterThan(Number(n.slice(11)));
    });

    it('are not issued for a payment that has not succeeded (409), and never repeat on a webhook replay', async () => {
      const user = await ctx.user();
      const id = await ctx.pay(user, { purpose: 'MAP_LOCATION' }, false);
      const res = await ctx.get(`/hesabpay/payments/${id}/receipt`, user.token).expect(409);
      expect(res.body.code).toBe('RECEIPT_NOT_AVAILABLE');

      await ctx.confirmPayment(id);
      const first = (await ctx.get(`/hesabpay/payments/${id}/receipt`, user.token).expect(200)).body as Receipt;
      await ctx.confirmPayment(id); // HesabPay retries delivery
      const again = (await ctx.get(`/hesabpay/payments/${id}/receipt`, user.token).expect(200)).body as Receipt;
      expect(again.receipt_number).toBe(first.receipt_number);
      expect(again.issued_at).toBe(first.issued_at);

      const failed = await ctx.pay(user, { purpose: 'MAP_LOCATION' }, false);
      await ctx.prisma.transaction.update({ where: { id: failed }, data: { status: 'FAILED' } });
      await ctx.get(`/hesabpay/payments/${failed}/receipt`, user.token).expect(409);
    });

    it('belong to the payer: someone else gets the same 404 as for a missing payment', async () => {
      const owner = await ctx.user();
      const stranger = await ctx.user();
      const id = await ctx.pay(owner, { purpose: 'MAP_LOCATION' });
      await ctx.get(`/hesabpay/payments/${id}/receipt`, stranger.token).expect(404);
      await ctx.get(`/hesabpay/payments/${randomUUID()}/receipt`, owner.token).expect(404);
      await ctx.get(`/hesabpay/payments/not-a-uuid/receipt`, owner.token).expect(400);
      await ctx.get(`/hesabpay/payments/${id}/receipt`).expect(401);
    });

    it('cannot be made up in the database: a receipt exists exactly for successful payments', async () => {
      const user = await ctx.user();
      const pending = await ctx.pay(user, { purpose: 'MAP_LOCATION' }, false);
      await expect(
        ctx.prisma.transaction.update({ where: { id: pending }, data: { receiptNumber: 'BNG-202601-000001' } }),
      ).rejects.toThrow();
      const paid = await ctx.pay(user, { purpose: 'MAP_LOCATION' });
      const other = await ctx.prisma.transaction.findUniqueOrThrow({ where: { id: paid } });
      // A second payment cannot reuse a receipt number either.
      await expect(
        ctx.prisma.transaction.update({
          where: { id: (await ctx.pay(user, { purpose: 'MAP_LOCATION' })) },
          data: { receiptNumber: other.receiptNumber },
        }),
      ).rejects.toThrow();
      // And a successful payment cannot lose its receipt.
      await expect(
        ctx.prisma.transaction.update({ where: { id: paid }, data: { receiptNumber: null } }),
      ).rejects.toThrow();
    });
  });

  describe('payment history', () => {
    it('lists my payments newest first with receipt numbers, page by page, and only mine', async () => {
      const user = await ctx.user();
      const other = await ctx.user();
      const listing = await ctx.listing(user, { title: 'History flat' });
      const a = await ctx.pay(user, { purpose: 'MAP_LOCATION' });
      await new Promise((resolve) => setTimeout(resolve, 15));
      const b = await ctx.pay(user, { purpose: 'LADDER', property_id: listing.id }, false);
      await new Promise((resolve) => setTimeout(resolve, 15));
      const c = await ctx.pay(user, { purpose: 'CONTACT_CREDITS' });
      await ctx.pay(other, { purpose: 'MAP_LOCATION' });

      const res = await ctx.get('/hesabpay/payments', user.token).expect(200);
      const list = res.body.data as PaymentSummary[];
      expect(list.map((p) => p.id)).toEqual([c, b, a]);
      expect(res.body.meta.total).toBe(3);
      expect(list[0]).toMatchObject({ purpose: 'CONTACT_CREDITS', status: 'SUCCESS', quantity: 10, amount: 40 });
      expect(list[0].receipt_number).toMatch(RECEIPT_NUMBER);
      expect(list[1]).toMatchObject({ purpose: 'LADDER', status: 'PENDING', receipt_number: null, paid_at: null, property_title: 'History flat' });
      // Nothing about the gateway leaks into the customer's list.
      expect(JSON.stringify(res.body)).not.toContain('hesabpay_tx_id');

      const page2 = await ctx.get('/hesabpay/payments?limit=2&page=2', user.token).expect(200);
      expect((page2.body.data as PaymentSummary[]).map((p) => p.id)).toEqual([a]);
      await ctx.get('/hesabpay/payments?limit=500', user.token).expect(400);
      await ctx.get('/hesabpay/payments').expect(401);
    });
  });

  describe('GET /wallet', () => {
    it('needs a token', async () => {
      await ctx.get('/wallet').expect(401);
    });

    it('shows an ordinary user their tokens, credits and latest payments, with no subscription', async () => {
      const user = await ctx.user();
      await ctx.giveTokens(user.id, 2);
      await ctx.giveContactCredits(user.id, 5);
      for (let i = 0; i < 6; i++) await ctx.pay(user, { purpose: 'MAP_LOCATION' }, false);

      const wallet = (await ctx.get('/wallet', user.token).expect(200)).body as Wallet;
      near(new Date(wallet.server_time).getTime(), Date.now());
      expect(wallet.subscription).toBeNull();
      expect(wallet.map_location).toMatchObject({ unlimited: false, tokens_available: 2 });
      expect(wallet.contact_credits).toBe(5);
      expect(wallet.contact_unlimited).toBe(false);
      expect(wallet.ladder_tokens).toBe(0);
      expect(wallet.recent_payments).toHaveLength(5); // the five newest
    });

    it('counts unspent ladder rewards', async () => {
      const user = await ctx.user();
      const invitee = await ctx.user();
      await ctx.prisma.reward.createMany({
        data: [
          { userId: user.id, inviteeId: invitee.id, type: 'LADDER_TOKEN', reason: 'REFERRER_BONUS' },
        ],
      });
      expect(((await ctx.get('/wallet', user.token).expect(200)).body as Wallet).ladder_tokens).toBe(1);
    });

    it('shows an agency with no plan as inactive, and unlimited contact only with a plan', async () => {
      const agency = await ctx.agency(false);
      const wallet = (await ctx.get('/wallet', agency.token).expect(200)).body as Wallet;
      expect(wallet.subscription).toEqual({
        is_active: false,
        package_type: null,
        started_at: null,
        ends_at: null,
        remaining_days: 0,
        remaining_seconds: 0,
        queued: [],
      });
      expect(wallet.contact_unlimited).toBe(false);
    });

    it('counts down the running plan from the server clock', async () => {
      const agency = await ctx.agency(false);
      await ctx.pay(agency, { purpose: 'SUBSCRIPTION', package_type: 'MONTHLY' });
      const wallet = (await ctx.get('/wallet', agency.token).expect(200)).body as Wallet;
      const sub = wallet.subscription!;
      expect(sub).toMatchObject({ is_active: true, package_type: 'MONTHLY', queued: [] });
      // A monthly plan is one calendar month (28 to 31 days), counted from the confirmation.
      const stored = await ctx.prisma.subscription.findFirstOrThrow({ where: { agencyId: agency.agencyId } });
      expect(new Date(sub.ends_at!).getTime()).toBe(stored.endDate.getTime());
      expect(sub.remaining_days).toBe(Math.ceil((stored.endDate.getTime() - Date.now()) / DAY));
      expect(sub.remaining_days).toBeGreaterThanOrEqual(28);
      expect(sub.remaining_days).toBeLessThanOrEqual(31);
      near(sub.remaining_seconds * 1000, stored.endDate.getTime() - Date.now());
      near(new Date(sub.started_at!).getTime(), Date.now());
      expect(wallet.contact_unlimited).toBe(true);
      expect(wallet.map_location.unlimited).toBe(true);
    });

    it('rounds partial days up and reaches zero for a lapsed plan', async () => {
      const agency = await ctx.agency(true);
      const sub = await ctx.prisma.subscription.findFirstOrThrow({ where: { agencyId: agency.agencyId } });
      await ctx.prisma.subscription.update({ where: { id: sub.id }, data: { endDate: new Date(Date.now() + 2 * DAY + 3_600_000) } });
      expect(((await ctx.get('/wallet', agency.token).expect(200)).body as Wallet).subscription!.remaining_days).toBe(3);

      const lapsed = await ctx.lapsedAgency();
      const wallet = (await ctx.get('/wallet', lapsed.token).expect(200)).body as Wallet;
      expect(wallet.subscription).toMatchObject({ is_active: false, remaining_days: 0, remaining_seconds: 0 });
      expect(wallet.contact_unlimited).toBe(false);
    });

    it('lists a plan bought in advance as queued and counts the days it adds', async () => {
      const agency = await ctx.agency(false);
      await ctx.pay(agency, { purpose: 'SUBSCRIPTION', package_type: 'MONTHLY' });
      await ctx.pay(agency, { purpose: 'SUBSCRIPTION', package_type: 'QUARTERLY' });

      const sub = ((await ctx.get('/wallet', agency.token).expect(200)).body as Wallet).subscription!;
      expect(sub.is_active).toBe(true);
      expect(sub.package_type).toBe('MONTHLY'); // the one running
      expect(sub.queued).toHaveLength(1);
      expect(sub.queued[0].package_type).toBe('QUARTERLY');
      // The queued plan starts when the running one ends and the countdown covers both.
      expect(sub.queued[0].starts_at).toBe(
        (await ctx.prisma.subscription.findFirstOrThrow({ where: { agencyId: agency.agencyId, packageType: 'MONTHLY' } })).endDate.toISOString(),
      );
      const quarterly = await ctx.prisma.subscription.findFirstOrThrow({ where: { agencyId: agency.agencyId, packageType: 'QUARTERLY' } });
      expect(new Date(sub.ends_at!).getTime()).toBe(quarterly.endDate.getTime());
      expect(sub.remaining_days).toBe(Math.ceil((quarterly.endDate.getTime() - Date.now()) / DAY));
      expect(sub.remaining_days).toBeGreaterThan(110); // one month plus three

      // The dashboard agrees with the wallet about the days left.
      const dash = await ctx.get('/agencies/me/dashboard', agency.token).expect(200);
      expect(dash.body.subscription.remaining_days).toBe(sub.remaining_days);
    });

    it('shows a plan that has not started yet as queued, not active', async () => {
      const agency = await ctx.agency(false);
      await ctx.prisma.subscription.create({
        data: {
          agencyId: agency.agencyId,
          packageType: 'MONTHLY',
          startDate: new Date(Date.now() + 5 * DAY),
          endDate: new Date(Date.now() + 35 * DAY),
        },
      });
      const sub = ((await ctx.get('/wallet', agency.token).expect(200)).body as Wallet).subscription!;
      expect(sub.is_active).toBe(false);
      expect(sub.queued).toHaveLength(1);
    });

    it('lets an admin see their own wallet (an admin has unlimited map pins and contact)', async () => {
      const admin = await ctx.admin();
      const wallet = (await ctx.get('/wallet', admin.token).expect(200)).body as Wallet;
      expect(wallet.subscription).toBeNull();
      expect(wallet.map_location.unlimited).toBe(true);
      expect(wallet.contact_unlimited).toBe(true);
    });

    it('refuses a banned account like every other endpoint', async () => {
      const admin = await ctx.admin();
      const user = await ctx.user();
      await ctx.post(`/admin/users/${user.id}/ban`, { reason: 'Wallet test' }, admin.token).expect(200);
      const res = await ctx.get('/wallet', user.token).expect(403);
      expect(res.body.code).toBe('ACCOUNT_BANNED');
    });
  });
});
