import { createPublicKey, createVerify, generateKeyPairSync } from 'node:crypto';
import { buildBody, classify, FcmPushGateway, signJwt } from './fcm-push.gateway.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const credentials = { projectId: 'bongah-app', clientEmail: 'push@bongah-app.iam.gserviceaccount.com', privateKey };
const message = { token: 'device-token-123456', title: 'صبح بخیر', body: 'یک پیام خوب', data: { type: 'MORNING_QUOTE' }, ttlSeconds: 10_800 };
const NOW = Date.parse('2031-03-10T04:00:00Z');

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const tokenOk = (expiresIn = 3600) => json(200, { access_token: 'ya29.token', expires_in: expiresIn, token_type: 'Bearer' });
const fcmError = (status: number, errorCode: string | null, message = 'boom') =>
  json(status, { error: { code: status, message, status: 'X', details: errorCode ? [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode }] : [] } });

/** A fake fetch that answers by URL and records every call. */
function fakeFetch(answers: { token?: () => Response | Promise<Response>; send?: () => Response | Promise<Response> }) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init: init ?? {} });
    if (u.startsWith('https://oauth2.googleapis.com/token')) return (answers.token ?? (() => tokenOk()))();
    return (answers.send ?? (() => json(200, { name: 'projects/bongah-app/messages/1' })))();
  }) as typeof fetch;
  return { fn, calls, tokenCalls: () => calls.filter((c) => c.url.includes('oauth2')), sendCalls: () => calls.filter((c) => c.url.includes('fcm.googleapis')) };
}

