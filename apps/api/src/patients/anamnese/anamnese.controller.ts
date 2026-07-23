import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../generated/prisma/client';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { AuthContext } from '../../auth/types/auth-context';
import { AnamneseService } from './anamnese.service';
import { UpdateAnamneseDto } from './dto/update-anamnese.dto';

@ApiTags('anamnese')
@ApiBearerAuth()
@Controller({ path: 'patients/:id/anamnese', version: '1' })
@Roles(UserRole.NUTRITIONIST)
export class AnamneseController {
  constructor(private readonly service: AnamneseService) {}

  @Get()
  get(@CurrentUser() ctx: AuthContext, @Param('id') id: string) {
    return this.service.get(ctx, id);
  }

  @Put()
  upsert(@CurrentUser() ctx: AuthContext, @Param('id') id: string, @Body() dto: UpdateAnamneseDto) {
    return this.service.upsert(ctx, id, dto);
  }
}
