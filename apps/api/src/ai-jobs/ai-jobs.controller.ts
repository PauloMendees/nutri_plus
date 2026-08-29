import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthContext } from '../auth/types/auth-context';
import { AiJobsService } from './ai-jobs.service';
import { ListAiJobsDto } from './dto/list-ai-jobs.dto';

@ApiTags('ai')
@ApiBearerAuth()
@Controller({ path: 'ai/jobs', version: '1' })
@Roles(UserRole.NUTRITIONIST)
export class AiJobsController {
  constructor(private readonly jobs: AiJobsService) {}

  @Get()
  list(@CurrentUser() ctx: AuthContext, @Query() query: ListAiJobsDto) {
    return this.jobs.list(ctx, query.patientId);
  }

  @Get(':id')
  get(@CurrentUser() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.get(ctx, id);
  }

  @Post(':id/retry')
  @HttpCode(202)
  retry(@CurrentUser() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.retry(ctx, id);
  }

  @Post(':id/consume')
  @HttpCode(204)
  consume(@CurrentUser() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.markConsumed(ctx, id);
  }
}
