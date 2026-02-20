import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MentionService } from './mention.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [ConfigModule, forwardRef(() => NotificationsModule)],
  providers: [MentionService],
  exports: [MentionService],
})
export class MentionsModule {}
