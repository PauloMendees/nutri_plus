import { ConfigService } from '@nestjs/config';
import { SupabaseStrategy } from './supabase.strategy';
import { UsersService } from '../../users/users.service';

describe('SupabaseStrategy.validate', () => {
  const users = { findByAuthProviderId: jest.fn().mockResolvedValue(null) };
  const config = { getOrThrow: () => 'https://proj.supabase.co' } as unknown as ConfigService;
  const strategy = new SupabaseStrategy(config, users as unknown as UsersService);

  it('exposes the signup WhatsApp from user metadata', async () => {
    const ctx = await strategy.validate({
      sub: 'sub-1',
      email: 'a@x.com',
      user_metadata: { name: 'Ann', whatsapp: '5511999998888' },
    });
    expect(ctx.whatsapp).toBe('5511999998888');
  });

  it('leaves WhatsApp undefined when metadata has none', async () => {
    const ctx = await strategy.validate({ sub: 'sub-1', email: 'a@x.com' });
    expect(ctx.whatsapp).toBeUndefined();
  });
});
