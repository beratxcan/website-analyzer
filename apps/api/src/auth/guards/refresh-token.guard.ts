import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ApiException, ErrorCode } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { REFRESH_TOKEN_COOKIE } from '../auth.constants';
import { TokensService } from '../tokens.service';

export interface RefreshTokenRequest extends Request {
  refreshToken?: {
    id: string;
    userId: string;
  };
}

@Injectable()
export class RefreshTokenGuard implements CanActivate {
  constructor(
    private readonly tokensService: TokensService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RefreshTokenRequest>();
    const raw = request.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;
    if (!raw) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHORIZED, 'No refresh session');
    }

    // The cookie carries the opaque token; only its SHA-256 hash is persisted.
    const tokenHash = this.tokensService.hashRefreshToken(raw);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.revokedAt !== null || stored.expiresAt <= new Date()) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        ErrorCode.TOKEN_REVOKED,
        'Refresh session is no longer valid',
      );
    }

    request.refreshToken = { id: stored.id, userId: stored.userId };
    return true;
  }
}