import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type {
  DismissFeedbackResponse,
  FeedbackPromptResponse,
  SubmitFeedbackResponse,
} from '@nutri-plus/shared-types';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { BillingExempt } from '../billing/decorators';
import { SubmitFeedbackDto } from './dto/submit-feedback.dto';
import { FeedbackService } from './feedback.service';

@ApiTags('feedback')
@ApiBearerAuth()
@Controller({ path: 'feedback', version: '1' })
@Roles(UserRole.NUTRITIONIST, UserRole.PATIENT, UserRole.EMPLOYEE)
@BillingExempt()
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Get('prompt')
  getPrompt(@CurrentUser() ctx: AuthContext): Promise<FeedbackPromptResponse> {
    return this.feedback.getPrompt(ctx);
  }

  @Post()
  @Roles(UserRole.NUTRITIONIST, UserRole.PATIENT)
  submit(
    @CurrentUser() ctx: AuthContext,
    @Body() dto: SubmitFeedbackDto,
  ): Promise<SubmitFeedbackResponse> {
    return this.feedback.submit(ctx, { rating: dto.rating as 1 | 2 | 3 | 4 | 5, comment: dto.comment });
  }

  @Post('dismiss')
  @Roles(UserRole.NUTRITIONIST, UserRole.PATIENT)
  dismiss(@CurrentUser() ctx: AuthContext): Promise<DismissFeedbackResponse> {
    return this.feedback.dismiss(ctx);
  }
}
