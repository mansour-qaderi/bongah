import { BadGatewayException, UnauthorizedException } from '@nestjs/common';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { HesabPaySettings } from '../hesabpay.config.js';
import { LiveHesabPayGateway } from './live-hesabpay.gateway.js';

// These tests pin the adapter's FAIL-CLOSED behaviour against a stub server. They cannot prove the
// field names match the real HesabPay API (see the banner in live-hesabpay.gateway.ts).

type Handler = (req: IncomingMessage, res: ServerResponse, body: string) => void;

describe('LiveHesabPayGateway', () => {
  let server: Server;
  let handler: Handler;
  let gateway: LiveHesabPayGateway;
  const seen: { path?: string; auth?: string; body?: string } = {};

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        seen.path = req.url;
        seen.auth = req.headers.authorization;
        seen.body = body;
        handler(req, res, body);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const settings = {
      mode: 'live',
      baseUrl: `http://127.0.0.1:${port}/api/v1`,
      apiKey: 'secret-key',
    } as HesabPaySettings;
    gateway = new LiveHesabPayGateway(settings);
  });
  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  const reply = (status: number, body: unknown): Handler => (_req, res) => {
    res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  };
  const request = { reference: 'r-1', amount: '1000', currency: 'AFGHANI' as const, description: 'Subscription' };
  const webhookInput = (payload: object) => ({
    rawBody: Buffer.from(JSON.stringify(payload)),
    headers: { 'x-signature': 'abc', cookie: 'private=1' },
  });
  const goodPayload = { transaction_id: 's-1', status: 'SUCCESS', amount: 1000 };

  describe('createSession', () => {
    it('posts to the create-session endpoint with the API key and returns the session', async () => {
      handler = reply(200, { session_id: 's-1', session_url: 'https://pay.example/s-1' });
      await expect(gateway.createSession(request)).resolves.toEqual({ id: 's-1', paymentUrl: 'https://pay.example/s-1' });
      expect(seen.path).toBe('/api/v1/payment/create-session');
      expect(seen.auth).toBe('Bearer secret-key');
      expect(JSON.parse(seen.body!)).toMatchObject({ reference: 'r-1', currency: 'AFN', items: [{ price: 1000, quantity: 1 }] });
    });

    it.each([
      ['an empty object', {}],
      ['a missing id', { session_url: 'https://pay.example/x' }],
      ['a non-https payment URL', { session_id: 's', session_url: 'http://pay.example/x' }],
      ['a javascript: URL', { session_id: 's', session_url: 'javascript:alert(1)' }],
    ])('fails closed on %s', async (_label, body) => {
      handler = reply(200, body);
      await expect(gateway.createSession(request)).rejects.toBeInstanceOf(BadGatewayException);
    });

    it('reports a provider outage as 502 without leaking provider detail', async () => {
      handler = reply(500, { error: 'db password is hunter2' });
      const error = await gateway.createSession(request).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadGatewayException);
      expect(JSON.stringify((error as BadGatewayException).getResponse())).not.toContain('hunter2');
    });

    it('does not follow redirects (the API key must not travel)', async () => {
      handler = (_req, res) => res.writeHead(302, { location: 'http://127.0.0.1:1/steal' }).end();
      await expect(gateway.createSession(request)).rejects.toBeInstanceOf(BadGatewayException);
    });
  });

  describe('verifyWebhook', () => {
    it('accepts a webhook only when the provider confirms it, then parses the payload', async () => {
      handler = reply(200, { valid: true });
      await expect(gateway.verifyWebhook(webhookInput(goodPayload))).resolves.toEqual({
        sessionId: 's-1', status: 'SUCCESS', amount: '1000', currency: undefined,
      });
      expect(seen.path).toBe('/api/v1/hesab/webhooks/verify-signature');
      const sent = JSON.parse(seen.body!);
      expect(sent.body).toEqual(goodPayload);
      expect(sent.headers).toEqual({ 'x-signature': 'abc' }); // unrelated headers (cookies...) are not forwarded
    });

    it.each([
      ['valid: false', 200, { valid: false }],
      ['an unrecognised 200 body', 200, { ok: 'yes' }],
      ['an empty 200 body', 200, {}],
      ['a string "true"', 200, { valid: 'true' }],
      ['a provider 400', 400, { valid: false }],
      ['a provider 422', 422, {}],
    ])('rejects on %s', async (_label, status, body) => {
      handler = reply(status, body);
      await expect(gateway.verifyWebhook(webhookInput(goodPayload))).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it.each([
      ['an outage', 503],
      ['our API key being rejected', 401],
      ['a forbidden response', 403],
    ])('answers 502 (so the provider retries) when it cannot reach a verdict: %s', async (_label, status) => {
      handler = reply(status, {});
      await expect(gateway.verifyWebhook(webhookInput(goodPayload))).rejects.toBeInstanceOf(BadGatewayException);
    });

    it('rejects a body that is not JSON before calling the provider', async () => {
      let called = false;
      handler = (_req, res) => { called = true; res.end('{}'); };
      await expect(gateway.verifyWebhook({ rawBody: Buffer.from('nope'), headers: {} })).rejects.toBeInstanceOf(UnauthorizedException);
      expect(called).toBe(false);
    });
  });
});
