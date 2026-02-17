import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ForumController } from './controllers/forum.controller';
import { ForumService } from './services/forum.service';
import { TopicService } from './services/topic.service';
import { CommentService } from './services/comment.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { EncryptionModule } from '../encryption/encryption.module';

@Module({
  imports: [ConfigModule, NotificationsModule, EncryptionModule],
  controllers: [ForumController],
  providers: [ForumService, TopicService, CommentService],
  exports: [ForumService, TopicService, CommentService],
})
export class ForumModule {}
