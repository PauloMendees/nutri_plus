import { UnauthorizedException } from '@nestjs/common';
import { mockDeep } from 'jest-mock-extended';
import { ConfigService } from '@nestjs/config';
import { RemindersService } from './reminders.service';
import { InternalRemindersController } from './internal-reminders.controller';

describe('InternalRemindersController', () => {
  const reminders = mockDeep<RemindersService>();
  function make(secret?: string) {
    const config = { get: () => secret } as unknown as ConfigService;
    return new InternalRemindersController(reminders, config);
  }

  it('401s when the key is missing or wrong', async () => {
    await expect(make('s3cret').dispatch('nope')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(make('s3cret').dispatch(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('401s (fail-closed) when no secret is configured', async () => {
    await expect(make(undefined).dispatch('anything')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('dispatches when the key matches', async () => {
    reminders.dispatch.mockResolvedValue({ scanned: 0, sent: 0, tokensRemoved: 0 });
    await make('s3cret').dispatch('s3cret');
    expect(reminders.dispatch).toHaveBeenCalled();
  });
});
