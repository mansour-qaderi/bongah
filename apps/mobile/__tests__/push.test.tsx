import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import type { User } from '@bongah/shared-types';
import { getAuthToken, setAuthToken } from '../src/api/client';
import { AuthProvider, useAuth } from '../src/auth/AuthContext';
import { changeLanguage, initI18n } from '../src/i18n';
import { enablePush, forgetPushDevice, resetPushRegistration, syncPushDevice } from '../src/push/registration';
import PushRegistrar from '../src/push/PushRegistrar';
import { callsTo, jsonResponse, mockApi, render } from '../test-utils';

const fetchMock = jest.fn();
const messaging = jest.requireMock('@react-native-firebase/messaging') as {
  __state: { token: string; permission: number; promptAnswer: number | null };
  __emitTokenRefresh: (token: string) => void;
  requestPermission: jest.Mock;
  hasPermission: jest.Mock;
  getToken: jest.Mock;
};
const keychain = jest.requireMock('react-native-keychain') as {
  getGenericPassword: jest.Mock;
};

const DENIED = 0;
const UNDETERMINED = -1;
const AUTHORIZED = 1;
const writes = () => callsTo(fetchMock).filter(c => c.path === '/notifications/devices');
const puts = () => writes().filter(c => c.method === 'PUT');
const flushAll = () =>
  ReactTestRenderer.act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 10));
  });

beforeAll(async () => {
  await initI18n();
});
beforeEach(async () => {
  fetchMock.mockReset();
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  mockApi(fetchMock, {
    'PUT /notifications/devices': { status: 204 },
    'DELETE /notifications/devices': { status: 204 },
  });
  messaging.__state.permission = AUTHORIZED;
  messaging.__state.promptAnswer = null;
  messaging.__state.token = 'fcm-token-1';
  messaging.requestPermission.mockClear();
  resetPushRegistration();
  setAuthToken('session-token');
  await changeLanguage('prs');
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  setAuthToken(null);
});

describe('registering this phone with the server', () => {
  it('tells the server the token, platform and language', async () => {
    expect(await syncPushDevice('prs')).toBe('registered');
    expect(puts()).toEqual([
      {
        method: 'PUT',
        path: '/notifications/devices',
        query: {},
        body: { token: 'fcm-token-1', platform: 'IOS', language: 'prs' },
      },
    ]);
  });

  it('says nothing, and shows no prompt, when notifications are off and nobody asked', async () => {
    messaging.__state.permission = DENIED;
    expect(await syncPushDevice('prs')).toBe('no-permission');
    messaging.__state.permission = UNDETERMINED;
    expect(await syncPushDevice('prs')).toBe('no-permission');
    expect(messaging.requestPermission).not.toHaveBeenCalled();
    expect(writes()).toEqual([]);
  });

  it('does not repeat itself when nothing changed, but does when the token or language does (or when forced)', async () => {
    await syncPushDevice('prs');
    await syncPushDevice('prs');
    expect(puts()).toHaveLength(1);

    await syncPushDevice('ps');
    expect(puts()).toHaveLength(2);
    expect(puts()[1].body).toMatchObject({ language: 'ps' });

    messaging.__state.token = 'fcm-token-2';
    await syncPushDevice('ps');
    expect(puts()).toHaveLength(3);
    expect(puts()[2].body).toMatchObject({ token: 'fcm-token-2' });

    await syncPushDevice('ps', { force: true });
    expect(puts()).toHaveLength(4);
  });

  it('asks the person only when told to, registers if they agree, and gives up quietly if they do not', async () => {
    messaging.__state.permission = UNDETERMINED;
    messaging.__state.promptAnswer = AUTHORIZED;
    expect(await enablePush('prs')).toBe('registered');
    expect(messaging.requestPermission).toHaveBeenCalledTimes(1);
    expect(puts()).toHaveLength(1);

    resetPushRegistration();
    fetchMock.mockClear();
    messaging.requestPermission.mockClear();
    messaging.__state.permission = UNDETERMINED;
    messaging.__state.promptAnswer = DENIED;
    expect(await enablePush('prs')).toBe('no-permission');
    expect(messaging.requestPermission).toHaveBeenCalledTimes(1);
    expect(writes()).toEqual([]);
  });

  it('does not show the prompt again to someone who has already allowed notifications', async () => {
    expect(await enablePush('prs')).toBe('registered');
    expect(messaging.requestPermission).not.toHaveBeenCalled();
  });

  it('reports "failed", and tries again next time, when there is no token or the server cannot be reached', async () => {
    messaging.getToken.mockResolvedValueOnce('');
    expect(await syncPushDevice('prs')).toBe('failed');
    expect(writes()).toEqual([]);

    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    expect(await syncPushDevice('prs')).toBe('failed');
    expect(await syncPushDevice('prs')).toBe('registered');
    expect(puts()).toHaveLength(2); // the failed attempt was not remembered as done
  });

  it('never throws, even when Firebase itself fails', async () => {
    messaging.getToken.mockRejectedValueOnce(new Error('SERVICE_NOT_AVAILABLE'));
    await expect(syncPushDevice('prs')).resolves.toBe('failed');
    messaging.hasPermission.mockRejectedValueOnce(new Error('native module missing'));
    await expect(syncPushDevice('prs')).resolves.toBe('no-permission');
  });

  it('shares one run between quiet triggers, but a tap that asks is never answered by a run that did not prompt', async () => {
    let release!: (status: number) => void;
    messaging.hasPermission.mockImplementationOnce(
      () => new Promise<number>(resolve => (release = resolve)),
    );
    messaging.__state.permission = UNDETERMINED;
    messaging.__state.promptAnswer = AUTHORIZED;

    const quietA = syncPushDevice('prs');
    const quietB = syncPushDevice('prs');
    const asking = enablePush('prs'); // the person tapped while the quiet check was still out
    await ReactTestRenderer.act(async () => release(UNDETERMINED));

    expect(await quietA).toBe('no-permission');
    expect(await quietB).toBe('no-permission');
    expect(await asking).toBe('registered');
    expect(messaging.requestPermission).toHaveBeenCalledTimes(1);
    expect(puts()).toHaveLength(1);
  });
});

