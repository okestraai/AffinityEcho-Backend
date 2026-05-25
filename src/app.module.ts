// src/app.module.ts
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { ForumModule } from './modules/forum/forum.module';

import { RateLimitMiddleware } from './common/middlewares/rate-limit.middleware';
import { CsrfMiddleware } from './common/middlewares/csrf.middleware';
import { EncryptionUtil } from './common/utils/encryption.util';
import configuration from './config/configuration';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { EncryptionModule } from './modules/encryption/encryption.module';
import { NooksModule } from './modules/nooks/nooks.module';
import { MentorshipModule } from './modules/mentorship/mentorship.module';
import { ReferralModule } from './modules/referral/referral.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { FeedsModule } from './modules/feeds/feeds.module';
import { AdminModule } from './modules/admin/admin.module';
import { RedisModule } from './common/services/redis.module';
import { BullModule } from '@nestjs/bullmq';
import { getBullConfig } from './config/bull.config';
import { ScheduleModule } from '@nestjs/schedule';
import { NookCronJobs } from './jobs/nook-cron.jobs';
import { DigestCronJobs } from './jobs/digest-cron.jobs';
import { HealthCronJobs } from './jobs/health-cron.jobs';
import { ModerationSweepJobs } from './jobs/moderation-sweep.jobs';
import { DeleteSweepJobs } from './jobs/delete-sweep.jobs';
import { AdminHealthService } from './modules/admin/services/admin-health.service';
import { EmailService } from './common/utils/email/email.service';
import { OkestraModule } from './modules/okestra/okestra.module';
import { ContentSafetyModule } from './modules/content-safety/content-safety.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [configuration],
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000, // Time to live in milliseconds (1 minute)
        limit: 300, // 300 requests per minute
      },
      {
        name: 'messaging',
        ttl: 10000, // 10 seconds
        limit: 50, // 50 requests per 10 seconds for messaging endpoints
      },
    ]),
    BullModule.forRoot(getBullConfig()),
    ScheduleModule.forRoot(),
    RedisModule,
    AuthModule,
    UserModule,
    ForumModule,
    NooksModule,
    MentorshipModule,
    ReferralModule,

    EncryptionModule,
    MessagingModule,
    NotificationsModule,
    FeedsModule,
    AdminModule,
    OkestraModule,
    ContentSafetyModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    EncryptionUtil,
    NookCronJobs,
    DigestCronJobs,
    HealthCronJobs,
    ModerationSweepJobs,
    DeleteSweepJobs,
    AdminHealthService,
    EmailService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RateLimitMiddleware).forRoutes('*');
    consumer.apply(CsrfMiddleware).forRoutes('*');
  }
}
