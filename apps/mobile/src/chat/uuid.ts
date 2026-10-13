/**
 * A random v4 UUID, used as a message's client_id (the key that makes a retried send safe).
 * It only has to be unique, not unguessable, and Hermes has no `crypto` global, so use
 * crypto.randomUUID when the runtime offers it and Math.random otherwise.
 */
export function newClientId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const r = Math.floor(Math.random() * 16);
    return (char === 'x' ? r : 8 + (r % 4)).toString(16);
  });
}
