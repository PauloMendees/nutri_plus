import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { UsersService } from '../../users/users.service';
import { AuthContext } from '../types/auth-context';
import { SupabaseJwtPayload } from '../types/supabase-jwt-payload';

@Injectable()
export class SupabaseStrategy extends PassportStrategy(Strategy, 'supabase') {
  constructor(
    config: ConfigService,
    private readonly users: UsersService,
  ) {
    const supabaseUrl = config.getOrThrow<string>('SUPABASE_URL');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['ES256'],
      issuer: `${supabaseUrl}/auth/v1`,
      audience: 'authenticated',
      // Supabase signs access tokens with an asymmetric ES256 key; fetch the
      // public key by `kid` from the project's JWKS endpoint.
      secretOrKeyProvider: passportJwtSecret({
        jwksUri: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
        cache: true,
        rateLimit: true,
      }),
    });
  }

  async validate(payload: SupabaseJwtPayload): Promise<AuthContext> {
    const authProviderId = payload.sub;
    // email backs the local User's @unique, non-null column. A token without it
    // (some social-OAuth flows) cannot be synced — fail closed rather than
    // writing an empty string that would collide on the second such user.
    const email = payload.email;
    if (!email) {
      throw new UnauthorizedException('JWT is missing the email claim');
    }
    const name =
      payload.user_metadata?.name ?? payload.user_metadata?.full_name ?? email;

    const user = await this.users.findByAuthProviderId(authProviderId);

    return { authProviderId, email, name, user };
  }
}
