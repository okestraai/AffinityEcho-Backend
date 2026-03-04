import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { getBullConfig } from '../../config/bull.config';
import { OkestraController } from './okestra.controller';
import { OkestraService } from './services/okestra.service';
import { OkestraLlmService } from './services/okestra-llm.service';
import { ContentHashService } from './services/content-hash.service';
import { InsightsProcessor } from './processors/insights.processor';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({
      name: 'okestra-insights',
      ...getBullConfig(),
    }),
  ],
  controllers: [OkestraController],
  providers: [
    OkestraService,
    OkestraLlmService,
    ContentHashService,
    InsightsProcessor,
  ],
  exports: [OkestraService],
})
export class OkestraModule {}
