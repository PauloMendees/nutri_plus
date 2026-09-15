import { UnauthorizedException } from '@nestjs/common';
import { mockDeep } from 'jest-mock-extended';
import { ConfigService } from '@nestjs/config';
import { LifecycleEmailsService } from './lifecycle-emails.service';
import { InternalLifecycleEmailsController } from './internal-lifecycle-emails.controller';

describe('InternalLifecycleEmailsController', () => {
  const lifecycleEmails = mockDeep<LifecycleEmailsService>();
  function make(secret?: string) {
    const config = { get: () => secret } as unknown as ConfigService;
    return new InternalLifecycleEmailsController(lifecycleEmails, config);
  }

  it('401s when the key is missing or wrong', async () => {
    await expect(make('s3cret').dispatch('nope')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(make('s3cret').dispatch(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('401s (fail-closed) when no secret is configured', async () => {
    await expect(make(undefined).dispatch('anything')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('dispatches when the key matches', async () => {
    lifecycleEmails.dispatch.mockResolvedValue({
      trialNoPatient: { eligible: 0, sent: 0 },
      checkoutAbandoned: { eligible: 0, sent: 0 },
    });
    await make('s3cret').dispatch('s3cret');
    expect(lifecycleEmails.dispatch).toHaveBeenCalled();
  });
});
