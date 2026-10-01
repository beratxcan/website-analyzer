import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { AuthUser } from '@analyzer/contracts';
import type { User } from '@prisma/client';
import { ApiException, ErrorCode } from '../common/errors';
import { toAuthUser } from '../common/mappers';
import { APP_CONFIG, type AppConfig } from '../config/config.constants';
import { PrismaService } from '../prisma/prisma.service';
import { durationToMs } from './duration';
import { PasswordService } from './password.service';
import type { GeneratedRefreshToken } from './tokens.service';
import { TokensService } from './tokens.service';
import type { LoginRequestDto } from './dto/login.dto';
import type { RegisterRequestDto } from './dto/register.dto';

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  refreshToken: GeneratedRefreshToken;
  refreshExpiresAt: Date;
}

export interface RevocableRefreshToken {
  id: string;
  revokedAt: Date | null;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokensService: TokensService,
  ) {}

  async register(dto: RegisterRequestDto): Promise<AuthSession> {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        ErrorCode.EMAIL_ALREADY_REGISTERED,
        'An account with this email already exists',
      );
    }

    const passwordHash = await this.passwordService.hashPassword(dto.password);
    const user = await this.prisma.user.create({ data: { email, passwordHash } });
    return this.issueSession(user);
  }

  async login(dto: LoginRequestDto): Promise<AuthSession> {
    const email = dto.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Same generic response for unknown email and wrong password to reduce
    // user enumeration.
    if (!user) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        ErrorCode.INVALID_CREDENTIALS,
        'Invalid email or password',
      );
    }

    const valid = await this.passwordService.verifyPassword(user.passwordHash, dto.password);
    if (!valid) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        ErrorCode.INVALID_CREDENTIALS,
        'Invalid email or password',
      );
    }

    return this.issueSession(user);
  }

  /** Rotates the refresh token: revokes the presented one and issues a new session. */
  async refresh(tokenId: string, userId: string): Promise<AuthSession> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, ErrorCode.TOKEN_REVOKED, 'Refresh session is no longer valid');
    }

    await this.prisma.refreshToken.update({
      where: { id: tokenId },
      data: { revokedAt: new Date() },
    });

    return this.issueSession(user);
  }

  /** Revokes the presented refresh token (idempotent). */
  async logout(refreshToken: RevocableRefreshToken): Promise<void> {
    if (refreshToken.revokedAt === null) {
      await this.prisma.refreshToken.update({
        where: { id: refreshToken.id },
        data: { revokedAt: new Date() },
      });
    }
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHORIZED, 'Authentication required');
    }
    return toAuthUser(user);
  }

  private async issueSession(user: User): Promise<AuthSession> {
    const accessToken = this.tokensService.signAccessToken({ id: user.id, email: user.email });
    const refreshToken = this.tokensService.generateRefreshToken();
    const refreshExpiresAt = new Date(Date.now() + durationToMs(this.config.REFRESH_TOKEN_TTL));

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: refreshToken.hash,
        expiresAt: refreshExpiresAt,
      },
    });

    return { user: toAuthUser(user), accessToken, refreshToken, refreshExpiresAt };
  }
}