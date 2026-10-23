interface HeaderReader {
  get(name: string): string | null;
}

/**
 * The address chain to hand to the API as X-Forwarded-For: what the reverse proxy in front of the panel recorded (it
 * is the one that saw the client's connection). Null when there is none, for example in local development.
 */
export function forwardedFor(headers: HeaderReader): string | null {
  const chain = headers.get('x-forwarded-for')?.trim();
  return chain ? chain.slice(0, 500) : null;
}
