import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EncryptionModule } from '../encryption/encryption.module';
import { SpacesService } from './spaces.service';

@Module({
  imports: [ConfigModule, EncryptionModule],
  providers: [SpacesService],
  exports: [SpacesService],
})
export class SpacesModule {}
