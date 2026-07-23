import { Module } from '@nestjs/common';
import { AnamneseService } from './anamnese.service';
import { AnamneseController } from './anamnese.controller';

@Module({ controllers: [AnamneseController], providers: [AnamneseService] })
export class AnamneseModule {}
