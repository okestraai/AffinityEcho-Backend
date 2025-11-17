// src/app.module.ts
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RateLimitMiddleware } from './common/middlewares/rate-limit.middleware';
import { EncryptionUtil } from './common/utils/encryption.util';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({ 
      isGlobal: true,
      envFilePath: '.env', 
      load: [configuration],
    }),
    AuthModule,
    UserModule,
    PrismaModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    EncryptionUtil, // Add EncryptionUtil to providers array
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RateLimitMiddleware).forRoutes('*');
  }
}