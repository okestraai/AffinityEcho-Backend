import { Module } from '@nestjs/common';
import { ReferralController } from './controllers/referral.controller';
import { ReferralService } from './services/referral.service';
import { ReferralLikesService } from './services/referral-likes.service';
import { ReferralBookmarksService } from './services/referral-bookmarks.service';
import { ReferralCommentsService } from './services/referral-comments.service';
import { ReferralConnectionsService } from './services/referral-connections.service';
import { IdentityRevealService } from './services/identity-reveal.service';
import { EncryptionUtil } from '../../common/utils/encryption.util';
import { EmailService } from '../../common/utils/email/email.service';

@Module({
  controllers: [ReferralController],
  providers: [
    ReferralService,
    ReferralLikesService,
    ReferralBookmarksService,
    ReferralCommentsService,
    ReferralConnectionsService,
    IdentityRevealService,
    EncryptionUtil,
    EmailService,
  ],
  exports: [ReferralService],
})
export class ReferralModule {}
