import { ConflictException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { AuthContext } from './types/auth-context';

describe('AuthService', () => {
  let users: jest.Mocked<Pick<UsersService, 'createWithProfile' | 'updateBasics'>>;
  let service: AuthService;

  beforeEach(() => {
    users = {
      createWithProfile: jest.fn(),
      updateBasics: jest.fn(),
    } as any;
    service = new AuthService(users as unknown as UsersService);
  });

  const newCtx: AuthContext = Object.freeze({
    authProviderId: 'sub-1',
    email: 'a@x.com',
    name: 'Ann',
    user: null,
  });

  it('creates a new user on first sync and returns it', async () => {
    users.createWithProfile.mockResolvedValue({ id: 'u1' } as any);

    const result = await service.syncUser(newCtx, {
      role: UserRole.PATIENT,
      referralCode: 'NUTRI-ABCDE',
    });

    expect(users.createWithProfile).toHaveBeenCalledWith({
      authProviderId: 'sub-1',
      email: 'a@x.com',
      name: 'Ann',
      role: UserRole.PATIENT,
      referralCode: 'NUTRI-ABCDE',
    });
    expect(result).toEqual({ id: 'u1' });
  });

  it('updates basics when the user already exists (idempotent) and returns it', async () => {
    const existingCtx: AuthContext = {
      ...newCtx,
      user: { id: 'u1', email: 'old@x.com', name: 'Old' } as any,
    };
    users.updateBasics.mockResolvedValue({ id: 'u1' } as any);

    const result = await service.syncUser(existingCtx, { role: UserRole.PATIENT });

    expect(users.updateBasics).toHaveBeenCalledWith('u1', {
      email: 'a@x.com',
      name: 'Ann',
    });
    expect(users.createWithProfile).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'u1' });
  });

  it('me() returns the resolved local user', () => {
    const ctx: AuthContext = { ...newCtx, user: { id: 'u1' } as any };
    expect(service.me(ctx)).toEqual({ id: 'u1' });
  });

  it('me() throws ConflictException when the user has not synced yet', () => {
    expect(() => service.me(newCtx)).toThrow(ConflictException);
  });
});
