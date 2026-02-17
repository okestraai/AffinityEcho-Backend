import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MentorshipProfileController } from './controllers/mentorship-profile.controller';
import { MentorshipRequestsController } from './controllers/mentorship-requests.controller';
import { MentorshipRelationshipsController } from './controllers/mentorship-relationships.controller';
import { MentorshipSessionsController } from './controllers/mentorship-sessions.controller';
import { MentorshipDiscoverController } from './controllers/mentorship-discover.controller';
import { MentorshipBookmarksController } from './controllers/mentorship-bookmarks.controller';
import { MentorshipMiscController } from './controllers/mentorship-misc.controller';
import { FollowController } from './controllers/follow.controller';
import { UserFollowController } from './controllers/user-follow.controller';
import { MentorshipProfileService } from './services/mentorship-profile.service';
import { MentorshipDiscoverService } from './services/mentorship-discover.service';
import { MentorshipRequestsService } from './services/mentorship-requests.service';
import { MentorshipRelationshipsService } from './services/mentorship-relationships.service';
import { MentorshipSessionsService } from './services/mentorship-sessions.service';
import { MentorshipBookmarksService } from './services/mentorship-bookmarks.service';
import { FollowService } from './services/follow.service';
import { MentorshipOwnerGuard } from './guards/mentorship-owner.guard';
import { MentorRelationshipGuard } from './guards/mentor-relationship.guard';
import { MentorActiveGuard } from './guards/mentor-active.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { EncryptionModule } from '../encryption/encryption.module';

@Module({
  imports: [ConfigModule, NotificationsModule, EncryptionModule],
  controllers: [
    MentorshipProfileController,
    MentorshipRequestsController,
    MentorshipRelationshipsController,
    MentorshipSessionsController,
    MentorshipDiscoverController,
    MentorshipBookmarksController,
    MentorshipMiscController,
    FollowController,
    UserFollowController,
  ],
  providers: [
    MentorshipProfileService,
    MentorshipDiscoverService,
    MentorshipRequestsService,
    MentorshipRelationshipsService,
    MentorshipSessionsService,
    MentorshipBookmarksService,
    FollowService,
    MentorshipOwnerGuard,
    MentorRelationshipGuard,
    MentorActiveGuard,
  ],
  exports: [
    MentorshipProfileService,
    MentorshipDiscoverService,
    MentorshipRequestsService,
    FollowService,
    MentorshipOwnerGuard,
  ],
})
export class MentorshipModule {}
