import { Module } from '@nestjs/common';
import { NooksController } from './controllers/nooks.controller';
import { NookMessagesController } from './controllers/nook-messages.controller';
import { NookMembersController } from './controllers/nook-members.controller';
import { NookReactionsController } from './controllers/nook-reactions.controller';
import { NooksService } from './services/nooks.service';
import { NookMessagesService } from './services/nook-messages.service';
import { NookMembersService } from './services/nook-members.service';
import { NookReactionsService } from './services/nook-reactions.service';

import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { NookMemberGuard } from './guards/nook-member.guard';
import { NookCreatorGuard } from './guards/nook-creator.guard';
import { NookActiveGuard } from './guards/nook-active.guard';

@Module({
  imports: [JwtModule, ConfigModule],
  controllers: [
    NooksController,
    NookMessagesController,
    NookMembersController,
    NookReactionsController,
  ],
  providers: [
    NooksService,
    NookMessagesService,
    NookMembersService,
    NookReactionsService,
    NookMemberGuard,
    NookCreatorGuard,
    NookActiveGuard,
  ],
  exports: [NooksService],
})
export class NooksModule {}