describe('FcmPushGateway', () => {
  it('signs the token request with the service account key (RS256) for the FCM scope', () => {
    const jwt = signJwt(credentials, 1_900_000_000);
    const [header, claims, signature] = jwt.split('.') as [string, string, string];
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(JSON.parse(Buffer.from(claims, 'base64url').toString())).toEqual({
      iss: credentials.clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: 1_900_000_000,
      exp: 1_900_003_600,
    });
    const verifier = createVerify('RSA-SHA256').update(`${header}.${claims}`);
    expect(verifier.verify(createPublicKey(publicKey), Buffer.from(signature, 'base64url'))).toBe(true);
  });

  it('exchanges the JWT for an access token, then posts the v1 message with it', async () => {
    const http = fakeFetch({});
    const result = await new FcmPushGateway(credentials, http.fn, () => NOW).send(message);
    expect(result).toEqual({ ok: true });

    const [tokenCall] = http.tokenCalls();
    expect(tokenCall?.init.method).toBe('POST');
    const form = new URLSearchParams(String(tokenCall?.init.body));
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    expect(form.get('assertion')?.split('.')).toHaveLength(3);

    const [sendCall] = http.sendCalls();
    expect(sendCall?.url).toBe('https://fcm.googleapis.com/v1/projects/bongah-app/messages:send');
    expect(sendCall?.init.headers).toMatchObject({ authorization: 'Bearer ya29.token' });
    expect(JSON.parse(String(sendCall?.init.body))).toEqual({
      message: {
        token: message.token,
        notification: { title: 'صبح بخیر', body: 'یک پیام خوب' },
        data: { type: 'MORNING_QUOTE' },
        android: { priority: 'NORMAL', ttl: '10800s' },
        apns: {
          headers: { 'apns-priority': '5', 'apns-expiration': String(Math.floor(NOW / 1000) + 10_800) },
          payload: { aps: { sound: 'default' } },
        },
      },
    });
  });

  it('asks for one access token for many simultaneous sends, and reuses it until it is about to expire', async () => {
    let now = NOW;
    const http = fakeFetch({ token: () => tokenOk(3600) });
    const gateway = new FcmPushGateway(credentials, http.fn, () => now);
    await Promise.all(Array.from({ length: 20 }, () => gateway.send(message)));
    expect(http.tokenCalls()).toHaveLength(1);
    expect(http.sendCalls()).toHaveLength(20);

    now += 30 * 60_000;
    await gateway.send(message);
    expect(http.tokenCalls()).toHaveLength(1);
    now += 31 * 60_000; // past the expiry minus the safety margin
    await gateway.send(message);
    expect(http.tokenCalls()).toHaveLength(2);
  });

  it('gets a fresh access token and retries once when Google says the cached one was refused', async () => {
    let sends = 0;
    const http = fakeFetch({ send: () => (++sends === 1 ? fcmError(401, null, 'expired') : json(200, {})) });
    const gateway = new FcmPushGateway(credentials, http.fn, () => NOW);
    expect(await gateway.send(message)).toEqual({ ok: true });
    expect(http.tokenCalls()).toHaveLength(2);

    const stuck = fakeFetch({ send: () => fcmError(401, null, 'still no') });
    const result = await new FcmPushGateway(credentials, stuck.fn, () => NOW).send(message);
    expect(result).toMatchObject({ ok: false, code: 'AUTH' });
    expect(stuck.sendCalls()).toHaveLength(2);
  });

  it('reports a rejected key as AUTH and a Google outage at the token endpoint as TRANSIENT', async () => {
    const revoked = fakeFetch({ token: () => json(400, { error: 'invalid_grant' }) });
    expect(await new FcmPushGateway(credentials, revoked.fn, () => NOW).send(message)).toMatchObject({ ok: false, code: 'AUTH' });
    expect(revoked.sendCalls()).toHaveLength(0);

    const down = fakeFetch({ token: () => json(503, {}) });
    expect(await new FcmPushGateway(credentials, down.fn, () => NOW).send(message)).toMatchObject({ ok: false, code: 'TRANSIENT' });
  });

  it('never throws: a network failure is a TRANSIENT result', async () => {
    const offline = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    expect(await new FcmPushGateway(credentials, offline, () => NOW).send(message)).toMatchObject({ ok: false, code: 'TRANSIENT' });

    const sendFails = fakeFetch({ send: () => Promise.reject(new TypeError('socket hang up')) });
    expect(await new FcmPushGateway(credentials, sendFails.fn, () => NOW).send(message)).toMatchObject({ ok: false, code: 'TRANSIENT' });
  });

  it('does not keep a failed token request: the next send tries again', async () => {
    let tokens = 0;
    const http = fakeFetch({ token: () => (++tokens === 1 ? json(503, {}) : tokenOk()) });
    const gateway = new FcmPushGateway(credentials, http.fn, () => NOW);
    expect(await gateway.send(message)).toMatchObject({ ok: false, code: 'TRANSIENT' });
    expect(await gateway.send(message)).toEqual({ ok: true });
  });
});

describe('classify (what an FCM error means for the sender)', () => {
  it.each([
    [404, 'UNREGISTERED', 'UNREGISTERED'],
    [400, 'INVALID_ARGUMENT', 'INVALID'],
    [403, 'SENDER_ID_MISMATCH', 'INVALID'],
    [400, null, 'INVALID'],
    [401, null, 'AUTH'],
    [403, null, 'AUTH'],
    [429, 'QUOTA_EXCEEDED', 'TRANSIENT'],
    [500, 'INTERNAL', 'TRANSIENT'],
    [503, 'UNAVAILABLE', 'TRANSIENT'],
    [404, null, 'INVALID'], // a 404 without the token-specific detail (wrong project, say) must not erase tokens
  ])('%i %s is %s', (status, errorCode, expected) => {
    const body = { error: { status: 'X', message: 'm', details: errorCode ? [{ errorCode }] : [] } };
    expect(classify(status, body)).toMatchObject({ ok: false, code: expected });
  });

  it('copes with an answer that is not the expected JSON', () => {
    expect(classify(502, null)).toMatchObject({ code: 'TRANSIENT' });
    expect(classify(418, null)).toMatchObject({ code: 'INVALID' });
  });
});

describe('buildBody', () => {
  it('leaves out data when there is none', () => {
    const { message: built } = buildBody({ token: 'tok-1234567', title: 't', body: 'b', ttlSeconds: 60 }, NOW);
    expect(built).not.toHaveProperty('data');
  });
});
