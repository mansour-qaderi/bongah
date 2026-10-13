import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ConflictException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  CHAT_IMAGE_TYPES,
  type ChatImageType,
  type Paginated,
  type PropertyImageItem,
  type PropertyImageUploaded,
} from '@bongah/shared-types';
import type { PropertyImagesQuery } from '@bongah/validation';
import { sniffImageType } from '../chat/images/image-signature.js';
import { tooLarge } from '../common/upload.js';
import { PerksService } from '../perks/perks.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PROPERTY_IMAGE_SETTINGS, type PropertyImageSettings } from './property-images.config.js';
import { PROPERTY_IMAGE_STORAGE, type PropertyImageStorage } from './property-image.storage.js';

export const IMAGE_QUOTA_REACHED_CODE = 'IMAGE_QUOTA_REACHED';

@Injectable()
export class PropertyImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly perks: PerksService,
    @Inject(PROPERTY_IMAGE_STORAGE) private readonly storage: PropertyImageStorage,
    @Inject(PROPERTY_IMAGE_SETTINGS) private readonly settings: PropertyImageSettings,
  ) {}

  /** The public address of a stored photo; this is what goes in a listing's `images`. */
  urlOf(id: string): string {
    return `${this.settings.publicBaseUrl}/property-images/${id}`;
  }

  /** The most this account may upload per photo and keep in total: more for agencies with the perks. */
  async limitsFor(userId: string): Promise<{ maxBytes: number; maxCount: number }> {
    const advanced = (await this.perks.reasonFor(userId)) !== null;
    return advanced
      ? { maxBytes: this.settings.maxBytesAdvanced, maxCount: this.settings.maxPerAccountAdvanced }
      : { maxBytes: this.settings.maxBytes, maxCount: this.settings.maxPerAccount };
  }

  /** The Content-Type header as one of the accepted picture types, or 415. */
  assertDeclaredType(header: string | undefined): ChatImageType {
    const declared = header?.split(';')[0].trim().toLowerCase();
    if (!declared || !(CHAT_IMAGE_TYPES as readonly string[]).includes(declared)) {
      throw new UnsupportedMediaTypeException({
        message: 'Only JPEG, PNG and WebP pictures can be uploaded.',
        code: 'UNSUPPORTED_IMAGE_TYPE',
      });
    }
    return declared as ChatImageType;
  }

  /**
   * Stores a photo for the user to put on a listing. Checked here, whatever the controller did: the
   * bytes really are a JPEG / PNG / WebP (the header is only the client's word), fit the account's size
   * limit, and the account is under its photo quota.
   */
  async upload(userId: string, declaredType: string | undefined, data: Buffer): Promise<PropertyImageUploaded> {
    const declared = this.assertDeclaredType(declaredType);
    if (data.length === 0) throw new BadRequestException({ message: 'The picture is empty.', code: 'EMPTY_IMAGE' });
    const limits = await this.limitsFor(userId);
    if (data.length > limits.maxBytes) throw tooLarge(limits.maxBytes);

    const actual = sniffImageType(data);
    if (actual !== declared) {
      throw new UnsupportedMediaTypeException({
        message: 'The file is not the kind of picture it says it is.',
        code: 'UNSUPPORTED_IMAGE_TYPE',
      });
    }
    // Checked before the bytes are written. Two uploads at the very same moment can overshoot by one or two:
    // the quota is a brake against filling the disk, not an exact allowance.
    if ((await this.prisma.propertyImage.count({ where: { uploaderId: userId } })) >= limits.maxCount) {
      throw new ForbiddenException({
        message: 'You have reached the limit of stored pictures. Delete some you no longer use.',
        code: IMAGE_QUOTA_REACHED_CODE,
        limit: limits.maxCount,
      });
    }

    const id = randomUUID();
    await this.storage.save(id, data);
    try {
      const row = await this.prisma.propertyImage.create({
        data: { id, uploaderId: userId, contentType: actual, byteSize: data.length },
      });
      return this.toUploaded(row);
    } catch (error) {
      await this.storage.remove(id).catch(() => undefined);
      throw error;
    }
  }

  /** The caller's stored photos, newest first, each with the caller's listings that use it. */
  async listMine(userId: string, query: PropertyImagesQuery): Promise<Paginated<PropertyImageItem>> {
    const where = { uploaderId: userId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.propertyImage.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.propertyImage.count({ where }),
    ]);

    const urls = rows.map((row) => this.urlOf(row.id));
    const users = urls.length
      ? await this.prisma.property.findMany({
          where: { userId, images: { hasSome: urls } },
          select: { id: true, images: true },
        })
      : [];
    return {
      data: rows.map((row) => {
        const url = this.urlOf(row.id);
        return { ...this.toUploaded(row), used_by_property_ids: users.filter((p) => p.images.includes(url)).map((p) => p.id) };
      }),
      meta: { page: query.page, limit: query.limit, total, total_pages: Math.ceil(total / query.limit) },
    };
  }

  /** A photo's bytes for anyone: listing photos are public, like the listings. */
  async download(id: string): Promise<{ contentType: string; data: Buffer }> {
    const image = await this.prisma.propertyImage.findUnique({ where: { id }, select: { contentType: true } });
    if (!image) throw new NotFoundException('Picture not found.');
    const data = await this.storage.read(id);
    if (!data) throw new NotFoundException('Picture not found.');
    return { contentType: image.contentType, data };
  }

  /**
   * Deletes the caller's own photo. Refused (409 IMAGE_IN_USE) while any listing still points at it, so a
   * listing is never left with a broken picture: take it off the listing first.
   */
  async remove(userId: string, id: string): Promise<void> {
    const image = await this.prisma.propertyImage.findFirst({ where: { id, uploaderId: userId }, select: { id: true } });
    if (!image) throw new NotFoundException('Picture not found.'); // someone else's looks exactly like a missing one
    const inUse = await this.prisma.property.count({ where: { images: { has: this.urlOf(id) } } });
    if (inUse > 0) {
      throw new ConflictException({
        message: 'This picture is used by a listing. Remove it from the listing first.',
        code: 'IMAGE_IN_USE',
      });
    }
    await this.prisma.propertyImage.delete({ where: { id } });
    await this.storage.remove(id);
  }

  private toUploaded(row: { id: string; contentType: string; byteSize: number; createdAt: Date }): PropertyImageUploaded {
    return {
      id: row.id,
      url: this.urlOf(row.id),
      content_type: row.contentType,
      byte_size: row.byteSize,
      created_at: row.createdAt.toISOString(),
    };
  }
}
