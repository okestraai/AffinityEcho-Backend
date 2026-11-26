import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EncryptionModule } from '../encryption/encryption.module';
import { ForumModule } from '../forum/forum.module';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';
import { AdminCompaniesController } from './admin-companies.controller';

@Module({
  imports: [ConfigModule, EncryptionModule, ForumModule],
  controllers: [CompaniesController, AdminCompaniesController],
  providers: [CompaniesService, PermissionGuard],
  exports: [CompaniesService],
})
export class CompaniesModule {}
