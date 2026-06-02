import {
  BadGatewayException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { AuthContext, LocalUser } from './types/auth-context';
import { SyncUserDto } from './dto/sync-user.dto';
import { LoginDto, LoginResponse } from './dto/login.dto';

interface SupabaseTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}

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
      throw new ConflictException(
        'User not synced. Call POST /v1/auth/sync-user first.',
      );
    }
    return ctx.user;
  }

  // Thin proxy to Supabase's password grant so the API can be exercised
  // manually before the frontend (which would use the Supabase SDK) exists.
  // The password is forwarded over TLS and never stored or logged.
  async login(dto: LoginDto): Promise<LoginResponse> {
    const baseUrl = this.config.getOrThrow<string>('SUPABASE_URL');
    const anonKey = this.config.getOrThrow<string>('SUPABASE_ANON_KEY');

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: anonKey },
        body: JSON.stringify({ email: dto.email, password: dto.password }),
      });
    } catch {
      throw new BadGatewayException('Auth provider unavailable');
    }

    if (!response.ok) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const data = (await response.json()) as SupabaseTokenResponse;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      tokenType: data.token_type,
      expiresIn: data.expires_in,
    };
  }
}