describe('notification permission on Android', () => {
  const asAndroid = (version: number) => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue(version);
  };

  it('Android 13+: asks through the system permission (Firebase\'s own call does not prompt on Android) and registers as ANDROID', async () => {
    asAndroid(34);
    const check = jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
    const request = jest
      .spyOn(PermissionsAndroid, 'request')
      .mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);

    expect(await syncPushDevice('prs')).toBe('no-permission');
    expect(request).not.toHaveBeenCalled();

    expect(await enablePush('prs')).toBe('registered');
    expect(check).toHaveBeenCalledWith('android.permission.POST_NOTIFICATIONS');
    expect(request).toHaveBeenCalledWith('android.permission.POST_NOTIFICATIONS');
    expect(messaging.requestPermission).not.toHaveBeenCalled();
    expect(puts()[0].body).toMatchObject({ platform: 'ANDROID' });
  });

  it.each([
    [PermissionsAndroid.RESULTS.DENIED],
    [PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN],
  ])('Android 13+: "%s" is a no', async answer => {
    asAndroid(33);
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
    jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(answer);
    expect(await enablePush('prs')).toBe('no-permission');
    expect(writes()).toEqual([]);
  });

  it('Android 13+: already allowed means no prompt', async () => {
    asAndroid(35);
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
    const request = jest.spyOn(PermissionsAndroid, 'request');
    expect(await enablePush('prs')).toBe('registered');
    expect(request).not.toHaveBeenCalled();
  });

  it('Android 12 and older: nothing to ask, but notifications switched off in system settings still count as a no', async () => {
    asAndroid(31);
    const request = jest.spyOn(PermissionsAndroid, 'request');
    messaging.__state.permission = DENIED;
    expect(await enablePush('prs')).toBe('no-permission');
    messaging.__state.permission = AUTHORIZED;
    expect(await enablePush('prs')).toBe('registered');
    expect(request).not.toHaveBeenCalled();
  });
});

