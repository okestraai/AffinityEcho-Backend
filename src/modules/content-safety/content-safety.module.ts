import { Module } from '@nestjs/common';
import { ContentSafetyController } from './content-safety.controller';
import { ContentSafetyService } from './content-safety.service';

@Module({
  controllers: [ContentSafetyController],
  providers: [ContentSafetyService],
  exports: [ContentSafetyService],
})
export class ContentSafetyModule {}
