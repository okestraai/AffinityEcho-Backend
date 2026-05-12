import { Module } from '@nestjs/common';
import { ContentSafetyController } from './content-safety.controller';
import { ContentSafetyService } from './content-safety.service';
import { EditorialModule } from './editorial/editorial.module';

@Module({
  imports: [EditorialModule],
  controllers: [ContentSafetyController],
  providers: [ContentSafetyService],
  exports: [ContentSafetyService, EditorialModule],
})
export class ContentSafetyModule {}
