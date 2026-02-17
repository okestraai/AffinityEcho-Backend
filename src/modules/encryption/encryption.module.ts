// src/encryption/encryption.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EncryptionController } from './controller/encryption.controller';
import { EncryptionUtil } from '../../common/utils/encryption.util';
import { IdentityRevealUtil } from '../../common/utils/identity-reveal.util';

@Module({
  imports: [
    ConfigModule,
    // Throttler configuration is now in AppModule
  ],
  controllers: [EncryptionController],
  providers: [EncryptionUtil, IdentityRevealUtil],
  exports: [EncryptionUtil, IdentityRevealUtil],
})
export class EncryptionModule {}
