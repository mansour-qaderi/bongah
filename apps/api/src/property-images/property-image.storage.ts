import type { ChatImageStorage } from '../chat/images/chat-image.storage.js';

export const PROPERTY_IMAGE_STORAGE = Symbol('PROPERTY_IMAGE_STORAGE');

/**
 * Where listing photo bytes live: the same three operations as the chat picture store (save, read,
 * remove by UUID). Swap the implementation for S3 / R2 / GCS in PropertyImagesModule when going to
 * production: nothing else changes, and listings keep working because they only hold the photo's URL.
 */
export type PropertyImageStorage = ChatImageStorage;
