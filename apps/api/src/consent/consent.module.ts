import { Module } from '@nestjs/common';
import { ConsentService } from './consent.service';
import { MeConsentController } from './me-consent.controller';

@Module({ controllers: [MeConsentController], providers: [ConsentService] })
export class ConsentModule {}
