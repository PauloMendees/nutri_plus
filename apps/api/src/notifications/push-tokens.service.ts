import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/types/auth-context';
import { resolveScopePatientId } from '../auth/auth-scope';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';

@Injectable()
export class PushTokensService {
  constructor(private readonly prisma: PrismaService) {}

  async register(ctx: AuthContext, dto: RegisterPushTokenDto): Promise<void> {
    const patientId = resolveScopePatientId(ctx);
    await this.prisma.patientPushToken.upsert({
      where: { token: dto.token },
      create: { patientId, token: dto.token, platform: dto.platform },
      update: { patientId, platform: dto.platform },
    });
  }

  async unregister(ctx: AuthContext, token: string): Promise<void> {
    const patientId = resolveScopePatientId(ctx);
    await this.prisma.patientPushToken.deleteMany({ where: { token, patientId } });
  }
}
