import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { EncryptionModule } from '../encryption/encryption.module';

// Controllers
import { MessagingController } from './controllers/messaging.controller';
import { ConversationsController } from './controllers/conversations.controller';
import { IdentityRevealController } from './controllers/identity-reveal.controller';
import { MentorshipChatController } from './controllers/mentorship-chat.controller';

// Services
import { MessagingService } from './services/messaging.service';
import { ConversationsService } from './services/conversations.service';
import { IdentityRevealService } from './services/identity-reveal.service';
import { MentorshipChatService } from './services/mentorship-chat.service';
import { ChatGateway } from './services/websocket.gateway';

// Guards
import { ChatParticipantGuard } from './guards/chat-participant.guard';
import { MentorshipChatGuard } from './guards/mentorship-chat.guard';

// Common Utils
import { EmailService } from '../../common/utils/email/email.service';

@Module({
  imports: [ConfigModule, forwardRef(() => AuthModule), EncryptionModule],
  controllers: [
    MessagingController,
    ConversationsController,
    IdentityRevealController,
    MentorshipChatController,
  ],
  providers: [
    // Services
    MessagingService,
    ConversationsService,
    IdentityRevealService,
    MentorshipChatService,
    ChatGateway,

    // Guards
    ChatParticipantGuard,
    MentorshipChatGuard,

    // Utils
    EmailService,
  ],
  exports: [
    MessagingService,
    ConversationsService,
    IdentityRevealService,
    MentorshipChatService,
    ChatGateway,
    ChatParticipantGuard,
    MentorshipChatGuard,
  ],
})
export class MessagingModule {}
