import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class ErrorEnvelopeFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const isNotFound = status === HttpStatus.NOT_FOUND;

    response.status(status).json({
      error: {
        code: isNotFound
          ? 'not_found'
          : status === 503
            ? 'service_unavailable'
            : 'internal_error',
        message: isNotFound
          ? 'Resource not found'
          : status === 503
            ? 'Service dependencies are not ready'
            : 'Unexpected server error',
        details: {},
        request_id:
          response.locals.requestId ??
          request.header('x-request-id') ??
          'unknown',
      },
    });
  }
}
