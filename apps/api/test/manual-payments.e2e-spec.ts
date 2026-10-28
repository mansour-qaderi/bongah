import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AdminTransactionItem, Paginated, PaymentInitiated, PaymentStatus, Receipt } from '@bongah/shared-types';
import request from 'supertest';
import { hasDb, jpegBytes, pngBytes, signWebhook, TestContext, type TestUser } from './helpers.js';

// Manual mode: the operator's own accounts, a small picture limit, and a private folder for the receipt pictures.
process.env.HESABPAY_MODE = 'manual';
process.env.MANUAL_PAY_HESABPAY_PHONE = '+93 700 000 111';
process.env.MANUAL_PAY_HESABPAY_HOLDER = 'Test Receiver';
process.env.MANUAL_PAY_CARD_NUMBER = '6037 0000 1111 2222';
process.env.MANUAL_PAY_CARD_HOLDER = 'Test Receiver';
process.env.MANUAL_PAY_CARD_BANK = 'Test Bank';
process.env.MANUAL_PAY_NOTE = 'Checked daily';
process.env.MANUAL_PAY_PROOF_MAX_BYTES = '100000';
process.env.UPLOAD_DIR = mkdtempSync(join(tmpdir(), 'bongah-proofs-'));

describe.skipIf(!hasDb)('Manual payments (e2e)', () => {
  let ctx: TestContext;
  let admin: TestUser;

  beforeAll(async () => {
    ctx = await TestContext.create();
    admin = await ctx.admin();
  });
  afterAll(async () => {
    await ctx.close();
  });

  const startSubscription = async (user: TestUser, package_type = 'MONTHLY') =>
    (await ctx.post('/hesabpay/payments', { purpose: 'SUBSCRIPTION', package_type }, user.token).expect(201)).body as PaymentInitiated;
  const uploadProof = (id: string, user: TestUser | null, bytes = jpegBytes(), type = 'image/jpeg') =>
    ctx.upload(`/hesabpay/payments/${id}/proof`, user, bytes, type);
  const sendReference = (id: string, user: TestUser | null, reference: unknown) =>
    ctx.post(`/hesabpay/payments/${id}/reference`, { reference }, user?.token);
  const statusOf = async (id: string) =>
    (await ctx.prisma.transaction.findUniqueOrThrow({ where: { id } })).status;
  const approve = (id: string, token = admin.token) => ctx.post(`/admin/transactions/${id}/approve`, {}, token);
  const force = (id: string, body: object = { reason: 'Customer phoned, money is in the account' }, token = admin.token) =>
    ctx.post(`/admin/transactions/${id}/force-activate`, body, token);
  const reject = (id: string, body: object = { reason: 'The amount on the receipt is wrong' }, token = admin.token) =>
    ctx.post(`/admin/transactions/${id}/reject`, body, token);
  const subscriptionsOf = (agencyId: string) => ctx.prisma.subscription.findMany({ where: { agencyId } });
  const auditFor = (id: string) =>
    ctx.prisma.adminAuditLog.findMany({ where: { targetType: 'payment', targetId: id }, orderBy: { createdAt: 'asc' } });

  describe('starting a payment', () => {
    it('answers with where to send the money instead of a page to go to, and records a MANUAL payment', async () => {
      const agency = await ctx.agency(false);
      const started = await startSubscription(agency);
      expect(started).toMatchObject({
        status: 'PENDING',
        method: 'MANUAL',
        payment_url: null,
        amount: 900,
        receipt_uploaded: false,
        manual: {
          note: 'Checked daily',
          accounts: [
            { kind: 'HESABPAY', number: '+93 700 000 111', holder: 'Test Receiver', bank: null },
            { kind: 'CARD', number: '6037 0000 1111 2222', holder: 'Test Receiver', bank: 'Test Bank' },
          ],
        },
      });
      const row = await ctx.prisma.transaction.findUniqueOrThrow({ where: { id: started.id } });
      expect(row).toMatchObject({ method: 'MANUAL', status: 'PENDING', receiptNumber: null });
      expect(row.hesabpayTxId).toMatch(/^manual_/);
    });

    it('delivers nothing by itself', async () => {
      const agency = await ctx.agency(false);
      await startSubscription(agency);
      expect(await subscriptionsOf(agency.agencyId)).toHaveLength(0);
    });

    it('does not accept webhooks: even one signed with the mock secret cannot mark a payment as paid', async () => {
      const agency = await ctx.agency(false);
      const started = await startSubscription(agency);
      const tx = await ctx.prisma.transaction.findUniqueOrThrow({ where: { id: started.id } });
      const raw = JSON.stringify({ transaction_id: tx.hesabpayTxId, status: 'SUCCESS' });
      await request(ctx.http)
        .post('/hesabpay/webhook')
        .set('content-type', 'application/json')
        .set('x-hesabpay-signature', signWebhook(raw))
        .send(raw)
        .expect(401);
      expect(await statusOf(started.id)).toBe('PENDING');
    });

    it('shows the accounts again to a customer who comes back to a payment that still waits', async () => {
      const user = await ctx.user();
      const started = await ctx.post('/hesabpay/payments', { purpose: 'CONTACT_CREDITS' }, user.token).expect(201);
      const again = (await ctx.get(`/hesabpay/payments/${started.body.id}`, user.token).expect(200)).body as PaymentStatus;
      expect(again).toMatchObject({ status: 'PENDING', method: 'MANUAL', receipt_uploaded: false });
      expect(again.manual?.accounts).toHaveLength(2);
    });
  });

  describe('uploading the receipt picture', () => {
    it('needs a token and the owner of the payment', async () => {
      const agency = await ctx.agency(false);
      const started = await startSubscription(agency);
      await uploadProof(started.id, null).expect(401);
      const stranger = await ctx.user();
      await uploadProof(started.id, stranger).expect(404);
    });

    it('takes a JPEG, PNG or WebP, and says the receipt is on file', async () => {
      const agency = await ctx.agency(false);
      const started = await startSubscription(agency);
      const res = await uploadProof(started.id, agency).expect(200);
      expect(res.body).toMatchObject({ id: started.id, status: 'PENDING', receipt_uploaded: true, method: 'MANUAL' });
      const row = await ctx.prisma.transaction.findUniqueOrThrow({ where: { id: started.id } });
      expect(row).toMatchObject({ proofContentType: 'image/jpeg', proofByteSize: 2000 });
      expect(row.proofImageId).not.toBeNull();
      expect(row.proofUploadedAt).not.toBeNull();
      // The customer's own list shows it too.
      const list = (await ctx.get('/hesabpay/payments', agency.token).expect(200)).body as Paginated<{ id: string; receipt_uploaded: boolean }>;
      expect(list.data.find((p) => p.id === started.id)?.receipt_uploaded).toBe(true);
    });

    it('replaces an earlier picture', async () => {
      const agency = await ctx.agency(false);
      const started = await startSubscription(agency);
      await uploadProof(started.id, agency, jpegBytes(3000)).expect(200);
      const first = await ctx.prisma.transaction.findUniqueOrThrow({ where: { id: started.id } });
      await uploadProof(started.id, agency, pngBytes(4000), 'image/png').expect(200);
      const second = await ctx.prisma.transaction.findUniqueOrThrow({ where: { id: started.id } });
      expect(second.proofImageId).not.toBe(first.proofImageId);
      expect(second).toMatchObject({ proofContentType: 'image/png', proofByteSize: 4000 });
    });

    it.each([
      ['a type that is not a picture', Buffer.from('%PDF-1.4 hello'), 'application/pdf', 415],
      ['bytes that are not the picture they claim to be', Buffer.from('<html>not a jpeg</html>'), 'image/jpeg', 415],
      ['an empty body', Buffer.alloc(0), 'image/jpeg', 400],
      ['a picture over the size limit', jpegBytes(100_001), 'image/jpeg', 413],
    ])('refuses %s', async (_label, bytes, type, status) => {
      const agency = await ctx.agency(false);
      const started = await startSubscription(agency);
      await uploadProof(started.id, agency, bytes, type).expect(status);
      expect((await ctx.prisma.transaction.findUniqueOrThrow({ where: { id: started.id } })).proofImageId).toBeNull();
    });

    it('is only for manual payments that still wait', async () => {
      const agency = await ctx.agency(false);
      const gateway = await ctx.prisma.transaction.create({
        data: {
          userId: agency.id, agencyId: agency.agencyId, amount: 900, currency: 'AFGHANI', purpose: 'SUBSCRIPTION',
          packageType: 'MONTHLY', hesabpayTxId: `gw_${Date.now()}_a`, method: 'GATEWAY',
        },
      });
      expect((await uploadProof(gateway.id, agency).expect(409)).body.code).toBe('NOT_A_MANUAL_PAYMENT');

      const done = await startSubscription(agency, 'QUARTERLY');
      await uploadProof(done.id, agency).expect(200);
      await approve(done.id).expect(200);
      expect((await uploadProof(done.id, agency).expect(409)).body.code).toBe('PAYMENT_NOT_PENDING');
    });
  });

  describe('typing in the transaction reference', () => {
    it('needs a token and the owner of the payment', async () => {
      const agency = await ctx.agency(false);
      const started = await startSubscription(agency);
      await sendReference(started.id, null, 'HP20261029001').expect(401);
      const stranger = await ctx.user();
      await sendReference(started.id, stranger, 'HP20261029001').expect(404);
    });

    it('stores it (Persian digits become 0-9), and the payment says a reference is on file', async () => {
      const agency = await ctx.agency(false);
      const started = await startSubscription(agency);
      const res = await sendReference(started.id, agency, '  HP۲۰۲۶۱۰۲۹  ۰۰۱ ').expect(200);
      expect(res.body).toMatchObject({ id: started.id, status: 'PENDING', method: 'MANUAL', reference: 'HP20261029 001', receipt_uploaded: false });
      const row = await ctx.prisma.transaction.findUniqueOrThrow({ where: { id: started.id } });
      expect(row.paymentReference).toBe('HP20261029 001');
      expect(row.referenceSubmittedAt).not.toBeNull();
      // The customer's own payment page and list show it too.
      const again = (await ctx.get(`/hesabpay/payments/${started.id}`, agency.token).expect(200)).body as PaymentStatus;
      expect(again.reference).toBe('HP20261029 001');
    });

    it('replaces an earlier one', async () => {
      const agency = await ctx.agency(false);
      const started = await startSubscription(agency);
      await sendReference(started.id, agency, 'WRONG-0001').expect(200);
      await sendReference(started.id, agency, 'RIGHT-0002').expect(200);
      expect((await ctx.prisma.transaction.findUniqueOrThrow({ where: { id: started.id } })).paymentReference).toBe('RIGHT-0002');
    });

    it.each([
      ['an empty reference', ''],
      ['one that is too short', 'ab1'],
      ['one that is too long', 'A'.repeat(65)],
      ['one with markup in it', '<b>HP12345</b>'],
      ['one that is not text', 123456],
    ])('refuses %s', async (_label, value) => {
      const agency = await ctx.agency(false);
      const started = await startSubscription(agency);
      await sendReference(started.id, agency, value).expect(400);
      expect((await ctx.prisma.transaction.findUniqueOrThrow({ where: { id: started.id } })).paymentReference).toBeNull();
    });

    it('refuses fields it does not know', async () => {
      const agency = await ctx.agency(false);
      const started = await startSubscription(agency);
      await ctx.post(`/hesabpay/payments/${started.id}/reference`, { reference: 'HP12345678', status: 'SUCCESS' }, agency.token).expect(400);
    });

    it('lets one transfer pay for one purchase: the same reference cannot be attached to a second live payment', async () => {
      const first = await ctx.agency(false);
      const second = await ctx.agency(false);
      const a = await startSubscription(first);
      const b = await startSubscription(second);
      await sendReference(a.id, first, 'Dup-Ref-777').expect(200);
      const clash = await sendReference(b.id, second, 'dup-ref-777').expect(409); // case does not matter
      expect(clash.body.code).toBe('REFERENCE_ALREADY_USED');
      expect((await ctx.prisma.transaction.findUniqueOrThrow({ where: { id: b.id } })).paymentReference).toBeNull();
      // Typing the same reference again on the same payment is fine (nothing changes hands).
      await sendReference(a.id, first, 'Dup-Ref-777').expect(200);
      // Once the first payment is refused, the reference is free again (the customer may have mistyped).
      await reject(a.id).expect(200);
      await sendReference(b.id, second, 'dup-ref-777').expect(200);
    });

    it('is only for manual payments that still wait', async () => {
      const agency = await ctx.agency(false);
      const gateway = await ctx.prisma.transaction.create({
        data: {
          userId: agency.id, agencyId: agency.agencyId, amount: 900, currency: 'AFGHANI', purpose: 'SUBSCRIPTION',
          packageType: 'MONTHLY', hesabpayTxId: `gw_${Date.now()}_ref`, method: 'GATEWAY',
        },
      });
      expect((await sendReference(gateway.id, agency, 'HP12345678').expect(409)).body.code).toBe('NOT_A_MANUAL_PAYMENT');

      const done = await startSubscription(agency, 'QUARTERLY');
      await sendReference(done.id, agency, 'HP87654321').expect(200);
      await approve(done.id).expect(200);
      expect((await sendReference(done.id, agency, 'HP00000000').expect(409)).body.code).toBe('PAYMENT_NOT_PENDING');
    });

    it('is shown to the admin, who can approve on it alone: the same delivery as a picture, not a force-activation', async () => {
      const agency = await ctx.agency(false);
      const started = await startSubscription(agency, 'QUARTERLY');
      await sendReference(started.id, agency, 'HP-ADMIN-4242').expect(200);

      const queue = (await ctx.get(`/admin/transactions?awaiting_review=true&q=${encodeURIComponent(agency.phone)}`, admin.token).expect(200)).body as Paginated<AdminTransactionItem>;
      const shown = queue.data.find((p) => p.id === started.id);
      expect(shown).toMatchObject({ reference: 'HP-ADMIN-4242', receipt_uploaded: false });
      expect(shown?.reference_submitted_at).not.toBeNull();

      // The admin can find a payment by the transaction id read off the account history.
      const found = (await ctx.get('/admin/transactions?q=hp-admin-4242', admin.token).expect(200)).body as Paginated<AdminTransactionItem>;
      expect(found.data.map((p) => p.id)).toEqual([started.id]);

      const res = await approve(started.id).expect(200);
      expect(res.body).toMatchObject({ status: 'SUCCESS', force_activated: false, reference: 'HP-ADMIN-4242' });
      expect(res.body.receipt_number).toMatch(/^BNG-\d{6}-\d{6}$/);
      const subs = await subscriptionsOf(agency.agencyId);
      expect(subs).toHaveLength(1);
      const audit = await auditFor(started.id);
      expect(audit.map((a) => a.action)).toEqual(['PAYMENT_APPROVED']);
      expect(audit[0]).toMatchObject({ metadata: { had_receipt: false, reference: 'HP-ADMIN-4242' } });
    });
  });

  describe('the admin side', () => {
    it('lists the payments awaiting review, and only to admins', async () => {
      const agency = await ctx.agency(false);
      const waiting = await startSubscription(agency);
      await uploadProof(waiting.id, agency).expect(200);
      await ctx.get('/admin/transactions?awaiting_review=true', agency.token).expect(403);

      const res = await ctx.get(`/admin/transactions?awaiting_review=true&q=${encodeURIComponent(agency.phone)}`, admin.token).expect(200);
      const item = (res.body as Paginated<AdminTransactionItem>).data.find((p) => p.id === waiting.id);
      expect(item).toMatchObject({
        status: 'PENDING', method: 'MANUAL', receipt_uploaded: true, force_activated: false, reviewed_by: null,
        agency_name: 'Test Agency', user: { id: agency.id },
      });
      expect(item?.proof_uploaded_at).not.toBeNull();

      await approve(waiting.id).expect(200);
      const after = await ctx.get(`/admin/transactions?awaiting_review=true&q=${encodeURIComponent(agency.phone)}`, admin.token).expect(200);
      expect((after.body as Paginated<AdminTransactionItem>).data.find((p) => p.id === waiting.id)).toBeUndefined();
    });

    it('serves the receipt picture to admins only', async () => {
      const agency = await ctx.agency(false);
      const started = await startSubscription(agency);
      await ctx.get(`/admin/transactions/${started.id}/proof`, admin.token).expect(404); // nothing uploaded yet
      const bytes = jpegBytes(2500);
      await uploadProof(started.id, agency, bytes).expect(200);

      const res = await request(ctx.http)
        .get(`/admin/transactions/${started.id}/proof`)
        .set('Authorization', `Bearer ${admin.token}`)
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(res.headers['content-type']).toContain('image/jpeg');
      expect(res.headers['cache-control']).toContain('no-store');
      expect((res.body as Buffer).equals(bytes)).toBe(true);

      // Not even the customer who uploaded it can fetch it through the admin route, and anonymous callers cannot.
      await ctx.get(`/admin/transactions/${started.id}/proof`, agency.token).expect(403);
      await ctx.get(`/admin/transactions/${started.id}/proof`).expect(401);
    });

    describe('approve', () => {
      it('delivers exactly what a gateway payment would: the plan, the launch gifts, a receipt number', async () => {
        const agency = await ctx.agency(false);
        const started = await startSubscription(agency, 'QUARTERLY');
        await uploadProof(started.id, agency).expect(200);

        const res = await approve(started.id).expect(200);
        expect(res.body).toMatchObject({
          id: started.id, status: 'SUCCESS', force_activated: false, reviewed_by: { id: admin.id },
        });
        expect(res.body.receipt_number).toMatch(/^BNG-\d{6}-\d{6}$/);
        const subs = await subscriptionsOf(agency.agencyId);
        expect(subs).toHaveLength(1);
        expect(subs[0]).toMatchObject({ packageType: 'QUARTERLY', status: 'ACTIVE', transactionId: started.id });
        const user = await ctx.prisma.user.findUniqueOrThrow({ where: { id: agency.id } });
        expect(user.bonusListingCredits).toBe(6); // the QUARTERLY launch gift

        // The customer can now open the digital receipt, like any paid payment.
        const receipt = (await ctx.get(`/hesabpay/payments/${started.id}/receipt`, agency.token).expect(200)).body as Receipt;
        expect(receipt.receipt_number).toBe(res.body.receipt_number);

        const audit = await auditFor(started.id);
        expect(audit.map((a) => a.action)).toEqual(['PAYMENT_APPROVED']);
        expect(audit[0]).toMatchObject({ actorId: admin.id, metadata: { had_receipt: true, purpose: 'SUBSCRIPTION' } });
      });

      it('needs a receipt picture or a transaction reference: without either it points to force-activate', async () => {
        const agency = await ctx.agency(false);
        const started = await startSubscription(agency);
        const res = await approve(started.id).expect(409);
        expect(res.body.code).toBe('RECEIPT_IMAGE_MISSING');
        expect(await statusOf(started.id)).toBe('PENDING');
        expect(await subscriptionsOf(agency.agencyId)).toHaveLength(0);
        expect(await auditFor(started.id)).toHaveLength(0);
      });

      it('is for admins, and works once', async () => {
        const agency = await ctx.agency(false);
        const started = await startSubscription(agency);
        await uploadProof(started.id, agency).expect(200);
        await approve(started.id, agency.token).expect(403);
        await approve('00000000-0000-4000-8000-000000000000').expect(404);

        await approve(started.id).expect(200);
        expect((await approve(started.id).expect(409)).body.code).toBe('PAYMENT_NOT_PENDING');
        expect(await subscriptionsOf(agency.agencyId)).toHaveLength(1);
      });

      it('delivers once when two admins approve at the same moment', async () => {
        const agency = await ctx.agency(false);
        const started = await startSubscription(agency);
        await uploadProof(started.id, agency).expect(200);
        const other = await ctx.admin();
        const results = await Promise.all([approve(started.id), approve(started.id, other.token)]);
        expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
        expect(await subscriptionsOf(agency.agencyId)).toHaveLength(1);
        expect(await auditFor(started.id)).toHaveLength(1);
      });

      it('refuses a gateway payment (there is nothing to look at)', async () => {
        const agency = await ctx.agency(false);
        const gateway = await ctx.prisma.transaction.create({
          data: {
            userId: agency.id, agencyId: agency.agencyId, amount: 900, currency: 'AFGHANI', purpose: 'SUBSCRIPTION',
            packageType: 'MONTHLY', hesabpayTxId: `gw_${Date.now()}_b`, method: 'GATEWAY',
          },
        });
        expect((await approve(gateway.id).expect(409)).body.code).toBe('NOT_A_MANUAL_PAYMENT');
      });
    });

    describe('force-activate', () => {
      it('activates a payment that has no receipt picture, and keeps the reason', async () => {
        const agency = await ctx.agency(false);
        const started = await startSubscription(agency);

        const res = await force(started.id, { reason: 'Paid in person at the office' }).expect(200);
        expect(res.body).toMatchObject({ status: 'SUCCESS', force_activated: true, receipt_uploaded: false, reviewed_by: { id: admin.id } });
        expect(res.body.receipt_number).toMatch(/^BNG-/);
        expect(await subscriptionsOf(agency.agencyId)).toHaveLength(1);

        const row = await ctx.prisma.transaction.findUniqueOrThrow({ where: { id: started.id } });
        expect(row).toMatchObject({ forceActivated: true, reviewedById: admin.id, reviewNote: 'Paid in person at the office' });
        const audit = await auditFor(started.id);
        expect(audit[0]).toMatchObject({
          action: 'PAYMENT_FORCE_ACTIVATED', actorId: admin.id,
          metadata: { reason: 'Paid in person at the office', had_receipt: false },
        });
      });

      it('needs a reason, and an admin', async () => {
        const agency = await ctx.agency(false);
        const started = await startSubscription(agency);
        await force(started.id, {}).expect(400);
        await force(started.id, { reason: 'x' }).expect(400);
        await force(started.id, { reason: 'Customer phoned', extra: 1 }).expect(400);
        await force(started.id, undefined, agency.token).expect(403);
        expect(await statusOf(started.id)).toBe('PENDING');
        expect(await subscriptionsOf(agency.agencyId)).toHaveLength(0);
      });

      it('also rescues a gateway payment whose confirmation never came', async () => {
        const agency = await ctx.agency(false);
        const gateway = await ctx.prisma.transaction.create({
          data: {
            userId: agency.id, agencyId: agency.agencyId, amount: 900, currency: 'AFGHANI', purpose: 'SUBSCRIPTION',
            packageType: 'MONTHLY', hesabpayTxId: `gw_${Date.now()}_c`, method: 'GATEWAY',
          },
        });
        await force(gateway.id).expect(200);
        expect(await subscriptionsOf(agency.agencyId)).toHaveLength(1);
        expect(await statusOf(gateway.id)).toBe('SUCCESS');
      });

      it('cannot activate what was already decided', async () => {
        const agency = await ctx.agency(false);
        const started = await startSubscription(agency);
        await reject(started.id).expect(200);
        expect((await force(started.id).expect(409)).body.code).toBe('PAYMENT_NOT_PENDING');
        expect(await subscriptionsOf(agency.agencyId)).toHaveLength(0);
      });
    });

    describe('reject', () => {
      it('refuses the payment, shows the customer why, and lets them try again', async () => {
        const agency = await ctx.agency(false);
        const started = await startSubscription(agency);
        await uploadProof(started.id, agency).expect(200);

        const res = await reject(started.id, { reason: 'The picture is not a receipt' }).expect(200);
        expect(res.body).toMatchObject({ status: 'FAILED', review_note: 'The picture is not a receipt', reviewed_by: { id: admin.id } });
        expect(await subscriptionsOf(agency.agencyId)).toHaveLength(0);

        const seen = (await ctx.get(`/hesabpay/payments/${started.id}`, agency.token).expect(200)).body as PaymentStatus;
        expect(seen).toMatchObject({ status: 'FAILED', review_note: 'The picture is not a receipt', manual: null });
        expect((await auditFor(started.id))[0]).toMatchObject({ action: 'PAYMENT_REJECTED', metadata: { had_receipt: true } });

        // A refused payment is over: no approving it afterwards, no new picture for it, and a fresh payment is fine.
        expect((await approve(started.id).expect(409)).body.code).toBe('PAYMENT_NOT_PENDING');
        await uploadProof(started.id, agency).expect(409);
        await startSubscription(agency);
      });

      it('needs a reason and an admin', async () => {
        const agency = await ctx.agency(false);
        const started = await startSubscription(agency);
        await reject(started.id, {}).expect(400);
        await reject(started.id, undefined, agency.token).expect(403);
        expect(await statusOf(started.id)).toBe('PENDING');
      });
    });
  });

  it('keeps the credits of a purchase until it is confirmed, then grants them exactly once', async () => {
    const user = await ctx.user();
    const started = await ctx.post('/hesabpay/payments', { purpose: 'CONTACT_CREDITS' }, user.token).expect(201);
    const balance = async () => (await ctx.get('/wallet', user.token).expect(200)).body.contact_credits as number;
    expect(await balance()).toBe(0);
    await uploadProof(started.body.id, user).expect(200);
    await approve(started.body.id).expect(200);
    expect(await balance()).toBe(10);
    await approve(started.body.id).expect(409);
    expect(await balance()).toBe(10);
  });
});
