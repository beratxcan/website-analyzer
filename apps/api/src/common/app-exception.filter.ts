import { ArgumentsHost, Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { ApiErrorBody } from '@analyzer/contracts';
import { isRecord } from '@analyzer/shared';
import type { Response } from 'express';
import { ApiException, ErrorCode } from './errors';
import type { RequestWithRequestId } from './request-id.middleware';

interface ErrorMapping {
  status: number;
  error: ApiErrorBody;
}

@Catch()
export class AppExceptionFilter {
  private readonly logger = new Logger(AppExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithRequestId>();
    const requestId = request.requestId;

    const { status, error } = this.toErrorBody(exception, requestId);

    if (status >= 500) {
      this.logger.error(
        `Unhandled error [${error.code}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`Request failed [${error.code}] ${request.method} ${request.originalUrl}`);
    }

    response.status(status).json({ error });
  }

  private toErrorBody(exception: unknown, requestId?: string): ErrorMapping {
    if (exception instanceof ApiException) {
      return {
        status: exception.getStatus(),
        error: {
          code: exception.code,
          message: exception.message,
          requestId,
          ...(exception.details ? { details: exception.details } : {}),
        },
      };
    }

    if (exception instanceof ThrottlerException) {
      return {
        status: HttpStatus.TOO_MANY_REQUESTS,
        error: { code: ErrorCode.RATE_LIMIT_EXCEEDED, message: 'Too many requests', requestId },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      // ValidationPipe failures arrive as BadRequestException with a message array.
      if (status === HttpStatus.BAD_REQUEST && isRecord(body) && Array.isArray(body.message)) {
        return {
          status,
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Validation failed',
            requestId,
            details: { fields: body.message },
          },
        };
      }

      return {
        status,
        error: {
          code: this.mapStatusToCode(status),
          message:
            status >= 500 ? 'Internal server error' : exception.message || 'Request failed',
          requestId,
        },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Internal server error', requestId },
    };
  }

  private mapStatusToCode(status: number): ErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.VALIDATION_ERROR;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ErrorCode.CONFLICT;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCode.RATE_LIMIT_EXCEEDED;
      default:
        return ErrorCode.INTERNAL_ERROR;
    }
  }
}