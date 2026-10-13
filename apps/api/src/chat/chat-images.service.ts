import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CHAT_IMAGE_TYPES, type ChatImageType, type ChatImageUploaded } from '@bongah/shared-types';
import { PerksService } from '../perks/perks.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CHAT_SETTINGS, type ChatSettings } from './chat.config.js';
import { tooLarge } from '../common/upload.js';
import { chatImagePath } from './chat.mapper.js';
import { CHAT_IMAGE_STORAGE, type ChatImageStorage } from './images/chat-image.storage.js';
import { sniffImageType } from './images/image-signature.js';

@Injectable()
export class ChatImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly perks: PerksService,
    @Inject(CHAT_IMAGE_STORAGE) private readonly storage: ChatImageStorage,
    @Inject(CHAT_SETTINGS) private readonly settings: ChatSettings,
  ) {}

  /** The most bytes this account may upload: more for agencies with the perks (the high-quality photo perk). */
  async maxBytesFor(userId: string): Promise<number> {
    return (await this.perks.reasonFor(userId)) ? this.settings.imageMaxBytesAdvanced : this.settings.imageMaxBytes;
  }

  /** The Content-Type header as one of the accepted picture types, or 415. */
  assertDeclaredType(header: string | undefined): ChatImageType {
    const declared = header?.split(';')[0].trim().toLowerCase();
    if (!declared || !(CHAT_IMAGE_TYPES as readonly string[]).includes(declared)) {
      throw new UnsupportedMediaTypeException({
        message: 'Only JPEG, PNG and WebP pictures can be sent.',
        code: 'UNSUPPORTED_IMAGE_TYPE',
      });
    }
    return declared as ChatImageType;
  }

  /**
   * Stores an uploaded picture for the user to attach to a message. Checked here, whatever the
   * controller did: the bytes really are a JPEG / PNG / WebP (the header is only the client's word)
   * and fit the account's size limit.
   */
  async upload(userId: string, declaredType: string | undefined, data: Buffer): Promise<ChatImageUploaded> {
    const declared = this.assertDeclaredType(declaredType);
    if (data.length === 0) {
      throw new BadRequestException({ message: 'The picture is empty.', code: 'EMPTY_IMAGE' });
    }
    const max = await this.maxBytesFor(userId);
    if (data.length > max) throw tooLarge(max);

    const actual = sniffImageType(data);
    if (actual !== declared) {
      throw new UnsupportedMediaTypeException({
        message: 'The file is not the kind of picture it says it is.',
        code: 'UNSUPPORTED_IMAGE_TYPE',
      });
    }

    const id = randomUUID();
    await this.storage.save(id, data);
    try {
      await this.prisma.chatImage.create({
        data: { id, uploaderId: userId, contentType: actual, byteSize: data.length },
      });
    } catch (error) {
      await this.storage.remove(id).catch(() => undefined);
      throw error;
    }
    return { id, url: chatImagePath(id), content_type: actual, byte_size: data.length };
  }

  /**
   * A picture's bytes, for the person who uploaded it and (once it is in a message) for the two
   * people in that conversation. Everyone else gets the same 404 as a picture that does not exist.
   */
  async download(userId: string, id: string): Promise<{ contentType: string; data: Buffer }> {
    const image = await this.prisma.chatImage.findUnique({
      where: { id },
      select: {
        uploaderId: true,
        contentType: true,
        message: { select: { conversation: { select: { buyerId: true, sellerId: true } } } },
      },
    });
    const conversation = image?.message?.conversation;
    const allowed =
      image !== null &&
      (image.uploaderId === userId || conversation?.buyerId === userId || conversation?.sellerId === userId);
    if (!image || !allowed) throw new NotFoundException('Picture not found.');

    const data = await this.storage.read(id);
    if (!data) throw new NotFoundException('Picture not found.');
    return { contentType: image.contentType, data };
  }
}
