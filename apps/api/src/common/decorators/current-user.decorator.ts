import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { RequestUser } from '../request-user';

/** Resolves the authenticated user attached by the access guard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const request = ctx.switchToHttp().getRequest<{ user?: RequestUser }>();
    if (!request.user) {
      throw new Error('CurrentUser decorator used outside an authenticated request');
    }
    return request.user;
  },
);