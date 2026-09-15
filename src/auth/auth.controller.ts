import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Request,
} from '@nestjs/common';
import * as authGuard from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { Public } from './auth.decorator.js';
import { UsersService } from '../users/users.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private usersService: UsersService,
  ) {}

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  signIn(@Body() signInDto: Record<string, any>) {
    return this.authService.signIn(signInDto.username, signInDto.password);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('register')
  register(@Body() signInDto: Record<string, any>) {
    return this.usersService.register(signInDto.username, signInDto.password);
  }

  @Get('profile')
  getProfile(@Request() req: authGuard.RequestWithUser): authGuard.JwtPayload {
    return req.user;
  }
}
