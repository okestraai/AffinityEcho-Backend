import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MentionService } from './mention.service';
import { EncryptionModule } from '../encryption/encryption.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    ConfigModule,
    EncryptionModule,
    forwardRef(() => NotificationsModule),
  ],
  providers: [MentionService],
  exports: [MentionService],
})
export class MentionsModule {}
