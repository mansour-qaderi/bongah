import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { Socket } from 'socket.io-client';
import type { ChatConversation, ChatMessage, ChatSendAck } from '@bongah/shared-types';
import { ChatService } from '../src/chat/chat.service.js';
import { hasDb, TestContext, type TestUser } from './helpers.js';

/** Bytes that start like a real JPEG, padded to `size`. */
const jpeg = (size = 2000) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(size - 4, 7)]);
const png = (size = 500) =>
  Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(size - 8, 1)]);

describe.skipIf(!hasDb)('Chat (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await TestContext.create();
  });
  afterAll(async () => {
    await ctx.close();
  });

  /** A buyer, a seller with a listing, and the conversation between them (opened, but empty). */
  const world = async (sellerUser?: TestUser & { agencyId?: string }) => {
    const buyer = await ctx.user();
    const seller = sellerUser ?? (await ctx.user());
    const listing = await ctx.listing(seller);
    const conversation = (await open(buyer, listing.id).expect(200)).body as ChatConversation;
    return { buyer, seller, listing, conversation, id: conversation.id };
  };

  const open = (user: TestUser, propertyId: string) => ctx.post('/chat/conversations', { property_id: propertyId }, user.token);
  const text = (body: string, client_id: string = randomUUID()) => ({ type: 'TEXT', client_id, body });
  const send = (user: TestUser, conversationId: string, message: object) =>
    ctx.post(`/chat/conversations/${conversationId}/messages`, message, user.token);
  const say = async (user: TestUser, conversationId: string, body = 'salaam') =>
    (await send(user, conversationId, text(body)).expect(201)).body as ChatMessage;
  const history = (user: TestUser, conversationId: string, query = '') =>
    ctx.get(`/chat/conversations/${conversationId}/messages${query}`, user.token);
  const list = async (user: TestUser) => (await ctx.get('/chat/conversations', user.token).expect(200)).body as ChatConversation[];
  const upload = (user: TestUser, bytes: Buffer, type = 'image/jpeg') =>
    request(ctx.http).post('/chat/images').set('Authorization', `Bearer ${user.token}`).set('Content-Type', type).send(bytes);

  describe('opening a conversation', () => {
    it('needs a token', async () => {
      await ctx.post('/chat/conversations', { property_id: randomUUID() }).expect(401);
      await ctx.get('/chat/conversations').expect(401);
    });

    it('opens the chat about a listing, and gives the same one every time', async () => {
      const { buyer, listing, conversation, seller } = await world();
      expect(conversation).toMatchObject({
        my_role: 'BUYER',
        last_message: null,
        unread_count: 0,
        last_message_at: null,
        property: { id: listing.id, title: 'Chat test apartment', price: 85000, currency: 'USD', status: 'ACTIVE', cover_image: 'https://example.com/a.jpg' },
        counterpart: { id: seller.id },
      });
      const again = (await open(buyer, listing.id).expect(200)).body;
      expect(again.id).toBe(conversation.id);
      const racing = await Promise.all(Array.from({ length: 4 }, () => open(buyer, listing.id)));
      expect(new Set(racing.map((r) => r.body.id))).toEqual(new Set([conversation.id]));
      expect(await ctx.prisma.conversation.count({ where: { propertyId: listing.id, buyerId: buyer.id } })).toBe(1);
    });

    it('shows the agency name to people chatting about an agency listing', async () => {
      const agency = await ctx.agency(true);
      const { conversation } = await world(agency);
      expect(conversation.counterpart.name).toBe('Test Agency');
      expect(conversation.counterpart.id).toBe(agency.id);
    });

    it('refuses your own listing, archived and unknown listings, and a malformed id', async () => {
      const seller = await ctx.user();
      const listing = await ctx.listing(seller);
      expect((await open(seller, listing.id).expect(409)).body.code).toBe('CANNOT_CHAT_WITH_SELF');
      const archived = await ctx.listing(seller, { status: 'ARCHIVED' });
      const buyer = await ctx.user();
      await open(buyer, archived.id).expect(404);
      await open(buyer, randomUUID()).expect(404);
      await ctx.post('/chat/conversations', { property_id: 'nope' }, buyer.token).expect(400);
      await ctx.post('/chat/conversations', { property_id: listing.id, extra: 1 }, buyer.token).expect(400);
    });

    it('keeps a conversation out of both lists until someone writes in it', async () => {
      const { buyer, seller, id } = await world();
      expect(await list(buyer)).toEqual([]);
      expect(await list(seller)).toEqual([]);
      await say(buyer, id);
      expect(await list(buyer)).toHaveLength(1);
      expect(await list(seller)).toHaveLength(1);
    });
  });

  describe('messages, history and read marks', () => {
    it('stores a message and shows it to both people, with unread counts and the other person as counterpart', async () => {
      const { buyer, seller, id, listing } = await world();
      const sent = await say(buyer, id, 'Is it still available?');
      expect(sent).toMatchObject({ conversation_id: id, sender_id: buyer.id, type: 'TEXT', body: 'Is it still available?', is_auto_reply: false, read_at: null, image_url: null, lat: null, lng: null });

      const [forBuyer] = await list(buyer);
      const [forSeller] = await list(seller);
      expect(forBuyer).toMatchObject({ id, my_role: 'BUYER', unread_count: 0, counterpart: { id: seller.id }, last_message: { id: sent.id } });
      expect(forSeller).toMatchObject({ id, my_role: 'SELLER', unread_count: 1, counterpart: { id: buyer.id }, last_message: { id: sent.id }, property: { id: listing.id } });
    });

    it('orders conversations by their newest message', async () => {
      const buyer = await ctx.user();
      const [a, b] = [await ctx.listing(await ctx.user()), await ctx.listing(await ctx.user())];
      const first = (await open(buyer, a.id).expect(200)).body.id;
      const second = (await open(buyer, b.id).expect(200)).body.id;
      await say(buyer, first);
      await say(buyer, second);
      expect((await list(buyer)).map((c) => c.id)).toEqual([second, first]);
      await say(buyer, first);
      expect((await list(buyer)).map((c) => c.id)).toEqual([first, second]);
    });

    it('trims text, keeps its line breaks and rejects empty, oversized and unknown fields', async () => {
      const { buyer, id } = await world();
      const sent = await say(buyer, id, '  line one\r\nline two  ');
      expect(sent.body).toBe('line one\nline two');
      await send(buyer, id, text('   ')).expect(400);
      await send(buyer, id, text('x'.repeat(2001))).expect(400);
      await send(buyer, id, text('x'.repeat(2000))).expect(201);
      await send(buyer, id, { ...text('hi'), extra: true }).expect(400);
      await send(buyer, id, { type: 'TEXT', client_id: 'not-a-uuid', body: 'hi' }).expect(400);
      await send(buyer, id, { type: 'AUDIO', client_id: randomUUID() }).expect(400);
      await send(buyer, id, { type: 'TEXT', client_id: randomUUID(), body: 'hi', lat: 34 }).expect(400);
    });

    it('stores a retried message once: the same client id returns the same message', async () => {
      const { buyer, id } = await world();
      const clientId = randomUUID();
      const results = await Promise.all(Array.from({ length: 4 }, () => send(buyer, id, text('once', clientId))));
      const statuses = results.map((r) => r.status);
      expect(statuses.every((s) => s === 201)).toBe(true);
      expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
      expect(await ctx.prisma.message.count({ where: { conversationId: id } })).toBe(1);
    });

    it('returns history newest first, in pages that never repeat or skip a message, even with identical timestamps', async () => {
      const { buyer, seller, id } = await world();
      const at = new Date('2026-10-01T10:00:00.000Z');
      await ctx.prisma.message.createMany({
        data: Array.from({ length: 7 }, (_, i) => ({
          conversationId: id,
          senderId: i % 2 ? seller.id : buyer.id,
          type: 'TEXT' as const,
          body: `m${i}`,
          clientId: randomUUID(),
          createdAt: i < 5 ? at : new Date(at.getTime() + i), // five share one timestamp
        })),
      });
      const seen: string[] = [];
      let cursor: string | null = null;
      for (let guard = 0; guard < 10; guard++) {
        const query: string = `?limit=3${cursor ? `&before=${cursor}` : ''}`;
        const res: { body: { data: ChatMessage[]; next_cursor: string | null } } = await history(buyer, id, query).expect(200);
        seen.push(...res.body.data.map((m) => m.id));
        cursor = res.body.next_cursor;
        if (!cursor) break;
      }
      expect(seen).toHaveLength(7);
      expect(new Set(seen).size).toBe(7);
      const all = (await history(buyer, id, '?limit=50').expect(200)).body.data as ChatMessage[];
      expect(all.map((m) => m.id)).toEqual(seen);
      expect(all[0].body).toBe('m6');
    });

    it('rejects a bad cursor or limit', async () => {
      const { buyer, id } = await world();
      await history(buyer, id, '?before=!!!').expect(400);
      await history(buyer, id, `?before=${'A'.repeat(40)}`).expect(400);
      await history(buyer, id, '?limit=0').expect(400);
      await history(buyer, id, '?limit=51').expect(400);
    });

    it('marks the other person\'s messages read, once, and only theirs', async () => {
      const { buyer, seller, id } = await world();
      await say(buyer, id, 'one');
      await say(buyer, id, 'two');
      const reply = await say(seller, id, 'hello');

      const first = await ctx.post(`/chat/conversations/${id}/read`, {}, seller.token).expect(200);
      expect(first.body).toEqual({ marked: 2 });
      expect((await ctx.post(`/chat/conversations/${id}/read`, {}, seller.token).expect(200)).body).toEqual({ marked: 0 });

      const messages = (await history(buyer, id).expect(200)).body.data as ChatMessage[];
      expect(messages.find((m) => m.id === reply.id)!.read_at).toBeNull(); // the seller's own message is unread by the buyer
      expect(messages.filter((m) => m.sender_id === buyer.id).every((m) => m.read_at !== null)).toBe(true);
      expect((await list(seller))[0].unread_count).toBe(0);
      expect((await list(buyer))[0].unread_count).toBe(1);
    });

    it('lets only the two people in a conversation read, write or mark it', async () => {
      const { buyer, id } = await world();
      const stranger = await ctx.user();
      await say(buyer, id, 'private');
      await history(stranger, id).expect(404);
      await send(stranger, id, text('hi')).expect(404);
      await ctx.post(`/chat/conversations/${id}/read`, {}, stranger.token).expect(404);
      await history(buyer, randomUUID()).expect(404);
      await history(buyer, 'nope').expect(400);
      expect(await list(stranger)).toEqual([]);
    });

    it('never puts a phone number in a chat response', async () => {
      const agency = await ctx.agency(true);
      const { buyer, id } = await world(agency);
      await say(buyer, id);
      const bodies = [
        (await list(buyer)),
        (await history(buyer, id).expect(200)).body,
        (await ctx.get('/chat/capabilities', buyer.token).expect(200)).body,
      ];
      const json = JSON.stringify(bodies);
      expect(json).not.toContain(agency.phone);
      expect(json).not.toContain(buyer.phone);
    });

    it('lets people read an archived listing\'s chat but not add to it', async () => {
      const { buyer, seller, id, listing } = await world();
      await say(buyer, id);
      await ctx.prisma.property.update({ where: { id: listing.id }, data: { status: 'ARCHIVED' } });
      const res = await send(seller, id, text('too late')).expect(409);
      expect(res.body.code).toBe('LISTING_NOT_ACTIVE');
      await history(seller, id).expect(200);
      expect((await list(seller))[0].property.status).toBe('ARCHIVED');
    });

    it('slows down someone sending too fast, and tells them how long to wait', async () => {
      const { buyer, id } = await world();
      for (let i = 0; i < 30; i++) await send(buyer, id, text(`m${i}`)).expect(201);
      const res = await send(buyer, id, text('one too many')).expect(429);
      expect(res.body).toMatchObject({ code: 'CHAT_RATE_LIMITED' });
      expect(res.body.retry_after).toBeGreaterThan(0);
      // A retry of something already delivered is not punished.
      const dup = await ctx.prisma.message.findFirstOrThrow({ where: { conversationId: id } });
      await send(buyer, id, text('m0', dup.clientId)).expect(201);
    });
  });

  describe('map locations and the agency perks', () => {
    const pin = { lat: 34.5333, lng: 69.1667 };

    it('lets an agency with a subscription send a map pin, and no one else', async () => {
      const agency = await ctx.agency(true);
      const { id, buyer } = await world(agency);
      const sent = await send(agency, id, { type: 'LOCATION', client_id: randomUUID(), ...pin, body: 'Office' }).expect(201);
      expect(sent.body).toMatchObject({ type: 'LOCATION', lat: pin.lat, lng: pin.lng, body: 'Office' });

      const refused = await send(buyer, id, { type: 'LOCATION', client_id: randomUUID(), ...pin }).expect(403);
      expect(refused.body.code).toBe('PERKS_REQUIRED');
      for (const lapsed of [await ctx.lapsedAgency(), await ctx.agency(false)]) {
        const w = await world(lapsed);
        await send(lapsed, w.id, { type: 'LOCATION', client_id: randomUUID(), ...pin }).expect(403);
      }
    });

    it('keeps pins inside Afghanistan and valid', async () => {
      const agency = await ctx.agency(true);
      const { id } = await world(agency);
      const pinAt = (lat: number, lng: number) => send(agency, id, { type: 'LOCATION', client_id: randomUUID(), lat, lng });
      expect((await pinAt(48.85, 2.35).expect(400)).body.code).toBe('LOCATION_OUT_OF_BOUNDS');
      await pinAt(95, 69).expect(400);
      await pinAt(34.5, 200).expect(400);
      await ctx.post(`/chat/conversations/${id}/messages`, { type: 'LOCATION', client_id: randomUUID(), lat: 34.5 }, agency.token).expect(400);
    });

    it('reports what the account can do', async () => {
      const [agency, user, admin] = [await ctx.agency(true), await ctx.user(), await ctx.user('ADMIN')];
      const caps = async (u: TestUser) => (await ctx.get('/chat/capabilities', u.token).expect(200)).body;
      expect(await caps(user)).toEqual({ advanced: false, advanced_reason: null, limits: { text_max_length: 2000, image_max_bytes: 1_500_000, template_max_length: 500, templates_max: 10 } });
      expect(await caps(agency)).toMatchObject({ advanced: true, advanced_reason: 'AGENCY_SUBSCRIPTION', limits: { image_max_bytes: 8_000_000 } });
      expect(await caps(admin)).toMatchObject({ advanced: true, advanced_reason: 'ADMIN' });
    });
  });

  describe('pictures', () => {
    it('uploads a picture, sends it, and lets both people (and only them) download it', async () => {
      const { buyer, seller, id } = await world();
      const bytes = jpeg(3000);
      const up = await upload(buyer, bytes).expect(201);
      expect(up.body).toMatchObject({ content_type: 'image/jpeg', byte_size: 3000 });
      expect(up.body.url).toBe(`/chat/images/${up.body.id}`);

      // Before it is sent only the uploader may see it.
      await ctx.get(up.body.url, buyer.token).expect(200);
      await ctx.get(up.body.url, seller.token).expect(404);

      const sent = await send(buyer, id, { type: 'IMAGE', client_id: randomUUID(), image_id: up.body.id, body: 'the kitchen' }).expect(201);
      expect(sent.body).toMatchObject({ type: 'IMAGE', image_url: up.body.url, body: 'the kitchen' });

      for (const who of [buyer, seller]) {
        const res = await ctx.get(up.body.url, who.token).expect(200);
        expect(res.headers['content-type']).toContain('image/jpeg');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['cache-control']).toContain('private');
        expect(Buffer.from(res.body).equals(bytes)).toBe(true);
      }
      const stranger = await ctx.user();
      await ctx.get(up.body.url, stranger.token).expect(404);
      await ctx.get(up.body.url).expect(401);
    });

    it('accepts PNG, and refuses everything else', async () => {
      const user = await ctx.user();
      await upload(user, png(), 'image/png').expect(201);
      await upload(user, Buffer.from('GIF89a....'), 'image/gif').expect(415);
      await upload(user, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml').expect(415);
      // Labelled as a JPEG but not one.
      await upload(user, Buffer.from('<?php system($_GET[0]); ?>'.padEnd(100)), 'image/jpeg').expect(415);
      // A PNG labelled as a JPEG.
      await upload(user, png(), 'image/jpeg').expect(415);
      await upload(user, Buffer.alloc(0)).expect(400);
    });

    it('does not hang on a body that is not a picture (a JSON body is consumed before it gets here)', async () => {
      const user = await ctx.user();
      const res = await request(ctx.http)
        .post('/chat/images')
        .set('Authorization', `Bearer ${user.token}`)
        .set('Content-Type', 'application/json')
        .send({ hello: 'world' })
        .expect(415);
      expect(res.body.code).toBe('UNSUPPORTED_IMAGE_TYPE');
      await request(ctx.http).post('/chat/images').set('Authorization', `Bearer ${user.token}`).expect(415);
    });

    it('limits the size by account: 1.5 MB for everyone, 8 MB for agencies with a subscription', async () => {
      const user = await ctx.user();
      const agency = await ctx.agency(true);
      const lapsed = await ctx.lapsedAgency();
      const big = jpeg(1_500_001);
      const atLimit = jpeg(1_500_000);
      await upload(user, atLimit).expect(201);
      const refused = await upload(user, big).expect(413);
      expect(refused.body).toMatchObject({ code: 'IMAGE_TOO_LARGE', max_bytes: 1_500_000 });
      await upload(lapsed, big).expect(413);
      await upload(agency, big).expect(201);
      await upload(agency, jpeg(8_000_000)).expect(201);
      expect((await upload(agency, jpeg(8_000_001)).expect(413)).body.max_bytes).toBe(8_000_000);
    });

    it('needs a token', async () => {
      await request(ctx.http).post('/chat/images').set('Content-Type', 'image/jpeg').send(jpeg()).expect(401);
    });

    it('only lets the uploader send a picture, and only once', async () => {
      const { buyer, seller, id } = await world();
      const up = (await upload(buyer, jpeg()).expect(201)).body;
      const other = (await upload(seller, jpeg()).expect(201)).body;

      const stolen = await send(buyer, id, { type: 'IMAGE', client_id: randomUUID(), image_id: other.id }).expect(400);
      expect(stolen.body.code).toBe('IMAGE_NOT_FOUND');
      await send(buyer, id, { type: 'IMAGE', client_id: randomUUID(), image_id: randomUUID() }).expect(400);

      await send(buyer, id, { type: 'IMAGE', client_id: randomUUID(), image_id: up.id }).expect(201);
      const again = await send(buyer, id, { type: 'IMAGE', client_id: randomUUID(), image_id: up.id }).expect(409);
      expect(again.body.code).toBe('IMAGE_ALREADY_SENT');
      await send(seller, id, { type: 'IMAGE', client_id: randomUUID(), image_id: other.id }).expect(201);
    });

    it('stores a retried picture message once', async () => {
      const { buyer, id } = await world();
      const up = (await upload(buyer, jpeg()).expect(201)).body;
      const message = { type: 'IMAGE', client_id: randomUUID(), image_id: up.id };
      const results = await Promise.all(Array.from({ length: 3 }, () => send(buyer, id, message)));
      expect(results.map((r) => r.status)).toEqual([201, 201, 201]);
      expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    });

    it('answers a retry that overlaps the original with the stored message, not a 409', async () => {
      // The race, made deterministic: the retry's first look at the client_id finds nothing (the original had not
      // committed yet), then the original commits, and only then does the retry look at the picture.
      const { buyer, id } = await world();
      const up = (await upload(buyer, jpeg()).expect(201)).body;
      const message = { type: 'IMAGE', client_id: randomUUID(), image_id: up.id };
      const original = (await send(buyer, id, message).expect(201)).body as ChatMessage;

      const service = ctx.app.get(ChatService) as unknown as { findByClientId: (...args: unknown[]) => Promise<unknown> };
      const spy = vi.spyOn(service, 'findByClientId').mockResolvedValueOnce(null);
      try {
        const retry = await send(buyer, id, message).expect(201);
        expect(retry.body.id).toBe(original.id);
        expect(spy).toHaveBeenCalledTimes(2); // the blind pre-check, then the look-up after the 409
      } finally {
        spy.mockRestore();
      }
      // A DIFFERENT message trying to reuse the picture is still refused.
      const other = await send(buyer, id, { ...message, client_id: randomUUID() }).expect(409);
      expect(other.body.code).toBe('IMAGE_ALREADY_SENT');
    });
  });

  describe('saved replies', () => {
    const tpl = (user: TestUser, body: object) => ctx.post('/chat/templates', body, user.token);

    it('is an agency perk: everyone else gets 403 PERKS_REQUIRED', async () => {
      const user = await ctx.user();
      const lapsed = await ctx.lapsedAgency();
      for (const who of [user, lapsed]) {
        for (const res of [
          await ctx.get('/chat/templates', who.token).expect(403),
          await tpl(who, { body: 'hello' }).expect(403),
          await ctx.patch(`/chat/templates/${randomUUID()}`, { body: 'x' }, who.token).expect(403),
          await ctx.del(`/chat/templates/${randomUUID()}`, who.token).expect(403),
        ]) {
          expect(res.body.code).toBe('PERKS_REQUIRED');
        }
      }
      await ctx.get('/chat/templates').expect(401);
    });

    it('creates, lists, edits and deletes an agency\'s own replies', async () => {
      const agency = await ctx.agency(true);
      const a = (await tpl(agency, { body: '  Welcome!  ' }).expect(201)).body;
      expect(a).toMatchObject({ body: 'Welcome!', is_auto_reply: false });
      const b = (await tpl(agency, { body: 'Price is negotiable' }).expect(201)).body;
      expect((await ctx.get('/chat/templates', agency.token).expect(200)).body.map((t: { id: string }) => t.id)).toEqual([a.id, b.id]);

      const edited = (await ctx.patch(`/chat/templates/${a.id}`, { body: 'Hello!' }, agency.token).expect(200)).body;
      expect(edited).toMatchObject({ id: a.id, body: 'Hello!' });
      await ctx.del(`/chat/templates/${a.id}`, agency.token).expect(204);
      await ctx.del(`/chat/templates/${a.id}`, agency.token).expect(404);
      expect((await ctx.get('/chat/templates', agency.token).expect(200)).body).toHaveLength(1);
    });

    it('keeps each agency\'s replies private', async () => {
      const [one, two] = [await ctx.agency(true), await ctx.agency(true)];
      const mine = (await tpl(one, { body: 'mine' }).expect(201)).body;
      await ctx.patch(`/chat/templates/${mine.id}`, { body: 'stolen' }, two.token).expect(404);
      await ctx.del(`/chat/templates/${mine.id}`, two.token).expect(404);
      expect((await ctx.get('/chat/templates', two.token).expect(200)).body).toEqual([]);
    });

    it('rejects empty, oversized and unknown fields, and limits the list to 10', async () => {
      const agency = await ctx.agency(true);
      await tpl(agency, { body: '   ' }).expect(400);
      await tpl(agency, { body: 'x'.repeat(501) }).expect(400);
      await tpl(agency, { body: 'hi', extra: 1 }).expect(400);
      await tpl(agency, { body: 'x'.repeat(500) }).expect(201);
      for (let i = 1; i < 10; i++) await tpl(agency, { body: `reply ${i}` }).expect(201);
      expect((await tpl(agency, { body: 'one more' }).expect(409)).body.code).toBe('TEMPLATE_LIMIT_REACHED');
      const first = (await ctx.get('/chat/templates', agency.token)).body[0];
      await ctx.patch(`/chat/templates/${first.id}`, {}, agency.token).expect(400);
    });

    it('allows only one automatic reply: choosing another turns the first off', async () => {
      const agency = await ctx.agency(true);
      const a = (await tpl(agency, { body: 'first', is_auto_reply: true }).expect(201)).body;
      expect(a.is_auto_reply).toBe(true);
      const b = (await tpl(agency, { body: 'second', is_auto_reply: true }).expect(201)).body;
      await ctx.patch(`/chat/templates/${a.id}`, { is_auto_reply: true }, agency.token).expect(200);

      const all = (await ctx.get('/chat/templates', agency.token).expect(200)).body as { id: string; is_auto_reply: boolean }[];
      expect(all.filter((t) => t.is_auto_reply).map((t) => t.id)).toEqual([a.id]);
      expect(all.find((t) => t.id === b.id)!.is_auto_reply).toBe(false);
      await ctx.patch(`/chat/templates/${a.id}`, { is_auto_reply: false }, agency.token).expect(200);
      expect((await ctx.get('/chat/templates', agency.token)).body.some((t: { is_auto_reply: boolean }) => t.is_auto_reply)).toBe(false);
    });

    it('survives racing changes with at most one automatic reply and no more than 10 replies', async () => {
      const agency = await ctx.agency(true);
      await Promise.all(Array.from({ length: 14 }, (_, i) => tpl(agency, { body: `r${i}`, is_auto_reply: i % 2 === 0 })));
      const all = await ctx.prisma.chatTemplate.findMany({ where: { userId: agency.id } });
      expect(all.length).toBe(10);
      expect(all.filter((t) => t.isAutoReply).length).toBeLessThanOrEqual(1);
    });
  });

  describe('automatic reply', () => {
    const autoReplies = (id: string) => ctx.prisma.message.findMany({ where: { conversationId: id, isAutoReply: true } });

    it('answers a buyer\'s first message once, from the agency, after it', async () => {
      const agency = await ctx.agency(true);
      await ctx.post('/chat/templates', { body: 'Thanks! We will call you soon.', is_auto_reply: true }, agency.token).expect(201);
      const { buyer, id } = await world(agency);

      const first = await say(buyer, id, 'Hello');
      const second = await say(buyer, id, 'Anyone there?');

      const messages = ((await history(buyer, id).expect(200)).body.data as ChatMessage[]).reverse();
      expect(messages.map((m) => m.body)).toEqual(['Hello', 'Thanks! We will call you soon.', 'Anyone there?']);
      const reply = messages[1];
      expect(reply).toMatchObject({ sender_id: agency.id, is_auto_reply: true, type: 'TEXT' });
      expect(new Date(reply.created_at).getTime()).toBeGreaterThan(new Date(first.created_at).getTime());
      expect(second.is_auto_reply).toBe(false);
      expect((await ctx.prisma.conversation.findUniqueOrThrow({ where: { id } })).autoReplySentAt).not.toBeNull();
      expect((await list(buyer))[0].unread_count).toBe(1);
      expect((await list(agency))[0].unread_count).toBe(2);
    });

    it('sends exactly one even when the buyer\'s first messages arrive at the same moment', async () => {
      const agency = await ctx.agency(true);
      await ctx.post('/chat/templates', { body: 'Auto', is_auto_reply: true }, agency.token).expect(201);
      const { buyer, id } = await world(agency);
      await Promise.all(Array.from({ length: 4 }, (_, i) => send(buyer, id, text(`hi ${i}`))));
      expect(await autoReplies(id)).toHaveLength(1);
    });

    it('stays quiet when the agency has no automatic reply, a lapsed subscription, or the buyer is the one answered to', async () => {
      const none = await ctx.agency(true);
      const a = await world(none);
      await say(a.buyer, a.id);
      expect(await autoReplies(a.id)).toHaveLength(0);

      // A template that exists but whose owner no longer has the perks is not sent.
      const lapsed = await ctx.lapsedAgency();
      await ctx.prisma.chatTemplate.create({ data: { userId: lapsed.id, body: 'old', isAutoReply: true } });
      const b = await world(lapsed);
      await say(b.buyer, b.id);
      expect(await autoReplies(b.id)).toHaveLength(0);

      // A regular user can never have one active.
      const user = await ctx.user();
      await ctx.prisma.chatTemplate.create({ data: { userId: user.id, body: 'sneaky', isAutoReply: true } });
      const c = await world(user);
      await say(c.buyer, c.id);
      expect(await autoReplies(c.id)).toHaveLength(0);
    });

    it('does not answer an old conversation after the agency sets one up later', async () => {
      const agency = await ctx.agency(true);
      const { buyer, id } = await world(agency);
      await say(buyer, id, 'first, before any auto reply existed');
      await ctx.post('/chat/templates', { body: 'Auto', is_auto_reply: true }, agency.token).expect(201);
      await say(buyer, id, 'second');
      expect(await autoReplies(id)).toHaveLength(0);
    });

    it('does not answer the agency\'s own first message', async () => {
      const agency = await ctx.agency(true);
      await ctx.post('/chat/templates', { body: 'Auto', is_auto_reply: true }, agency.token).expect(201);
      const { id } = await world(agency);
      await say(agency, id, 'I wrote first');
      expect(await autoReplies(id)).toHaveLength(0);
    });
  });

  describe('real time (sockets)', () => {
    /** The next `event` on the socket, or a rejection after `ms`. */
    const next = <T = unknown>(socket: Socket, event: string, ms = 3000) =>
      new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`no "${event}" within ${ms}ms`)), ms);
        socket.once(event, (payload: T) => {
          clearTimeout(timer);
          resolve(payload);
        });
      });
    /** Resolves true if `event` does NOT arrive within `ms`. */
    const silent = (socket: Socket, event: string, ms = 400) =>
      new Promise<boolean>((resolve) => {
        const onEvent = () => resolve(false);
        socket.once(event, onEvent);
        setTimeout(() => {
          socket.off(event, onEvent);
          resolve(true);
        }, ms);
      });
    const ask = <T = ChatSendAck>(socket: Socket, event: string, payload: unknown) =>
      socket.timeout(3000).emitWithAck(event, payload) as Promise<T>;

    it('refuses a connection without a valid token', async () => {
      await expect(ctx.connectSocket(undefined)).rejects.toThrow(/UNAUTHORIZED/);
      await expect(ctx.connectSocket('not.a.token')).rejects.toThrow(/UNAUTHORIZED/);
      const user = await ctx.user();
      const expired = await ctx.jwt.signAsync({ sub: user.id, role: 'USER' }, { expiresIn: -10 });
      await expect(ctx.connectSocket(expired)).rejects.toThrow(/UNAUTHORIZED/);
    });

    it('sends a message, acknowledges it, and delivers it to the other person and to the sender\'s other devices', async () => {
      const { buyer, seller, id } = await world();
      const [mine, myOtherDevice, theirs] = await Promise.all([
        ctx.connectSocket(buyer.token),
        ctx.connectSocket(buyer.token),
        ctx.connectSocket(seller.token),
      ]);
      const arrivals = Promise.all([next<ChatMessage>(myOtherDevice, 'message:new'), next<ChatMessage>(theirs, 'message:new'), next<ChatMessage>(mine, 'message:new')]);

      const clientId = randomUUID();
      const ack = await ask(mine, 'message:send', { conversation_id: id, message: text('over the socket', clientId) });
      expect(ack.ok).toBe(true);
      if (!ack.ok) return;
      expect(ack.message).toMatchObject({ body: 'over the socket', sender_id: buyer.id, client_id: clientId });
      for (const delivered of await arrivals) expect(delivered.id).toBe(ack.message.id);

      expect(await ctx.prisma.message.count({ where: { conversationId: id } })).toBe(1);
    });

    it('delivers a message sent over HTTP to connected phones too', async () => {
      const { buyer, seller, id } = await world();
      const theirs = await ctx.connectSocket(seller.token);
      const arrival = next<ChatMessage>(theirs, 'message:new');
      const sent = await say(buyer, id, 'via REST');
      expect((await arrival).id).toBe(sent.id);
    });

    it('delivers the automatic reply as its own message', async () => {
      const agency = await ctx.agency(true);
      await ctx.post('/chat/templates', { body: 'Auto', is_auto_reply: true }, agency.token).expect(201);
      const { buyer, id } = await world(agency);
      const socket = await ctx.connectSocket(buyer.token);
      const received: ChatMessage[] = [];
      socket.on('message:new', (m: ChatMessage) => received.push(m));
      await say(buyer, id, 'hi');
      await vi.waitFor(() => expect(received).toHaveLength(2));
      expect(received.map((m) => m.is_auto_reply).sort()).toEqual([false, true]);
    });

    it('applies the same rules as HTTP and answers failures instead of throwing', async () => {
      const { buyer, id } = await world();
      const stranger = await ctx.user();
      const socket = await ctx.connectSocket(buyer.token);
      const strangerSocket = await ctx.connectSocket(stranger.token);

      expect(await ask(socket, 'message:send', { conversation_id: id, message: { type: 'TEXT', client_id: randomUUID(), body: '' } })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
      expect(await ask(socket, 'message:send', 'garbage')).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
      expect(await ask(socket, 'message:send', { conversation_id: id, message: { type: 'LOCATION', client_id: randomUUID(), lat: 34.5, lng: 69.1 } })).toMatchObject({ ok: false, code: 'PERKS_REQUIRED', status: 403 });
      expect(await ask(strangerSocket, 'message:send', { conversation_id: id, message: text('let me in') })).toMatchObject({ ok: false });
      expect(await ctx.prisma.message.count({ where: { conversationId: id } })).toBe(0);
      // Still usable afterwards.
      expect((await ask(socket, 'message:send', { conversation_id: id, message: text('fine') })).ok).toBe(true);
    });

    it('stores a message sent twice (a retry) once, and acknowledges both', async () => {
      const { buyer, id } = await world();
      const socket = await ctx.connectSocket(buyer.token);
      const payload = { conversation_id: id, message: text('retry me') };
      const [a, b] = await Promise.all([ask(socket, 'message:send', payload), ask(socket, 'message:send', payload)]);
      expect(a.ok && b.ok).toBe(true);
      expect(await ctx.prisma.message.count({ where: { conversationId: id } })).toBe(1);
    });

    it('shows typing to the other person only, and never to outsiders', async () => {
      const { buyer, seller, id } = await world();
      const stranger = await ctx.user();
      const [mine, theirs, outsider] = await Promise.all([ctx.connectSocket(buyer.token), ctx.connectSocket(seller.token), ctx.connectSocket(stranger.token)]);

      const heard = next<{ conversation_id: string; user_id: string; is_typing: boolean }>(theirs, 'typing');
      const quietSelf = silent(mine, 'typing');
      const quietOutsider = silent(outsider, 'typing');
      mine.emit('typing', { conversation_id: id, is_typing: true });
      expect(await heard).toEqual({ conversation_id: id, user_id: buyer.id, is_typing: true });
      expect(await quietSelf).toBe(true);
      expect(await quietOutsider).toBe(true);

      const stopped = next<{ is_typing: boolean }>(theirs, 'typing');
      mine.emit('typing', { conversation_id: id, is_typing: false });
      expect((await stopped).is_typing).toBe(false);
    });

    it('ignores typing from someone who is not in the conversation, and malformed typing', async () => {
      const { seller, id } = await world();
      const stranger = await ctx.user();
      const [theirs, outsider] = await Promise.all([ctx.connectSocket(seller.token), ctx.connectSocket(stranger.token)]);
      const quiet = silent(theirs, 'typing');
      outsider.emit('typing', { conversation_id: id, is_typing: true });
      outsider.emit('typing', { nonsense: true });
      outsider.emit('typing');
      expect(await quiet).toBe(true);
    });

    it('limits how often "typing" is passed on', async () => {
      const { buyer, seller, id } = await world();
      const [mine, theirs] = await Promise.all([ctx.connectSocket(buyer.token), ctx.connectSocket(seller.token)]);
      let count = 0;
      theirs.on('typing', () => count++);
      for (let i = 0; i < 20; i++) mine.emit('typing', { conversation_id: id, is_typing: true });
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(count).toBe(1);
    });

    it('sends read receipts to the sender when the other person reads', async () => {
      const { buyer, seller, id } = await world();
      const sent = await say(buyer, id, 'did you see this');
      const [mine, theirs] = await Promise.all([ctx.connectSocket(buyer.token), ctx.connectSocket(seller.token)]);
      const receipt = next<{ conversation_id: string; reader_id: string; read_at: string }>(mine, 'message:read');

      expect(await ask(theirs, 'message:read', { conversation_id: id })).toEqual({ ok: true, marked: 1 });
      const got = await receipt;
      expect(got).toMatchObject({ conversation_id: id, reader_id: seller.id });
      const stored = await ctx.prisma.message.findUniqueOrThrow({ where: { id: sent.id } });
      expect(stored.readAt?.toISOString()).toBe(got.read_at);

      // Nothing new to read: no second receipt.
      const noMore = silent(mine, 'message:read');
      expect(await ask(theirs, 'message:read', { conversation_id: id })).toEqual({ ok: true, marked: 0 });
      expect(await noMore).toBe(true);
    });

    it('refuses to mark someone else\'s conversation read, or a malformed request', async () => {
      const { id } = await world();
      const stranger = await ctx.user();
      const socket = await ctx.connectSocket(stranger.token);
      expect(await ask(socket, 'message:read', { conversation_id: id })).toMatchObject({ ok: false });
      expect(await ask(socket, 'message:read', { conversation_id: 'nope' })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    });

    it('never sends anyone events about conversations they are not in', async () => {
      const { buyer, id } = await world();
      const stranger = await ctx.user();
      const outsider = await ctx.connectSocket(stranger.token);
      const quiet = Promise.all([silent(outsider, 'message:new'), silent(outsider, 'message:read'), silent(outsider, 'typing')]);
      await say(buyer, id, 'secret');
      expect(await quiet).toEqual([true, true, true]);
    });

    it('closes a connection when its token expires, and answers nothing after that', async () => {
      const { buyer, id } = await world();
      const shortLived = await ctx.jwt.signAsync({ sub: buyer.id, role: 'USER' }, { expiresIn: 1 });
      const socket = await ctx.connectSocket(shortLived);
      expect((await ask(socket, 'message:send', { conversation_id: id, message: text('while valid') })).ok).toBe(true);

      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('still connected after the token expired')), 3000);
        socket.once('disconnect', (reason) => {
          clearTimeout(timer);
          resolve(reason);
        });
      });
      expect(socket.connected).toBe(false);
      expect(await ctx.prisma.message.count({ where: { conversationId: id } })).toBe(1);
    });
  });

  describe('database rules', () => {
    it('refuses messages whose fields do not fit their type, and chats with yourself', async () => {
      const { buyer, seller, id, listing } = await world();
      const base = { conversationId: id, senderId: buyer.id, clientId: randomUUID() };
      const insert = (data: object) => ctx.prisma.message.create({ data: { ...base, clientId: randomUUID(), ...data } as never });
      await expect(insert({ type: 'TEXT' })).rejects.toThrow(); // text without a body
      await expect(insert({ type: 'TEXT', body: '   ' })).rejects.toThrow();
      await expect(insert({ type: 'TEXT', body: 'hi', lat: 34 })).rejects.toThrow();
      await expect(insert({ type: 'TEXT', body: 'x'.repeat(2001) })).rejects.toThrow();
      await expect(insert({ type: 'IMAGE' })).rejects.toThrow(); // picture without a picture
      await expect(insert({ type: 'LOCATION', lat: 34.5 })).rejects.toThrow();
      await expect(insert({ type: 'LOCATION', lat: 100, lng: 69 })).rejects.toThrow();
      await expect(
        ctx.prisma.conversation.create({ data: { propertyId: listing.id, buyerId: seller.id, sellerId: seller.id } }),
      ).rejects.toThrow();
    });
  });
});
