import { HttpException, HttpStatus } from '@nestjs/common';

export const RATE_LIMITED_MESSAGE = 'Muitas solicitações. Aguarde um minuto e tente de novo.';

// O AllExceptionsFilter repassa `code` como campo extra do corpo.
export class RateLimitedException extends HttpException {
  constructor() {
    super(
      { statusCode: HttpStatus.TOO_MANY_REQUESTS, code: 'RATE_LIMITED', message: RATE_LIMITED_MESSAGE },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