describe('forgetting this phone on sign-out', () => {
  it('removes the token that was registered', async () => {
    await syncPushDevice('prs');
    fetchMock.mockClear();
    await forgetPushDevice();
    expect(writes()).toEqual([
      { method: 'DELETE', path: '/notifications/devices', query: {}, body: { token: 'fcm-token-1' } },
    ]);
  });

  it('finds the token itself after an app restart (nothing remembered)', async () => {
    await forgetPushDevice();
    expect(writes().map(c => c.body)).toEqual([{ token: 'fcm-token-1' }]);
  });

  it('and registers again afterwards (a new person signing in on this phone)', async () => {
    await syncPushDevice('prs');
    await forgetPushDevice();
    await syncPushDevice('prs');
    expect(puts()).toHaveLength(2);
  });

  it('does nothing when there is no token, and never throws when the server is unreachable', async () => {
    messaging.getToken.mockResolvedValueOnce(null);
    await expect(forgetPushDevice()).resolves.toBeUndefined();
    expect(writes()).toEqual([]);

    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    await expect(forgetPushDevice()).resolves.toBeUndefined();
  });

  it('does not make signing out wait on a server that never answers', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    let done = false;
    const pending = forgetPushDevice().then(() => {
      done = true;
    });
    await ReactTestRenderer.act(async () => {
      await new Promise<void>(resolve => setImmediate(resolve));
    });
    expect(done).toBe(false);
    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(3000);
    });
    await pending;
    expect(done).toBe(true);
  });
});

describe('PushRegistrar (keeps the server up to date while someone who wants the messages is signed in)', () => {
  const user = (overrides: Partial<User> = {}): User => ({
    id: 'u1',
    phone_number: '+93701234567',
    full_name: 'احمد',
    role: 'USER',
    avatar: null,
    enable_daily_motivation: true,
    has_seen_welcome: true,
    ...overrides,
  });

  /** The registrar under a real AuthProvider that already holds a saved session. */
  const mountWith = async (saved: User | null, extra: Record<string, { status?: number; body?: unknown }> = {}) => {
    keychain.getGenericPassword.mockResolvedValue(
      saved
        ? { password: JSON.stringify({ token: 'session-token', expiresAt: Date.now() + 3_600_000, user: saved }) }
        : false,
    );
    mockApi(fetchMock, {
      'PUT /notifications/devices': { status: 204 },
      'DELETE /notifications/devices': { status: 204 },
      'GET /users/me': { body: saved },
      ...extra,
    });
    const tree = await render(
      <AuthProvider>
        <PushRegistrar />
      </AuthProvider>,
    );
    await flushAll();
    await flushAll();
    return tree;
  };

  it('registers the phone at start-up for a signed-in user who wants the messages', async () => {
    const tree = await mountWith(user());
    expect(puts()).toHaveLength(1);
    tree.unmount();
  });

  it.each([
    ['has switched the messages off', user({ enable_daily_motivation: false })],
    ['is signed out', null],
  ])('does nothing for someone who %s', async (_name, saved) => {
    const tree = await mountWith(saved);
    expect(puts()).toEqual([]);
    tree.unmount();
  });

  it('treats a saved session from before the setting existed as "wants them"', async () => {
    const old = (({ enable_daily_motivation: _ignored, ...rest }) => rest)(user()) as unknown as User;
    const tree = await mountWith(old, { 'GET /users/me': { body: old } });
    expect(puts()).toHaveLength(1);
    tree.unmount();
  });

  it('never prompts: a phone that has not been asked is left alone until a tap asks', async () => {
    messaging.__state.permission = UNDETERMINED;
    const tree = await mountWith(user());
    expect(messaging.requestPermission).not.toHaveBeenCalled();
    expect(puts()).toEqual([]);
    tree.unmount();
  });

  it('follows Firebase issuing a new token, and stops listening when it goes away', async () => {
    const tree = await mountWith(user());
    messaging.__state.token = 'fcm-token-2';
    await ReactTestRenderer.act(async () => messaging.__emitTokenRefresh('fcm-token-2'));
    await flushAll();
    expect(puts().map(c => (c.body as { token: string }).token)).toEqual(['fcm-token-1', 'fcm-token-2']);

    await ReactTestRenderer.act(async () => tree.unmount());
    messaging.__state.token = 'fcm-token-3';
    await ReactTestRenderer.act(async () => messaging.__emitTokenRefresh('fcm-token-3'));
    await flushAll();
    expect(puts()).toHaveLength(2);
  });

  it('notices a permission switched on in system settings when the app returns to the foreground', async () => {
    let onChange: (state: string) => void = () => undefined;
    const remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, listener: (state: string) => void) => {
      onChange = listener;
      return { remove };
    }) as never);

    messaging.__state.permission = DENIED;
    const tree = await mountWith(user());
    expect(puts()).toEqual([]);

    messaging.__state.permission = AUTHORIZED;
    await ReactTestRenderer.act(async () => onChange('background'));
    await flushAll();
    expect(puts()).toEqual([]); // only coming back to the front counts
    await ReactTestRenderer.act(async () => onChange('active'));
    await flushAll();
    expect(puts()).toHaveLength(1);
    // Coming to the front again with nothing changed does not repeat the call.
    await ReactTestRenderer.act(async () => onChange('active'));
    await flushAll();
    expect(puts()).toHaveLength(1);

    await ReactTestRenderer.act(async () => tree.unmount());
    expect(remove).toHaveBeenCalled();
  });

  it('tells the server when the app language changes', async () => {
    const tree = await mountWith(user());
    await ReactTestRenderer.act(async () => {
      await changeLanguage('ps');
    });
    await flushAll();
    expect(puts().map(c => (c.body as { language: string }).language)).toEqual(['prs', 'ps']);
    tree.unmount();
  });
});

