import {
  Body, Controller, Delete, Get, MaxFileSizeValidator, Param,
  ParseFilePipe, Post, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../generated/prisma/client';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { AuthContext } from '../../auth/types/auth-context';
import { AudiosService } from './audios.service';
import { CreateAudioDto } from './dto/create-audio.dto';

const MAX_AUDIO = 50 * 1024 * 1024;

@ApiTags('consultation-audio')
@ApiBearerAuth()
@Controller({ path: 'patients/:id/audios', version: '1' })
@Roles(UserRole.NUTRITIONIST)
export class AudiosController {
  constructor(private readonly service: AudiosService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_AUDIO } }))
  create(
    @CurrentUser() ctx: AuthContext,
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: MAX_AUDIO })],
      }),
    )
    file: { buffer: Buffer; mimetype: string },
    @Body() dto: CreateAudioDto,
  ) {
    return this.service.create(ctx, id, file, dto);
  }

  @Get()
  list(@CurrentUser() ctx: AuthContext, @Param('id') id: string) {
    return this.service.list(ctx, id);
  }

  @Delete(':audioId')
  remove(@CurrentUser() ctx: AuthContext, @Param('id') id: string, @Param('audioId') audioId: string) {
    return this.service.delete(ctx, id, audioId);
  }
}
