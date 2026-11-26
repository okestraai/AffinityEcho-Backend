import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ForumController } from './controllers/forum.controller';
import { ForumService } from './services/forum.service';
import { TopicService } from './services/topic.service';
import { CommentService } from './services/comment.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { EncryptionModule } from '../encryption/encryption.module';
import { MentionsModule } from '../mentions/mentions.module';
import { OkestraModule } from '../okestra/okestra.module';
import { ContentSafetyModule } from '../content-safety/content-safety.module';
import { SpacesModule } from '../spaces/spaces.module';
import { RedisService } from '../../common/services/redis.service';
import { PermissionGuard } from '../../common/guards/permission.guard';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({ name: 'moderation' }),
    NotificationsModule,
    EncryptionModule,
    MentionsModule,
    OkestraModule,
    ContentSafetyModule,
    SpacesModule,
  ],
  controllers: [ForumController],
  providers: [
    ForumService,
    TopicService,
    CommentService,
    RedisService,
    PermissionGuard,
  ],
  exports: [ForumService, TopicService, CommentService],
})
export class ForumModule {}
