import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SUPABASE_PROVIDER } from '../auth/auth.constants';
import { LocalUser } from '../auth/types/auth-context';
import { generateReferralCode } from '../common/referral-code';
import { UpdatePatientDto } from '../patients/dto/update-patient.dto';

interface CreateWithProfileInput {
  authProviderId: string;
  email: string;
  name: string;
  role: UserRole;
  referralCode?: string;
}

type UserBaseData = {
  authProvider: string;
  authProviderId: string;
  email: string;
  name: string;
  role: UserRole;
};

const INCLUDE_PROFILES = {
  nutritionistProfile: true,
  patientProfile: true,
} as const;

// Bounded retries to absorb the rare referralCode collision. The DB unique
// constraint is the source of truth; we regenerate and retry on its P2002.
const MAX_REFERRAL_ATTEMPTS = 5;

function isReferralCodeCollision(
  error: Prisma.PrismaClientKnownRequestError,
): boolean {
  const target = error.meta?.target;
  const text = Array.isArray(target) ? target.join(',') : String(target ?? '');
  return text.includes('referralCode');
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createWithProfile(input: CreateWithProfileInput): Promise<LocalUser> {
    const base: UserBaseData = {
      authProvider: SUPABASE_PROVIDER,
      authProviderId: input.authProviderId,
      email: input.email,
      name: input.name,
      role: input.role,
    };

    if (input.role === UserRole.NUTRITIONIST) {
      return this.createNutritionist(base);
    }

    let nutritionistId: string | undefined;
    if (input.referralCode) {
      const nutritionist = await this.prisma.nutritionistProfile.findUnique({
        where: { referralCode: input.referralCode },
      });
      if (!nutritionist) {
        throw new BadRequestException('Invalid referral code');
      }
      nutritionistId = nutritionist.id;
    }

    return this.prisma.user.create({
      data: {
        ...base,
        patientProfile: { create: { nutritionistId } },
      },
      include: INCLUDE_PROFILES,
    });
  }

  // Creates a patient that a nutritionist invited (the Supabase identity was
  // already created via the Admin API, so authProviderId is known up front).
  // Maps the unique-constraint violation (email/identity already used) to 409.
  async createInvitedPatient(input: {
    authProviderId: string;
    email: string;
    name: string;
    nutritionistId: string;
    clinical: UpdatePatientDto;
  }): Promise<LocalUser> {
    try {
      return await this.prisma.user.create({
        data: {
          authProvider: SUPABASE_PROVIDER,
          authProviderId: input.authProviderId,
          email: input.email,
          name: input.name,
          role: UserRole.PATIENT,
          patientProfile: {
            create: { nutritionistId: input.nutritionistId, ...input.clinical },
          },
        },
        include: INCLUDE_PROFILES,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A user with this email already exists');
      }
      throw error;
    }
  }

  private async createNutritionist(base: UserBaseData): Promise<LocalUser> {
    for (let attempt = 1; attempt <= MAX_REFERRAL_ATTEMPTS; attempt++) {
      try {
        return await this.prisma.user.create({
          data: {
            ...base,
            nutritionistProfile: {
              create: { referralCode: generateReferralCode() },
            },
          },
          include: INCLUDE_PROFILES,
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          isReferralCodeCollision(error) &&
          attempt < MAX_REFERRAL_ATTEMPTS
        ) {
          continue;
        }
        throw error;
      }
    }
    // Unreachable: the loop either returns or throws on the final attempt.
    throw new Error('Failed to generate a unique referral code');
  }

  async updateBasics(
    id: string,
    data: { email: string; name: string },
  ): Promise<LocalUser> {
    return this.prisma.user.update({
      where: { id },
      data,
      include: INCLUDE_PROFILES,
    });
  }

  async findByAuthProviderId(authProviderId: string): Promise<LocalUser | null> {
    return this.prisma.user.findUnique({
      where: {
        authProvider_authProviderId: {
          authProvider: SUPABASE_PROVIDER,
          authProviderId,
        },
      },
      include: INCLUDE_PROFILES,
    });
  }
}
