import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { ContactService } from '../contact/contact.service.js';
import { unlockContactSchema, type ContactAccessDto, type UnlockContactDto } from '../contact/dto/contact.dto.js';
import { createPropertySchema, type CreatePropertyDto } from './dto/create-property.dto.js';
import {
  listPropertiesQuerySchema,
  paginationQuerySchema,
  type ListPropertiesDto,
  type PaginationDto,
} from './dto/list-properties.dto.js';
import type {
  PropertyDto,
  PropertyPageDto,
} from './dto/property-response.dto.js';
import { updatePropertySchema, type UpdatePropertyDto } from './dto/update-property.dto.js';
import { PropertyService } from './property.service.js';

@Controller('properties')
export class PropertyController {
  constructor(
    private readonly properties: PropertyService,
    private readonly contacts: ContactService,
  ) {}

  /** Public search with filters and pagination. */
  @Get()
  list(
    @Query(new ZodValidationPipe(listPropertiesQuerySchema)) query: ListPropertiesDto,
  ): Promise<PropertyPageDto> {
    return this.properties.list(query);
  }

  // Declared before ':id' so "mine" is never read as an id.
  @Get('mine')
  @UseGuards(JwtAuthGuard)
  mine(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationDto,
  ): Promise<PropertyPageDto> {
    return this.properties.listMine(user.id, query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<PropertyDto> {
    return this.properties.findOne(id);
  }

  /**
   * Counts one view for the agency dashboard. Public, so it is rate limited per IP. The app calls
   * it once per opening of the details screen and skips it for the owner; the count is a raw
   * tally of calls, not a proof of distinct people.
   */
  @Post(':id/view')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  view(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.properties.recordView(id);
  }

  /**
   * Whether I can already see the owner's phone number (and what is left of my daily allowance).
   * Never reveals a number I have not unlocked. Needs a signed-in user; rate limited.
   */
  @Get(':id/contact')
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  contact(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ContactAccessDto> {
    return this.contacts.getAccess(user.id, id);
  }

  /**
   * Reveals the owner's phone number: free up to the daily allowance, unlimited for agencies with
   * a subscription, and a credit beyond that only when the body says `use_credit: true`.
   * 403 CONTACT_LIMIT_REACHED when none of those applies.
   */
  @Post(':id/contact/unlock')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  unlockContact(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(unlockContactSchema)) body: UnlockContactDto,
  ): Promise<ContactAccessDto> {
    return this.contacts.unlock(user.id, id, body.use_credit ?? false);
  }

  @Post()
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createPropertySchema)) body: CreatePropertyDto,
  ): Promise<PropertyDto> {
    return this.properties.create(user.id, body);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updatePropertySchema)) body: UpdatePropertyDto,
  ): Promise<PropertyDto> {
    return this.properties.update(user.id, id, body);
  }

  /** Archives the listing (soft delete). */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.properties.archive(user.id, id);
  }
}
