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
import { createPropertySchema, type CreatePropertyDto } from './dto/create-property.dto.js';
import {
  listPropertiesQuerySchema,
  paginationQuerySchema,
  type ListPropertiesDto,
  type PaginationDto,
} from './dto/list-properties.dto.js';
import type {
  PropertyContactDto,
  PropertyDto,
  PropertyPageDto,
} from './dto/property-response.dto.js';
import { updatePropertySchema, type UpdatePropertyDto } from './dto/update-property.dto.js';
import { PropertyService } from './property.service.js';

@Controller('properties')
export class PropertyController {
  constructor(private readonly properties: PropertyService) {}

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

  /** The owner's phone number. Needs a signed-in user and is rate limited against bulk scraping. */
  @Get(':id/contact')
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  contact(@Param('id', ParseUUIDPipe) id: string): Promise<PropertyContactDto> {
    return this.properties.getContact(id);
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
