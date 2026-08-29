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
import { RequiresFeature } from '../../billing/decorators';
import { AudiosService } from './audios.service';
import { CreateAudioDto } from './dto/create-audio.dto';

// Teto de upload da API de transcrição da OpenAI, e por isso o nosso também:
// aceitar mais só adia a falha para depois da gravação inteira ter sido enviada.
// Ver docs/… guides/speech-to-text — 25 MB vale para todos os modelos.
const MAX_AUDIO = 25 * 1024 * 1024;

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

  @Post(':audioId/transcribe')
  @RequiresFeature('transcription')
  transcribe(@CurrentUser() ctx: AuthContext, @Param('id') id: string, @Param('audioId') audioId: string) {
    return this.service.transcribe(ctx, id, audioId);
  }

  @Delete(':audioId')
  remove(@CurrentUser() ctx: AuthContext, @Param('id') id: string, @Param('audioId') audioId: string) {
    return this.service.delete(ctx, id, audioId);
  }
}
