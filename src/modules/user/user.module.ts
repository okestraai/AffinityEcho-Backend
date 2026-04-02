// src/user/user.module.ts
import { Module } from '@nestjs/common';
import { UserController } from './controllers/user.controller';
import { UserService } from './services/user.service';
import { UserProfileService } from './services/user-profile.service';
import { UserSettingsService } from './services/user-settings.service';
import { UserAccountService } from './services/user-account.service';
import { UserBlockingService } from './services/user-blocking.service';
import { UserResourcesService } from './services/user-resources.service';
import { HarassmentReportService } from './services/harassment-report.service';
import { EncryptionModule } from '../encryption/encryption.module';
import { FeedsModule } from '../feeds/feeds.module';
import { CompanyVerificationController } from './controllers/company-verification.controller';
import { CompanyVerificationService } from './services/company-verification.service';
import { EmailService } from '../../common/utils/email/email.service';
import { EncryptionUtil } from '../../common/utils/encryption.util';

@Module({
  imports: [EncryptionModule, FeedsModule],
  controllers: [CompanyVerificationController, UserController],
  providers: [
    UserService,
    UserProfileService,
    UserSettingsService,
    UserAccountService,
    UserBlockingService,
    UserResourcesService,
    HarassmentReportService,
    CompanyVerificationService,
    EmailService,
    EncryptionUtil,
  ],
  exports: [UserService, UserProfileService],
})
export class UserModule {}
