import { AgencyVerificationStatus, PropertyStatus } from '../src/generated/prisma/client.js';
import { hasDb, propertyBody, TestContext, uniqueProvince, type TestUser } from './helpers.js';

type Pin = { id: string; agency_name: string; address: string; lat: number; lng: number; active_listings: number };

describe.skipIf(!hasDb)('Agencies on the map, and the seller on a listing (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await TestContext.create();
  });
  afterAll(async () => {
    await ctx.close();
  });

  let counter = 0;
  /** A subscribed agency with a unique name; `verified` and `pinned` decide whether the map may show it. */
  const makeAgency = async (opts: { verified?: boolean; pinned?: boolean; status?: AgencyVerificationStatus } = {}) => {
    const agency = await ctx.agency(true);
    const status = opts.status ?? (opts.verified === false ? AgencyVerificationStatus.PENDING : AgencyVerificationStatus.VERIFIED);
    const name = `Map Agency ${Date.now()}-${++counter}`;
    await ctx.prisma.agency.update({
      where: { id: agency.agencyId },
      data: {
        agencyName: name,
        address: 'Shahr-e Naw, Kabul',
        verificationStatus: status,
        isVerified: status === AgencyVerificationStatus.VERIFIED,
        // A decided agency says when (CHECK constraint); a pending one has no decision date.
        reviewedAt: status === AgencyVerificationStatus.PENDING ? null : new Date(),
        // A rejection must say why (CHECK constraint).
        ...(status === AgencyVerificationStatus.REJECTED ? { rejectionReason: 'Licence unreadable' } : {}),
        ...(opts.pinned === false ? {} : { lat: 34.5281, lng: 69.1723 }),
      },
    });
    return { ...agency, name };
  };
  const pins = async () => (await ctx.get('/agencies/map').expect(200)).body as Pin[];
  const pinOf = async (agency: { agencyId: string }) => (await pins()).find((p) => p.id === agency.agencyId);
  const publish = async (agency: TestUser, overrides: Record<string, unknown> = {}) =>
    (await ctx.post('/properties', propertyBody({ province: uniqueProvince(), ...overrides }), agency.token).expect(201))
      .body as { id: string };

  describe('GET /agencies/map', () => {
    it('is public, short-cacheable, and lists a verified agency that placed a pin', async () => {
      const agency = await makeAgency();
      const res = await ctx.get('/agencies/map').expect(200);
      expect(res.headers['cache-control']).toBe('public, max-age=60');
      expect(res.body.find((p: Pin) => p.id === agency.agencyId)).toEqual({
        id: agency.agencyId,
        agency_name: agency.name,
        address: 'Shahr-e Naw, Kabul',
        lat: 34.5281,
        lng: 69.1723,
        active_listings: 0,
      });
    });

    it('does not show an agency that is unverified, rejected, banned, or has no pin', async () => {
      const pending = await makeAgency({ verified: false });
      const rejected = await makeAgency({ status: AgencyVerificationStatus.REJECTED });
      const unpinned = await makeAgency({ pinned: false });
      const banned = await makeAgency();
      await ctx.prisma.user.update({ where: { id: banned.id }, data: { bannedAt: new Date() } });

      const shown = new Set((await pins()).map((p) => p.id));
      for (const hidden of [pending, rejected, unpinned, banned]) expect(shown.has(hidden.agencyId)).toBe(false);
    });

    it('shows an agency again when it is verified later', async () => {
      const agency = await makeAgency({ verified: false });
      expect(await pinOf(agency)).toBeUndefined();
      await ctx.prisma.agency.update({
        where: { id: agency.agencyId },
        data: { verificationStatus: AgencyVerificationStatus.VERIFIED, isVerified: true, reviewedAt: new Date() },
      });
      expect(await pinOf(agency)).toBeDefined();
    });

    it('counts only listings a visitor could open: active ones, not sold or archived', async () => {
      const agency = await makeAgency();
      const [active, sold, archived] = [await publish(agency), await publish(agency), await publish(agency)];
      await publish(agency); // a second active one
      await ctx.prisma.property.update({ where: { id: sold.id }, data: { status: PropertyStatus.SOLD } });
      await ctx.del(`/properties/${archived.id}`, agency.token).expect(204);
      expect(active.id).toBeDefined();

      expect((await pinOf(agency))?.active_listings).toBe(2);
    });

    it('does not give out anything private: no licence, owner, phone or account id', async () => {
      const agency = await makeAgency();
      const pin = await pinOf(agency);
      expect(Object.keys(pin ?? {}).sort()).toEqual(['active_listings', 'address', 'agency_name', 'id', 'lat', 'lng']);
    });
  });

  describe('agency_name on a listing', () => {
    it("is the agency's name on its own listing, in the list and on the detail page", async () => {
      const agency = await makeAgency();
      const province = uniqueProvince();
      const created = (await ctx.post('/properties', propertyBody({ province }), agency.token).expect(201)).body;
      expect(created.agency_name).toBe(agency.name);

      const detail = (await ctx.get(`/properties/${created.id}`).expect(200)).body;
      expect(detail.agency_name).toBe(agency.name);

      const list = (await ctx.get(`/properties?province=${encodeURIComponent(province)}`).expect(200)).body;
      expect(list.data.map((p: { id: string; agency_name: string | null }) => [p.id, p.agency_name])).toEqual([
        [created.id, agency.name],
      ]);
    });

    it('is null for a private owner', async () => {
      const owner = await ctx.user();
      const created = (await ctx.post('/properties', propertyBody({ province: uniqueProvince() }), owner.token).expect(201)).body;
      expect(created.agency_name).toBeNull();
      expect((await ctx.get(`/properties/${created.id}`).expect(200)).body.agency_name).toBeNull();
    });

    it('follows an edit: still the agency name after the listing is updated', async () => {
      const agency = await makeAgency();
      const created = await publish(agency);
      const updated = (await ctx.patch(`/properties/${created.id}`, { title: 'A new title for it' }, agency.token).expect(200)).body;
      expect(updated.agency_name).toBe(agency.name);
    });
  });
});
