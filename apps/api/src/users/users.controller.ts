import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, UseGuards } from '@nestjs/common';
import type { User } from '@bongah/shared-types';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { registerUserSchema, type RegisterUserDto } from './dto/register-user.dto.js';
import { updatePreferencesSchema, type UpdatePreferencesDto } from './dto/update-preferences.dto.js';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser): Promise<User> {
    return this.users.me(user.id);
  }

  /** Finishes sign-up after the first OTP login: sets the display name (and optional avatar). */
  @Post('register')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  register(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(registerUserSchema)) body: RegisterUserDto,
  ): Promise<User> {
    return this.users.register(user.id, body);
  }

  /** The user's own settings: the morning-quote push on/off, and "the welcome card has been shown". */
  @Patch('me/preferences')
  @UseGuards(JwtAuthGuard)
  updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updatePreferencesSchema)) body: UpdatePreferencesDto,
  ): Promise<User> {
    return this.users.updatePreferences(user.id, body);
  }
}
