import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { createUserSchema } from '@bongah/validation';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // Placeholder: validates with the shared Zod schema. Persistence comes later.
  @Post('validate')
  validate(@Body() body: unknown) {
    const result = createUserSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.issues);
    }
    const { password: _password, ...safe } = result.data;
    return safe;
  }
}
