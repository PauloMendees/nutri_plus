import { HttpException, HttpStatus } from '@nestjs/common';
import type { BillingErrorCode, PlanFeature } from '@nutri-plus/shared-types';

export class PaymentRequiredException extends HttpException {
  constructor(code: BillingErrorCode, feature?: PlanFeature) {
    super({ statusCode: 402, code, feature }, HttpStatus.PAYMENT_REQUIRED);
  }
}
