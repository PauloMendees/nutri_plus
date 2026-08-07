import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { PaymentRequiredException } from '../../billing/payment-required.exception';

function host(): { host: ArgumentsHost; json: jest.Mock; status: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnThis();
  const response = { status, json };
  const h = {
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => ({}) }),
    getArgByIndex: () => undefined,
    getArgs: () => [],
    getHandler: () => ({}),
    getClass: () => ({}),
    getType: () => 'http',
  } as unknown as ArgumentsHost;
  return { host: h, json, status };
}

describe('AllExceptionsFilter', () => {
  it('preserva code em 402 AI_QUOTA_EXCEEDED (PaymentRequiredException)', () => {
    const filter = new AllExceptionsFilter();
    const { host: h, json, status } = host();
    filter.catch(new PaymentRequiredException('AI_QUOTA_EXCEEDED'), h);
    expect(status).toHaveBeenCalledWith(402);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 402, code: 'AI_QUOTA_EXCEEDED' }),
    );
  });

  it('preserva code + feature em 402 FEATURE_PRO_ONLY (PaymentRequiredException)', () => {
    const filter = new AllExceptionsFilter();
    const { host: h, json, status } = host();
    filter.catch(new PaymentRequiredException('FEATURE_PRO_ONLY', 'silhueta'), h);
    expect(status).toHaveBeenCalledWith(402);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 402,
        code: 'FEATURE_PRO_ONLY',
        feature: 'silhueta',
      }),
    );
  });

  it('mantém shape exato {statusCode,message,error} para exceções sem campos extras (regressão)', () => {
    const filter = new AllExceptionsFilter();
    const { host: h, json, status } = host();
    filter.catch(new BadRequestException('x'), h);
    expect(status).toHaveBeenCalledWith(400);
    const body = json.mock.calls[0][0];
    expect(body).toEqual({ statusCode: 400, message: 'x', error: 'Bad Request' });
    expect(Object.keys(body).sort()).toEqual(['error', 'message', 'statusCode']);
  });
});
