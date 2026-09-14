import { HttpException, HttpStatus } from '@nestjs/common';
import { AI_DAILY_CAP_MESSAGE } from './ai-usage-cap.policy';

export type AiCapScope = 'nutritionist' | 'patient';

// 429 e não 402: não é questão de plano, é limite do dia. O runner de jobs
// grava `message` no campo de erro do job, por isso a mensagem é em português.
export class AiDailyCapExceededException extends HttpException {
  constructor(readonly scope: AiCapScope) {
    super(
      { statusCode: HttpStatus.TOO_MANY_REQUESTS, code: 'AI_DAILY_CAP_EXCEEDED', scope, message: AI_DAILY_CAP_MESSAGE },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
