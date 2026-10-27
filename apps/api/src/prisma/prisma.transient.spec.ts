import { describe, expect, it } from 'vitest';
import { isTransientDbError } from './prisma.transient.js';

describe('isTransientDbError', () => {
  it('recognises the pg-pool errors from the reported crash, wherever in the cause chain they sit', () => {
    const cause = new Error('Connection terminated unexpectedly');
    expect(isTransientDbError(new Error('Connection terminated due to connection timeout'))).toBe(true);
    expect(isTransientDbError(cause)).toBe(true);
    expect(isTransientDbError(new Error('driver failed', { cause }))).toBe(true);
    expect(isTransientDbError(new Error('outer', { cause: new Error('mid', { cause }) }))).toBe(true);
  });

  it('recognises socket, Postgres and Prisma connection codes', () => {
    for (const code of ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', '08006', '57P01', '57P03', '53300', 'P1001', 'P1017', 'P2024']) {
      expect(isTransientDbError(Object.assign(new Error('x'), { code }))).toBe(true);
    }
  });

  it('does not treat real query problems, or waiting for a free connection, as transient', () => {
    expect(isTransientDbError(Object.assign(new Error('duplicate key'), { code: '23505' }))).toBe(false);
    expect(isTransientDbError(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }))).toBe(false);
    expect(isTransientDbError(new Error('timeout exceeded when trying to connect'))).toBe(false);
    expect(isTransientDbError(new TypeError('x is not a function'))).toBe(false);
    expect(isTransientDbError(null)).toBe(false);
    expect(isTransientDbError('Connection terminated')).toBe(false);
  });

  it('terminates on a cyclic cause chain', () => {
    const a: Error & { cause?: unknown } = new Error('a');
    a.cause = a;
    expect(isTransientDbError(a)).toBe(false);
  });
});
