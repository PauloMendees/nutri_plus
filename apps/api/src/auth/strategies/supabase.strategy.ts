import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { SUPABASE_PROVIDER } from '../auth.constants';
import { AuthContext } from '../types/auth-context';
import { SupabaseJwtPayload } from '../types/supabase-jwt-payload';

@Injectable()
export class SupabaseStrategy extends PassportStrategy(Strategy, 'supabase') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('SUPABASE_JWT_SECRET'),
      algorithms: ['HS256'],
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

    const user = await this.prisma.user.findUnique({
      where: {
        authProvider_authProviderId: {
          authProvider: SUPABASE_PROVIDER,
          authProviderId,
        },
      },
      include: { nutritionistProfile: true, patientProfile: true },
    });

    return { authProviderId, email, name, user };
  }
}
