import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../generated/prisma/client';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { AuthContext } from '../../auth/types/auth-context';
import { resolveScopeNutritionistId } from '../../auth/auth-scope';
import { MetaCtx, type MetaContext } from '../../meta/meta-context';
import { ImportService, type ImportFile } from './import.service';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiTags('patients-import')
@ApiBearerAuth()
@Controller({ path: 'patients/import', version: '1' })
@Roles(UserRole.NUTRITIONIST)
export class ImportController {
  constructor(private readonly imports: ImportService) {}

  @Get('template')
  async template(): Promise<StreamableFile> {
    const buffer = await this.imports.buildTemplate();
    return new StreamableFile(buffer, {
      type: XLSX_TYPE,
      disposition: 'attachment; filename="inutri-pacientes.xlsx"',
    });
  }

  @Post('preview')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES } }))
  preview(
    @CurrentUser() ctx: AuthContext,
    @UploadedFile() file: ImportFile | undefined,
  ) {
    return this.imports.preview(requireFile(file), resolveScopeNutritionistId(ctx));
  }

  @Post()
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES } }))
  commit(
    @CurrentUser() ctx: AuthContext,
    @UploadedFile() file: ImportFile | undefined,
    @Body('mapping') mapping: string,
    @MetaCtx() meta: MetaContext,
  ) {
    return this.imports.commit(requireFile(file), mapping, resolveScopeNutritionistId(ctx), meta);
  }
}

function requireFile(file: ImportFile | undefined): ImportFile {
  if (!file?.buffer?.length) {
    throw new BadRequestException('Arquivo obrigatório.');
  }
  return file;
}
