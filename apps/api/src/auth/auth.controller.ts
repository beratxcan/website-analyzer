import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthMeResponse, LoginResponse, RegisterResponse } from '@analyzer/contracts';
import type { Response } from 'express';
import { RateLimitCategory, THROTTLER_NAMES } from '../common/rate-limit.constants';
import { APP_CONFIG, type AppConfig } from '../config/config.constants';
import { AuthUserResponseDto } from '../common/response.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/request-user';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from './auth.constants';
import { AuthService, type AuthSession } from './auth.service';
import { durationToMs } from './duration';
import { LoginRequestDto } from './dto/login.dto';
import { RegisterRequestDto } from './dto/register.dto';
import { RefreshTokenGuard, type RefreshTokenRequest } from './guards/refresh-token.guard';

// Credential endpoints share one strict, security-critical budget (the `auth`
// throttler fails closed when Redis is unavailable).
@RateLimitCategory(THROTTLER_NAMES.auth)
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new account (creates a session)' })
  @ApiCreatedResponse({ type: AuthUserResponseDto })
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: RegisterRequestDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RegisterResponse> {
    const session = await this.authService.register(dto);
    this.setAuthCookies(res, session);
    return { user: session.user };
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Log in and establish a session' })
  @ApiOkResponse({ type: AuthUserResponseDto })
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginRequestDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const session = await this.authService.login(dto);
    this.setAuthCookies(res, session);
    return { user: session.user };
  }

  @Public()
  @UseGuards(RefreshTokenGuard)
  @Post('refresh')
  @ApiOperation({ summary: 'Rotate the refresh token and issue a new access token' })
  @ApiOkResponse({ type: AuthUserResponseDto })
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: RefreshTokenRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    // RefreshTokenGuard guarantees `refreshToken` is present.
    const token = req.refreshToken!;
    const session = await this.authService.refresh(token.id, token.userId);
    this.setAuthCookies(res, session);
    return { user: session.user };
  }

  @Public()
  @UseGuards(RefreshTokenGuard)
  @Post('logout')
  @ApiOperation({ summary: 'Revoke the refresh session and clear cookies' })
  @ApiNoContentResponse()
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: RefreshTokenRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    // RefreshTokenGuard guarantees `refreshToken` is present.
    await this.authService.logout({ id: req.refreshToken!.id, revokedAt: null });
    this.clearAuthCookies(res);
  }

  @ApiCookieAuth(ACCESS_TOKEN_COOKIE)
  @Get('me')
  @ApiOperation({ summary: 'Return the current authenticated user' })
  @ApiOkResponse({ type: AuthUserResponseDto })
  async me(@CurrentUser() user: RequestUser): Promise<AuthMeResponse> {
    const me = await this.authService.me(user.id);
    return { user: me };
  }

  private setAuthCookies(res: Response, session: AuthSession): void {
    const isProduction = this.config.NODE_ENV === 'production';
    const baseOptions = {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: isProduction,
      path: '/',
    };
    res.cookie(ACCESS_TOKEN_COOKIE, session.accessToken, {
      ...baseOptions,
      maxAge: durationToMs(this.config.ACCESS_TOKEN_TTL),
    });
    res.cookie(REFRESH_TOKEN_COOKIE, session.refreshToken.raw, {
      ...baseOptions,
      maxAge: durationToMs(this.config.REFRESH_TOKEN_TTL),
    });
  }

  private clearAuthCookies(res: Response): void {
    const isProduction = this.config.NODE_ENV === 'production';
    const options = { httpOnly: true, sameSite: 'lax' as const, secure: isProduction, path: '/' };
    res.clearCookie(ACCESS_TOKEN_COOKIE, options);
    res.clearCookie(REFRESH_TOKEN_COOKIE, options);
  }
}