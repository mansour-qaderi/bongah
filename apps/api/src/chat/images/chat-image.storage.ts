export const CHAT_IMAGE_STORAGE = Symbol('CHAT_IMAGE_STORAGE');

/**
 * Where chat picture bytes live. The database row (ChatImage) says who uploaded what and which
 * message carries it; this only moves bytes. Swap the implementation for S3 / R2 / GCS in
 * ChatModule when going to production: nothing else changes.
 */
export interface ChatImageStorage {
  /** Stores the bytes under `id` (a UUID made by us). */
  save(id: string, data: Buffer): Promise<void>;
  /** The bytes, or null if there are none under that id. */
  read(id: string): Promise<Buffer | null>;
  /** Removes the bytes; not an error if they are already gone. */
  remove(id: string): Promise<void>;
}
