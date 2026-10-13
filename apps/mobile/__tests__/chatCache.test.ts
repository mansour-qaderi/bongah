import type { ChatMessage } from '@bongah/shared-types';
import {
  allMessages,
  insertMessage,
  markReadBy,
  type MessagesData,
} from '../src/chat/messageCache';
import { mapsUrl } from '../src/chat/mapLinks';
import {
  chatItems,
  imageOutgoing,
  locationOutgoing,
  textOutgoing,
  toSendInput,
} from '../src/chat/outbox';
import { messagePreview } from '../src/chat/preview';
import { newClientId } from '../src/chat/uuid';

const message = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'm1',
  conversation_id: 'c1',
  sender_id: 'me',
  type: 'TEXT',
  body: 'سلام',
  image_url: null,
  lat: null,
  lng: null,
  is_auto_reply: false,
  client_id: '11111111-1111-4111-8111-111111111111',
  read_at: null,
  created_at: '2026-10-13T08:00:00.000Z',
  ...overrides,
});

const history = (...pages: ChatMessage[][]): MessagesData => ({
  pages: pages.map((data, i) => ({
    data,
    next_cursor: i < pages.length - 1 ? 'cursor' : null,
  })),
  pageParams: pages.map(() => undefined),
});

describe('insertMessage', () => {
  it('puts a new message at the top of the newest page', () => {
    const data = history([message({ id: 'm1' })], [message({ id: 'm0' })]);
    const next = insertMessage(data, message({ id: 'm2' }));
    expect(next?.pages[0].data.map(m => m.id)).toEqual(['m2', 'm1']);
    expect(next?.pages[1].data.map(m => m.id)).toEqual(['m0']);
  });

  it('ignores a message that is already there, on any page (socket + fetch can both deliver it)', () => {
    const data = history([message({ id: 'm1' })], [message({ id: 'm0' })]);
    expect(insertMessage(data, message({ id: 'm0' }))).toBe(data);
  });

  it('leaves a history that was never loaded alone', () => {
    expect(insertMessage(undefined, message())).toBeUndefined();
    const empty: MessagesData = { pages: [], pageParams: [] };
    expect(insertMessage(empty, message())).toBe(empty);
  });
});

describe('markReadBy', () => {
  const at = '2026-10-13T09:00:00.000Z';

  it('marks what the others sent to the reader, not what the reader sent', () => {
    const data = history([
      message({ id: 'toThem', sender_id: 'me' }),
      message({ id: 'fromThem', sender_id: 'them' }),
    ]);
    // "them" read the chat: my messages become read; theirs are untouched.
    const next = markReadBy(data, 'them', at);
    const byId = Object.fromEntries(allMessages(next).map(m => [m.id, m]));
    expect(byId.toThem.read_at).toBe(at);
    expect(byId.fromThem.read_at).toBeNull();
  });

  it('keeps an earlier read time and returns the same object when nothing changes', () => {
    const data = history([
      message({ id: 'a', read_at: '2026-10-13T08:30:00.000Z' }),
    ]);
    expect(markReadBy(data, 'them', at)).toBe(data);
    expect(markReadBy(undefined, 'them', at)).toBeUndefined();
  });
});

describe('chatItems', () => {
  const ME = 'me';

  it('shows my unsent messages on top, newest first', () => {
    const first = textOutgoing('c-1', 'اول');
    const second = textOutgoing('c-2', 'دوم');
    const items = chatItems([message({ id: 'old' })], [first, second], ME);
    expect(items.map(i => i.key)).toEqual(['out-c-2', 'out-c-1', 'old']);
  });

  it('drops an unsent message once its stored copy has arrived, so it never shows twice', () => {
    const out = textOutgoing('c-1', 'سلام');
    const stored = message({ id: 'srv', client_id: 'c-1' });
    expect(chatItems([stored], [out], ME).map(i => i.key)).toEqual(['srv']);
  });

  it("does not confuse another person's message with the same client id", () => {
    const out = textOutgoing('c-1', 'سلام');
    const theirs = message({ id: 'srv', client_id: 'c-1', sender_id: 'them' });
    expect(chatItems([theirs], [out], ME)).toHaveLength(2);
  });
});

describe('toSendInput', () => {
  it('builds each kind of message with the client id', () => {
    expect(toSendInput(textOutgoing('c-1', 'سلام'), null)).toEqual({
      type: 'TEXT',
      client_id: 'c-1',
      body: 'سلام',
    });
    expect(toSendInput(locationOutgoing('c-2', 34.5, 69.1), null)).toEqual({
      type: 'LOCATION',
      client_id: 'c-2',
      lat: 34.5,
      lng: 69.1,
      body: undefined,
    });
    expect(
      toSendInput(imageOutgoing('c-3', 'file:///a.jpg', 'image/jpeg'), 'img-1'),
    ).toEqual({
      type: 'IMAGE',
      client_id: 'c-3',
      image_id: 'img-1',
      body: undefined,
    });
  });

  it('refuses to send a picture that was not uploaded', () => {
    expect(() =>
      toSendInput(imageOutgoing('c-3', 'file:///a.jpg', 'image/jpeg'), null),
    ).toThrow();
  });
});

describe('small helpers', () => {
  it('makes a v4 uuid the API accepts, and a different one each time', () => {
    const a = newClientId();
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(newClientId()).not.toBe(a);
  });

  it("opens a pin in the phone's own maps app", () => {
    expect(mapsUrl(34.5, 69.1)).toContain('34.5,69.1');
  });

  it('summarises each kind of message for the list', () => {
    const t = ((key: string) => key) as never;
    expect(messagePreview(message({ sender_id: 'them' }), 'me', t)).toBe(
      'سلام',
    );
    expect(messagePreview(message(), 'me', t)).toBe('chat.you سلام');
    expect(
      messagePreview(
        message({ type: 'IMAGE', body: null, sender_id: 'them' }),
        'me',
        t,
      ),
    ).toBe('chat.photo');
    expect(
      messagePreview(
        message({ type: 'LOCATION', body: null, sender_id: 'them' }),
        'me',
        t,
      ),
    ).toBe('chat.location');
  });
});
