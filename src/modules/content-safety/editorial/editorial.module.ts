import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EditorialService } from './editorial.service';
import { ContextBuilderService } from './context-builder.service';
import { EnforcementService } from './enforcement.service';
import { EditorialProcessor } from './editorial.processor';
import { EmailService } from '../../../common/utils/email/email.service';
import { NotificationsModule } from '../../notifications/notifications.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'moderation' }),
    NotificationsModule,
  ],
  providers: [
    EditorialService,
    ContextBuilderService,
    EnforcementService,
    EditorialProcessor,
    EmailService,
  ],
  exports: [
    EditorialService,
    ContextBuilderService,
    EnforcementService,
    BullModule,
  ],
})
export class EditorialModule {}
