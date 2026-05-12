import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { FeedsController } from './controllers/feeds.controller';
import { FeedsService } from './services/feeds.service';
import { FeedPostsService } from './services/feed-posts.service';
import { FeedEngagementService } from './services/feed-engagement.service';
import { FeedRankingService } from './services/feed-ranking.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { EncryptionModule } from '../encryption/encryption.module';
import { MentionsModule } from '../mentions/mentions.module';
import { ContentSafetyModule } from '../content-safety/content-safety.module';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({ name: 'moderation' }),
    NotificationsModule,
    EncryptionModule,
    MentionsModule,
    ContentSafetyModule,
  ],
  controllers: [FeedsController],
  providers: [
    FeedsService,
    FeedPostsService,
    FeedEngagementService,
    FeedRankingService,
  ],
  exports: [
    FeedsService,
    FeedPostsService,
    FeedEngagementService,
    FeedRankingService,
  ],
})
export class FeedsModule {}
