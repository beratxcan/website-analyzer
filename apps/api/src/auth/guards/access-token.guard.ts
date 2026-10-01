import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ApiException, ErrorCode } from '../../common/errors';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import type { RequestUser } from '../../common/request-user';
import { ACCESS_TOKEN_COOKIE } from '../auth.constants';
import { TokensService } from '../tokens.service';

export interface AuthenticatedRequest extends Request {
  user?: RequestUser;
}

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokensService: TokensService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.cookies?.[ACCESS_TOKEN_COOKIE] as string | undefined;
    if (!token) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHORIZED, 'Authentication required');
    }

    const payload = this.tokensService.verifyAccessToken(token);
    request.user = { id: payload.sub, email: payload.email };
    return true;
  }
}