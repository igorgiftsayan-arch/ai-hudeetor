import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { IdentityError } from '@atlas/backend';

@Catch()
export class ErrorEnvelopeFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const status =
      exception instanceof IdentityError
        ? exception.status
        : exception instanceof HttpException
          ? exception.getStatus()
          : HttpStatus.INTERNAL_SERVER_ERROR;
    const isNotFound = status === HttpStatus.NOT_FOUND;
    const isValidation =
      exception instanceof HttpException &&
      [HttpStatus.BAD_REQUEST, HttpStatus.UNPROCESSABLE_ENTITY].includes(
        exception.getStatus(),
      );

    response.status(status).json({
      error: {
        code:
          exception instanceof IdentityError
            ? exception.code
            : isValidation
              ? 'VALIDATION_ERROR'
              : isNotFound
                ? 'RESOURCE_NOT_FOUND'
                : status === 503
                  ? 'SERVICE_UNAVAILABLE'
                  : 'INTERNAL_ERROR',
        message:
          exception instanceof IdentityError
            ? exception.message
            : isValidation
              ? 'Request validation failed'
              : isNotFound
                ? 'Resource not found'
                : status === 503
                  ? 'Service dependencies are not ready'
                  : 'Unexpected server error',
        details: exception instanceof IdentityError ? exception.details : {},
        request_id:
          response.locals.requestId ??
          request.header('x-request-id') ??
          'unknown',
      },
    });
  }
}
