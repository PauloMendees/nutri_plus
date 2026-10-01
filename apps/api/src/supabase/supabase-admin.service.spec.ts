import {
  BadGatewayException,
  ConflictException,
} from '@nestjs/common';
import { AuthApiError } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import { SupabaseAdminService } from './supabase-admin.service';

const storageBucketApi = {
  upload: jest.fn().mockResolvedValue({ data: { path: 'x' }, error: null }),
  getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: 'https://cdn/x.png' } }),
  remove: jest.fn().mockResolvedValue({ data: [], error: null }),
};
const storage = {
  getBucket: jest.fn().mockResolvedValue({ data: { name: 'b' }, error: null }),
  createBucket: jest.fn().mockResolvedValue({ data: { name: 'b' }, error: null }),
  from: jest.fn().mockReturnValue(storageBucketApi),
};

describe('SupabaseAdminService', () => {
  let service: SupabaseAdminService;
  let admin: { inviteUserByEmail: jest.Mock; deleteUser: jest.Mock; listUsers: jest.Mock };

  beforeEach(() => {
    const config = {
      getOrThrow: (key: string) => {
        if (key === 'SUPABASE_URL') return 'https://x.supabase.co';
        if (key === 'WEB_ORIGIN') return 'https://app.test';
        return 'service-role-key';
      },
    } as unknown as ConfigService;
    service = new SupabaseAdminService(config);
    admin = { inviteUserByEmail: jest.fn(), deleteUser: jest.fn(), listUsers: jest.fn() };
    // Reset storage mocks to their default happy-path values.
    jest.clearAllMocks();
    storage.getBucket.mockResolvedValue({ data: { name: 'b' }, error: null });
    storage.createBucket.mockResolvedValue({ data: { name: 'b' }, error: null });
    storage.from.mockReturnValue(storageBucketApi);
    storageBucketApi.upload.mockResolvedValue({ data: { path: 'x' }, error: null });
    storageBucketApi.getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn/x.png' } });
    storageBucketApi.remove.mockResolvedValue({ data: [], error: null });
    // Replace the real Supabase client with a fake admin + storage surface.
    (service as any).client = { auth: { admin }, storage };
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
        redirectTo: 'https://app.test/accept-invite',
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

    it('points the invite redirect at the web accept-invite route', async () => {
      admin.inviteUserByEmail.mockResolvedValue({
        data: { user: { id: 'sub-2' } },
        error: null,
      });

      await service.inviteUser('p@x.com', { name: 'Pat' });

      expect(admin.inviteUserByEmail).toHaveBeenCalledWith(
        'p@x.com',
        expect.objectContaining({ redirectTo: 'https://app.test/accept-invite' }),
      );
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

  describe('uploadPublicObject', () => {
    it('uploads to an existing bucket and returns the public URL', async () => {
      const url = await service.uploadPublicObject('nutritionist-logos', 'n1.png', Buffer.from('x'), 'image/png');
      expect(storage.getBucket).toHaveBeenCalledWith('nutritionist-logos');
      expect(storage.createBucket).not.toHaveBeenCalled();
      expect(storage.from).toHaveBeenCalledWith('nutritionist-logos');
      expect(storageBucketApi.upload).toHaveBeenCalledWith('n1.png', expect.any(Buffer), {
        contentType: 'image/png',
        upsert: true,
      });
      expect(url).toBe('https://cdn/x.png');
    });

    it('creates the bucket when missing', async () => {
      storage.getBucket.mockResolvedValue({ data: null, error: { message: 'not found' } });
      await service.uploadPublicObject('nutritionist-logos', 'n1.png', Buffer.from('x'), 'image/png');
      expect(storage.createBucket).toHaveBeenCalledWith('nutritionist-logos', { public: true });
    });

    it('throws BadGateway when the upload errors', async () => {
      storageBucketApi.upload.mockResolvedValue({ data: null, error: { message: 'boom' } });
      await expect(
        service.uploadPublicObject('nutritionist-logos', 'n1.png', Buffer.from('x'), 'image/png'),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });
  });

  describe('removeObject', () => {
    it('removes an object (best-effort, never throws)', async () => {
      storageBucketApi.remove.mockResolvedValue({ data: [], error: null });
      await expect(service.removeObject('nutritionist-logos', 'n1.png')).resolves.toBeUndefined();
      expect(storageBucketApi.remove).toHaveBeenCalledWith(['n1.png']);
    });
  });

  describe('listAllUsers', () => {
    const user = (i: number, over: object = {}) => ({
      id: `u${i}`, email: `u${i}@x.com`, email_confirmed_at: null, invited_at: null,
      created_at: '2026-09-01T10:00:00Z', user_metadata: {}, ...over,
    });

    it('maps users and walks every page', async () => {
      const full = Array.from({ length: 1000 }, (_, i) => user(i));
      admin.listUsers
        .mockResolvedValueOnce({ data: { users: full }, error: null })
        .mockResolvedValueOnce({
          data: { users: [user(1000, { user_metadata: { name: 'Bia', whatsapp: '+55 11 9' }, email_confirmed_at: 'c' })] },
          error: null,
        });
      const res = await service.listAllUsers();
      expect(res).toHaveLength(1001);
      expect(admin.listUsers).toHaveBeenNthCalledWith(2, { page: 2, perPage: 1000 });
      expect(res[1000]).toEqual({
        id: 'u1000', email: 'u1000@x.com', emailConfirmedAt: 'c', invitedAt: null,
        createdAt: '2026-09-01T10:00:00Z', name: 'Bia', phone: '+55 11 9',
      });
      expect(res[0].name).toBeNull();
    });

    it('turns an API error or a thrown error into a 502', async () => {
      admin.listUsers.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
      await expect(service.listAllUsers()).rejects.toBeInstanceOf(BadGatewayException);
      admin.listUsers.mockRejectedValueOnce(new Error('network'));
      await expect(service.listAllUsers()).rejects.toBeInstanceOf(BadGatewayException);
    });
  });
});
