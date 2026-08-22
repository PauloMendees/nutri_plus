import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { OnboardingMeView } from '@nutri-plus/shared-types';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { DismissPromptDto } from './dto/dismiss-prompt.dto';
import { PatchTourDto } from './dto/patch-tour.dto';
import { OnboardingService } from './onboarding.service';

@ApiTags('onboarding')
@ApiBearerAuth()
@Controller({ path: 'me/onboarding', version: '1' })
@Roles(UserRole.NUTRITIONIST, UserRole.EMPLOYEE)
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get()
  getMine(@CurrentUser() ctx: AuthContext): Promise<OnboardingMeView> {
    return this.onboarding.getMine(ctx.user!.id);
  }

  @Patch()
  dismissPrompt(
    @CurrentUser() ctx: AuthContext,
    @Body() dto: DismissPromptDto,
  ): Promise<OnboardingMeView> {
    return this.onboarding.dismissPrompt(ctx.user!.id);
  }

  @Patch(':tourId')
  patchTour(
    @CurrentUser() ctx: AuthContext,
    @Param('tourId') tourId: string,
    @Body() dto: PatchTourDto,
  ): Promise<OnboardingMeView> {
    return this.onboarding.patchTour(ctx.user!.id, tourId, dto);
  }
}
