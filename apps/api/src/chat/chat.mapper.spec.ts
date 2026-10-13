import { decodeCursor, encodeCursor } from './chat.mapper.js';

describe('message cursors', () => {
  const row = { id: '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f', createdAt: new Date('2026-10-13T10:11:12.345Z') };

  it('round-trips a message position exactly, to the millisecond', () => {
    expect(decodeCursor(encodeCursor(row))).toEqual(row);
  });

  it.each(['', 'not-base64-at-all!!', Buffer.from('2026-10-13T10:11:12.345Z').toString('base64url'), Buffer.from('nope|3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f').toString('base64url'), Buffer.from('2026-10-13T10:11:12.345Z|not-a-uuid').toString('base64url'), Buffer.from('2026-10-13T10:11:12.345Z|3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f|x').toString('base64url')])(
    'rejects a malformed cursor %#',
    (cursor) => {
      expect(decodeCursor(cursor)).toBeNull();
    },
  );
});
