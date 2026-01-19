// src/encryption/encryption.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EncryptionController } from './controller/encryption.controller';
import { EncryptionUtil } from '../../common/utils/encryption.util';

@Module({
  imports: [
    ConfigModule,
    // Throttler configuration is now in AppModule
  ],
  controllers: [EncryptionController],
  providers: [EncryptionUtil],
  exports: [EncryptionUtil],
})
export class EncryptionModule {}
