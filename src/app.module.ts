// src/app.module.ts
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { ForumModule } from './modules/forum/forum.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RateLimitMiddleware } from './common/middlewares/rate-limit.middleware';
import { EncryptionUtil } from './common/utils/encryption.util';
import configuration from './config/configuration';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { EncryptionModule } from './modules/encryption/encryption.module';
import { NooksModule } from './modules/nooks/nooks.module';
import { MentorshipModule } from './modules/mentorship/mentorship.module';
import { ReferralModule } from './modules/referral/referral.module';
import { MessagingModule } from './modules/messaging/messaging.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [configuration],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // Time to live in milliseconds (1 minute)
        limit: 10, // Maximum number of requests within TTL
      },
    ]),
    AuthModule,
    UserModule,
    ForumModule,
    NooksModule,
    MentorshipModule,
    ReferralModule,
    PrismaModule,
    EncryptionModule,
    MessagingModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    EncryptionUtil,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RateLimitMiddleware).forRoutes('*');
  }
}