describe('signing out', () => {
  const Probe = ({ out }: { out: { current: ReturnType<typeof useAuth> | null } }) => {
    out.current = useAuth();
    return null;
  };
  const saved: User = {
    id: 'u1',
    phone_number: '+93701234567',
    full_name: 'احمد',
    role: 'USER',
    avatar: null,
    enable_daily_motivation: true,
    has_seen_welcome: true,
  };
  const session = () => ({
    password: JSON.stringify({ token: 'session-token', expiresAt: Date.now() + 3_600_000, user: saved }),
  });

  it('removes this phone from the account while the token still works, then ends the session', async () => {
    keychain.getGenericPassword.mockResolvedValue(session());
    mockApi(fetchMock, {
      'GET /users/me': { body: saved },
      'DELETE /notifications/devices': { status: 204 },
    });
    const out: { current: ReturnType<typeof useAuth> | null } = { current: null };
    const tree = await render(
      <AuthProvider>
        <Probe out={out} />
      </AuthProvider>,
    );
    await flushAll();
    expect(out.current?.status).toBe('signedIn');

    await ReactTestRenderer.act(async () => {
      await out.current?.signOut();
    });
    const del = fetchMock.mock.calls.find(([, init]) => init?.method === 'DELETE');
    expect(del?.[1].headers.Authorization).toBe('Bearer session-token');
    expect(JSON.parse(del?.[1].body)).toEqual({ token: 'fcm-token-1' });
    expect(out.current?.status).toBe('signedOut');
    expect(getAuthToken()).toBeNull();
    tree.unmount();
  });

  it('still signs out when the server cannot be reached', async () => {
    keychain.getGenericPassword.mockResolvedValue(session());
    fetchMock.mockImplementation(async (url: string, init: RequestInit = {}) => {
      if (init.method === 'DELETE') throw new TypeError('Network request failed');
      return jsonResponse(200, saved);
    });
    const out: { current: ReturnType<typeof useAuth> | null } = { current: null };
    const tree = await render(
      <AuthProvider>
        <Probe out={out} />
      </AuthProvider>,
    );
    await flushAll();
    await ReactTestRenderer.act(async () => {
      await out.current?.signOut();
    });
    expect(out.current?.status).toBe('signedOut');
    tree.unmount();
  });

  it('an expired session (401) ends without trying to remove the phone, which would only fail again', async () => {
    keychain.getGenericPassword.mockResolvedValue(session());
    mockApi(fetchMock, {
      'GET /users/me': { status: 401, body: { message: 'Unauthorized' } },
      'DELETE /notifications/devices': { status: 204 },
    });
    const out: { current: ReturnType<typeof useAuth> | null } = { current: null };
    const tree = await render(
      <AuthProvider>
        <Probe out={out} />
      </AuthProvider>,
    );
    await flushAll();
    await flushAll();
    expect(out.current?.status).toBe('signedOut');
    expect(callsTo(fetchMock).some(c => c.method === 'DELETE')).toBe(false);
    tree.unmount();
  });
});
