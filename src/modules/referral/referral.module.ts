import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ReferralController } from './controllers/referral.controller';
import { ReferralService } from './services/referral.service';
import { ReferralLikesService } from './services/referral-likes.service';
import { ReferralBookmarksService } from './services/referral-bookmarks.service';
import { ReferralCommentsService } from './services/referral-comments.service';
import { ReferralConnectionsService } from './services/referral-connections.service';
import { IdentityRevealService } from './services/identity-reveal.service';
import { EmailService } from '../../common/utils/email/email.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { EncryptionModule } from '../encryption/encryption.module';
import { ContentSafetyModule } from '../content-safety/content-safety.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'moderation' }),
    NotificationsModule,
    EncryptionModule,
    ContentSafetyModule,
  ],
  controllers: [ReferralController],
  providers: [
    ReferralService,
    ReferralLikesService,
    ReferralBookmarksService,
    ReferralCommentsService,
    ReferralConnectionsService,
    IdentityRevealService,
    EmailService,
  ],
  exports: [ReferralService],
})
export class ReferralModule {}
