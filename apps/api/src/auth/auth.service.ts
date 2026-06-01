import { ConflictException, Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { AuthContext, LocalUser } from './types/auth-context';
import { SyncUserDto } from './dto/sync-user.dto';

@Injectable()
export class AuthService {
  constructor(private readonly users: UsersService) {}

  async syncUser(ctx: AuthContext, dto: SyncUserDto): Promise<LocalUser> {
    if (ctx.user) {
      return this.users.updateBasics(ctx.user.id, {
        email: ctx.email,
        name: ctx.name,
      });
    }
    return this.users.createWithProfile({
      authProviderId: ctx.authProviderId,
      email: ctx.email,
      name: ctx.name,
      role: dto.role,
      referralCode: dto.referralCode,
    });
  }

  me(ctx: AuthContext): LocalUser {
    if (!ctx.user) {
      // Authenticated, but no local record yet: the caller must sync first.
      // 409 (not 404) so clients don't misread it as a missing route.
      throw new ConflictException(
        'User not synced. Call POST /v1/auth/sync-user first.',
      );
    }
    return ctx.user;
  }
}
