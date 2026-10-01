import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { sign, verify, type SignOptions } from 'jsonwebtoken';
import { ApiException, ErrorCode } from '../common/errors';
import type { RequestUser } from '../common/request-user';
import { APP_CONFIG, type AppConfig } from '../config/config.constants';

export interface AccessTokenPayload {
  sub: string;
  email: string;
}

export interface GeneratedRefreshToken {
  /** The raw opaque token sent to the browser in the HttpOnly cookie. */
  raw: string;
  /** SHA-256 of the raw token — the only form persisted. */
  hash: string;
}

@Injectable()
export class TokensService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  signAccessToken(user: RequestUser): string {
    return sign({ email: user.email }, this.config.JWT_ACCESS_SECRET, {
      subject: user.id,
      expiresIn: this.config.ACCESS_TOKEN_TTL as SignOptions['expiresIn'],
    });
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      const payload = verify(token, this.config.JWT_ACCESS_SECRET);
      if (typeof payload === 'string' || typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
        throw new Error('Malformed access token payload');
      }
      return { sub: payload.sub, email: payload.email };
    } catch {
      throw new ApiException(HttpStatus.UNAUTHORIZED, ErrorCode.INVALID_TOKEN, 'Invalid or expired access token');
    }
  }

  generateRefreshToken(): GeneratedRefreshToken {
    const raw = randomBytes(32).toString('hex');
    return { raw, hash: createHash('sha256').update(raw).digest('hex') };
  }

  hashRefreshToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}