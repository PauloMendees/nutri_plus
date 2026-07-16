import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { UploadedImage } from '../supabase/image-upload';
import { SilhuetaService } from './silhueta.service';
import { CreateSilhuetaScanDto } from './dto/create-silhueta-scan.dto';

@ApiTags('silhueta')
@ApiBearerAuth()
@Controller({ path: 'patients/:id/silhueta', version: '1' })
@Roles(UserRole.NUTRITIONIST)
export class SilhuetaController {
  constructor(private readonly silhueta: SilhuetaService) {}

  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'front', maxCount: 1 },
        { name: 'side', maxCount: 1 },
      ],
      { limits: { fileSize: 8 * 1024 * 1024 } },
    ),
  )
  create(
    @CurrentUser() ctx: AuthContext,
    @Param('id') id: string,
    @Body() dto: CreateSilhuetaScanDto,
    @UploadedFiles() files: { front?: UploadedImage[]; side?: UploadedImage[] },
  ) {
    const front = files.front?.[0];
    const side = files.side?.[0];
    if (!front || !side) {
      throw new BadRequestException('front and side images are required');
    }
    return this.silhueta.create(ctx, id, dto, front, side);
  }

  @Get()
  list(@CurrentUser() ctx: AuthContext, @Param('id') id: string) {
    return this.silhueta.list(ctx, id);
  }

  @Post(':scanId/apply')
  apply(
    @CurrentUser() ctx: AuthContext,
    @Param('id') id: string,
    @Param('scanId') scanId: string,
  ) {
    return this.silhueta.apply(ctx, id, scanId);
  }
}
