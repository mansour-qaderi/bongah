import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ChatImageStorage } from './chat-image.storage.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Chat pictures on the server's own disk. Fine for development and a single server. NOT for
 * production at any scale: the files vanish with the machine, and a second server cannot see them.
 */
export class DiskChatImageStorage implements ChatImageStorage {
  private readonly dir: string;
  private ready: Promise<unknown> | null = null;

  constructor(baseDir: string) {
    this.dir = join(baseDir, 'chat-images');
  }

  async save(id: string, data: Buffer): Promise<void> {
    await this.ensureDir();
    await writeFile(this.pathOf(id), data, { flag: 'wx' });
  }

  async read(id: string): Promise<Buffer | null> {
    try {
      return await readFile(this.pathOf(id));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    await rm(this.pathOf(id), { force: true });
  }

  /** The ids are UUIDs we generate; refuse anything else so an id can never name a path outside the folder. */
  private pathOf(id: string): string {
    if (!UUID.test(id)) throw new Error('Invalid image id.');
    return join(this.dir, id);
  }

  private ensureDir(): Promise<unknown> {
    this.ready ??= mkdir(this.dir, { recursive: true });
    return this.ready;
  }
}
