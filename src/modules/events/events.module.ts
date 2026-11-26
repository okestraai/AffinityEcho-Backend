import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { EncryptionModule } from '../encryption/encryption.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailService } from '../../common/utils/email/email.service';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { EVENTS_QUEUE } from './events.constants';
import { EventsService } from './events.service';
import { EventsAdminService } from './events-admin.service';
import { EventNoticesProcessor, EventNoticesService } from './event-notices.service';
import { AdminEventsController, EventsController } from './events.controller';

@Module({
  imports: [
    ConfigModule,
    EncryptionModule,
    NotificationsModule,
    BullModule.registerQueue({ name: EVENTS_QUEUE }),
  ],
  controllers: [EventsController, AdminEventsController],
  providers: [
    EventsService,
    EventsAdminService,
    EventNoticesService,
    EventNoticesProcessor,
    EmailService,
    PermissionGuard,
  ],
})
export class EventsModule {}
