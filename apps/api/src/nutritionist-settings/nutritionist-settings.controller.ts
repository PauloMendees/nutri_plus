import {
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  MaxFileSizeValidator,
  ParseFilePipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import {
  NutritionistSettingsService,
  UploadedImage,
} from './nutritionist-settings.service';
import { UpdateNutritionistSettingsDto } from './dto/update-nutritionist-settings.dto';

@ApiTags('nutritionist-settings')
@ApiBearerAuth()
@Controller({ path: 'me/nutritionist-settings', version: '1' })
@Roles(UserRole.NUTRITIONIST)
export class NutritionistSettingsController {
  constructor(private readonly settings: NutritionistSettingsService) {}

  @Get()
  get(@CurrentUser() ctx: AuthContext) {
    return this.settings.getSettings(ctx);
  }

  @Patch()
  update(
    @CurrentUser() ctx: AuthContext,
    @Body() dto: UpdateNutritionistSettingsDto,
  ) {
    return this.settings.updateSettings(ctx, dto);
  }

  @Post('logo')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  uploadLogo(
    @CurrentUser() ctx: AuthContext,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 2 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /^image\/(png|jpe?g|webp)$/ }),
        ],
      }),
    )
    file: UploadedImage,
  ) {
    return this.settings.uploadLogo(ctx, file);
  }

  @Delete('logo')
  removeLogo(@CurrentUser() ctx: AuthContext) {
    return this.settings.removeLogo(ctx);
  }
}
