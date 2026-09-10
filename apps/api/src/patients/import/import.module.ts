import { Module } from '@nestjs/common';
import { AiModule } from '../../ai/ai.module';
import { MetaModule } from '../../meta/meta.module';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';

@Module({
  imports: [AiModule, MetaModule],
  controllers: [ImportController],
  providers: [ImportService],
})
export class ImportModule {}
