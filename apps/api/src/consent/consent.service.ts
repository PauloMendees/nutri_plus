import { BadRequestException, Injectable } from '@nestjs/common';
import { CURRENT_PRIVACY_POLICY_VERSION, MyConsentStatus } from '@nutri-plus/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/types/auth-context';
import { resolveScopePatientId } from '../auth/auth-scope';
import { AcceptConsentDto } from './dto/accept-consent.dto';

@Injectable()
export class ConsentService {
  constructor(private readonly prisma: PrismaService) {}

  async getMine(ctx: AuthContext): Promise<MyConsentStatus> {
    const patientId = resolveScopePatientId(ctx);
    const latest = await this.prisma.patientConsent.findFirst({
      where: { patientId },
      orderBy: { acceptedAt: 'desc' },
    });
    const acceptedVersion = latest?.policyVersion ?? null;
    return {
      currentVersion: CURRENT_PRIVACY_POLICY_VERSION,
      acceptedVersion,
      acceptedAt: latest ? latest.acceptedAt.toISOString() : null,
      needsConsent: acceptedVersion == null || acceptedVersion !== CURRENT_PRIVACY_POLICY_VERSION,
    };
  }

  async accept(ctx: AuthContext, dto: AcceptConsentDto): Promise<MyConsentStatus> {
    const patientId = resolveScopePatientId(ctx);
    if (dto.policyVersion !== CURRENT_PRIVACY_POLICY_VERSION) {
      throw new BadRequestException('Versão da política desatualizada.');
    }
    await this.prisma.patientConsent.create({
      data: { patientId, policyVersion: CURRENT_PRIVACY_POLICY_VERSION },
    });
    return this.getMine(ctx);
  }
}
