import { HttpException, HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DbUnavailableFilter } from './db-unavailable.filter.js';

function host(headersSent = false) {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const setHeader = vi.fn();
  const response = { headersSent, status, setHeader };
  return {
    json,
    status,
    setHeader,
    host: { getType: () => 'http', switchToHttp: () => ({ getResponse: () => response }) } as never,
  };
}

describe('DbUnavailableFilter', () => {
  it('answers 503 DATABASE_UNAVAILABLE with Retry-After for the error from the report', () => {
    const h = host();
    new DbUnavailableFilter().catch(new Error('Connection terminated due to connection timeout', { cause: new Error('Connection terminated unexpectedly') }), h.host);
    expect(h.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(h.setHeader).toHaveBeenCalledWith('Retry-After', '5');
    expect(h.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'DATABASE_UNAVAILABLE', statusCode: 503 }));
  });

  it('leaves every other error to Nest, unchanged', () => {
    const filter = new DbUnavailableFilter();
    const base = vi.spyOn(Object.getPrototypeOf(DbUnavailableFilter.prototype), 'catch').mockImplementation(() => undefined);
    const h = host();
    const exception = new HttpException('nope', 403);
    filter.catch(exception, h.host);
    filter.catch(new Error('boom'), h.host);
    expect(base).toHaveBeenCalledTimes(2);
    expect(h.status).not.toHaveBeenCalled();
    base.mockRestore();
  });

  it('does not write a second response when headers were already sent', () => {
    const base = vi.spyOn(Object.getPrototypeOf(DbUnavailableFilter.prototype), 'catch').mockImplementation(() => undefined);
    const h = host(true);
    new DbUnavailableFilter().catch(new Error('Connection terminated unexpectedly'), h.host);
    expect(h.status).not.toHaveBeenCalled();
    expect(base).toHaveBeenCalledTimes(1);
    base.mockRestore();
  });
});
