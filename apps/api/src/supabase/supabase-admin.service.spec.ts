import {
  BadGatewayException,
  ConflictException,
} from '@nestjs/common';
import { AuthApiError } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import { SupabaseAdminService } from './supabase-admin.service';

describe('SupabaseAdminService', () => {
  let service: SupabaseAdminService;
  let admin: { inviteUserByEmail: jest.Mock; deleteUser: jest.Mock };

  beforeEach(() => {
    const config = {
      getOrThrow: (key: string) =>
        key === 'SUPABASE_URL' ? 'https://x.supabase.co' : 'service-role-key',
    } as unknown as ConfigService;
    service = new SupabaseAdminService(config);
    admin = { inviteUserByEmail: jest.fn(), deleteUser: jest.fn() };
    // Replace the real Supabase client with a fake admin surface.
    (service as any).client = { auth: { admin } };
  });

  describe('inviteUser', () => {
    it('returns the new user id and passes name as metadata', async () => {
      admin.inviteUserByEmail.mockResolvedValue({
        data: { user: { id: 'sub-1' } },
        error: null,
      });

      const result = await service.inviteUser('p@x.com', { name: 'Pat' });

      expect(result).toEqual({ id: 'sub-1' });
      expect(admin.inviteUserByEmail).toHaveBeenCalledWith('p@x.com', {
        data: { name: 'Pat' },
      });
    });

    it('maps an email_exists error code to ConflictException', async () => {
      // Use the real AuthApiError constructor so instanceof check fires on the
      // code branch. Message intentionally does NOT match /already|registered|exists/i
      // to prove it is the code branch — not the regex fallback — that triggers.
      const error = new AuthApiError('Email is taken', 422, 'email_exists');
      admin.inviteUserByEmail.mockResolvedValue({ data: { user: null }, error });

      await expect(
        service.inviteUser('p@x.com', { name: 'Pat' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('maps an "already registered" message (no code) to ConflictException', async () => {
      admin.inviteUserByEmail.mockResolvedValue({
        data: { user: null },
        error: { message: 'User already registered', status: 422 },
      });

      await expect(
        service.inviteUser('p@x.com', { name: 'Pat' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('maps an unrelated API error to BadGatewayException', async () => {
      admin.inviteUserByEmail.mockResolvedValue({
        data: { user: null },
        error: { message: 'internal boom', status: 500 },
      });

      await expect(
        service.inviteUser('p@x.com', { name: 'Pat' }),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });

    it('maps a thrown/rejected SDK call to BadGatewayException', async () => {
      admin.inviteUserByEmail.mockRejectedValue(new Error('network down'));

      await expect(
        service.inviteUser('p@x.com', { name: 'Pat' }),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });

    it('maps a missing user id to BadGatewayException', async () => {
      admin.inviteUserByEmail.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      await expect(
        service.inviteUser('p@x.com', { name: 'Pat' }),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });
  });

  describe('deleteUser', () => {
    it('never throws when the SDK returns an error', async () => {
      admin.deleteUser.mockResolvedValue({ data: null, error: { status: 404 } });
      await expect(service.deleteUser('sub-1')).resolves.toBeUndefined();
    });

    it('never throws when the SDK call rejects', async () => {
      admin.deleteUser.mockRejectedValue(new Error('boom'));
      await expect(service.deleteUser('sub-1')).resolves.toBeUndefined();
    });
  });
});
