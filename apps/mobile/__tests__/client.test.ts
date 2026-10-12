import {
  ApiError,
  request,
  setAuthToken,
  setUnauthorizedHandler,
} from '../src/api/client';
import { API_BASE_URL } from '../src/config';
import { jsonResponse } from '../test-utils';

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  setAuthToken(null);
  setUnauthorizedHandler(null);
});

const lastCall = () =>
  fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [
    string,
    RequestInit,
  ];

describe('request', () => {
  it('builds the query string, skipping empty values and encoding the rest', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    await request('GET', '/properties', {
      query: {
        province: 'کابل',
        district: '',
        type: undefined,
        page: 2,
        flag: false,
      },
    });
    const [url] = lastCall();
    expect(url).toBe(
      `${API_BASE_URL}/properties?province=${encodeURIComponent(
        'کابل',
      )}&page=2&flag=false`,
    );
  });

  it('sends JSON bodies and the token only when asked', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    setAuthToken('tok');

    await request('POST', '/a', { body: { x: 1 } });
    let [, init] = lastCall();
    expect(init.body).toBe('{"x":1}');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
    expect(
      (init.headers as Record<string, string>).Authorization,
    ).toBeUndefined();

    await request('GET', '/b', { auth: true });
    [, init] = lastCall();
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer tok',
    );
  });

  it('returns undefined for an empty 204 response', async () => {
    fetchMock.mockResolvedValue(jsonResponse(204));
    await expect(
      request('DELETE', '/properties/1', { auth: true }),
    ).resolves.toBeUndefined();
  });

  it('turns a failure response into an ApiError carrying the body', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(403, {
        message: 'x',
        code: 'FREE_LISTING_LIMIT_REACHED',
        resets_at: '2026-11-01T00:00:00Z',
      }),
    );
    const error = await request('POST', '/properties', { auth: true }).catch(
      e => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      kind: 'http',
      status: 403,
      code: 'FREE_LISTING_LIMIT_REACHED',
    });
  });

  it('copes with a non-JSON error page', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      headers: { get: () => null },
      text: async () => '<html>Bad gateway</html>',
    });
    await expect(request('GET', '/x')).rejects.toMatchObject({
      kind: 'http',
      status: 502,
      body: {},
    });
  });

  it('reads Retry-After from the header when the body has none', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(429, { message: 'slow down' }, { 'retry-after': '30' }),
    );
    await expect(request('GET', '/x')).rejects.toMatchObject({
      status: 429,
      body: { retry_after: 30 },
    });
  });

  it('reports a dead network as kind "network"', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    await expect(request('GET', '/x')).rejects.toMatchObject({
      kind: 'network',
      status: 0,
    });
  });

  it('reports an aborted request as kind "timeout"', async () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    fetchMock.mockRejectedValue(abort);
    await expect(request('GET', '/x')).rejects.toMatchObject({
      kind: 'timeout',
    });
  });
});

describe('401 handling', () => {
  it('signs the user out when a signed-in request is refused', async () => {
    const onUnauthorized = jest.fn();
    setUnauthorizedHandler(onUnauthorized);
    setAuthToken('tok');
    fetchMock.mockResolvedValue(jsonResponse(401, {}));
    await expect(
      request('GET', '/users/me', { auth: true }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('does NOT sign out on a 401 from an unauthenticated call (a wrong OTP code)', async () => {
    const onUnauthorized = jest.fn();
    setUnauthorizedHandler(onUnauthorized);
    setAuthToken('tok'); // someone is signed in elsewhere in the app
    fetchMock.mockResolvedValue(
      jsonResponse(401, { message: 'Invalid or expired verification code.' }),
    );
    await expect(
      request('POST', '/auth/verify-otp', { body: {} }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('ignores a late 401 that belongs to a previous session', async () => {
    const onUnauthorized = jest.fn();
    setUnauthorizedHandler(onUnauthorized);
    setAuthToken('old');
    fetchMock.mockImplementation(async () => {
      setAuthToken('new'); // the user signed in again while the request was in flight
      return jsonResponse(401, {});
    });
    await expect(
      request('GET', '/users/me', { auth: true }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
