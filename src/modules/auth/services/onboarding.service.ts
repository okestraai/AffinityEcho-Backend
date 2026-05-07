import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { supabaseAdmin } from '../../../database/supabase.client';
import { ConfigService } from '@nestjs/config';
import { OnboardingDataDto } from '../dto/onboarding.dto';
import logger from '../../../common/utils/logger.util';
import { EmailService } from '../../../common/utils/email/email.service';
import { EncryptionUtil } from '../../../common/utils/encryption.util';
import { MSG } from '../../../common/constants/messages';

@Injectable()
export class OnboardingService {
  private admin;

  constructor(
    private config: ConfigService,
    private emailService: EmailService,
    private encryption: EncryptionUtil,
  ) {
    this.admin = supabaseAdmin(config);
  }

  async saveOnboardingData(userId: string, data: OnboardingDataDto) {
    logger.info('Saving onboarding data', { userId });

    try {
      const encryptedData: any = {
        has_completed_onboarding: true,
        updated_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
      };

      // Encrypt first_name and last_name (required fields)
      encryptedData.first_name_encrypted = this.encryption.encrypt(
        String(data.firstName).trim(),
      );
      encryptedData.last_name_encrypted = this.encryption.encrypt(
        String(data.lastName).trim(),
      );

      // Only these fields are allowed in onboarding
      if (data.race !== undefined) {
        encryptedData.race_encrypted = this.encryption.encrypt(
          String(data.race).trim(),
        );
      }
      if (data.gender !== undefined) {
        encryptedData.gender_encrypted = this.encryption.encrypt(
          String(data.gender).trim(),
        );
      }
      if (data.careerLevel !== undefined) {
        encryptedData.career_level_encrypted = this.encryption.encrypt(
          String(data.careerLevel),
        );
      }
      if (data.company !== undefined) {
        encryptedData.company_encrypted = this.encryption.encrypt(
          String(data.company).trim(),
        );
      }
      if (data.companyType !== undefined) {
        encryptedData.company_type = data.companyType;
      }
      if (data.affinityTags && data.affinityTags.length > 0) {
        encryptedData.affinity_tags_encrypted = this.encryption.encrypt(
          JSON.stringify(data.affinityTags),
        );
      }
      if (data.ageConfirmed) {
        encryptedData.age_confirmed = true;
        encryptedData.age_confirmed_at = new Date().toISOString();
      }

      const { data: updatedUser, error } = await this.admin
        .from('user_profiles')
        .update(encryptedData)
        .eq('id', userId)
        .select('username, email')
        .single();

      if (error) {
        logger.error('Failed to update user profile', { userId, error });
        throw new BadRequestException(MSG.AUTH.ONBOARDING_FAILED);
      }

      // For welcome email: We cannot safely decrypt names here (security best practice)
      // Use username or fallback as display name
      const displayName = updatedUser.username || 'Friend';

      // SEND WELCOME EMAIL AFTER ONBOARDING
      try {
        await this.emailService.sendWelcomeEmail(
          updatedUser.email,
          displayName,
        );
        logger.info('Welcome email sent after onboarding', { userId });
      } catch (emailError) {
        logger.warn('Welcome email failed (onboarding still succeeded)', {
          userId,
          error:
            emailError instanceof Error
              ? emailError.message
              : String(emailError),
        });
      }

      return {
        message: MSG.AUTH.ONBOARDING_COMPLETE,
        has_completed_onboarding: true,
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      logger.error('Onboarding failed', { userId, error });
      throw new InternalServerErrorException(
        'Onboarding temporarily unavailable',
      );
    }
  }

  async getOnboardingStatus(userId: string) {
    logger.info('Fetching onboarding status', { userId });

    try {
      const { data: user, error } = await this.admin
        .from('user_profiles')
        .select('has_completed_onboarding')
        .eq('id', userId)
        .single();

      if (error) {
        logger.warn('User not found when fetching onboarding status', {
          userId,
        });
        throw new NotFoundException(MSG.AUTH.USER_NOT_FOUND);
      }

      return {
        hasCompletedOnboarding: user.has_completed_onboarding,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      logger.error('Unexpected error fetching onboarding status', {
        userId,
        error,
      });
      throw new InternalServerErrorException(
        'Unable to fetch onboarding status',
      );
    }
  }

  async getDecryptedNames(userId: string) {
    const { data } = await this.admin
      .from('user_profiles')
      .select('first_name_encrypted, last_name_encrypted')
      .eq('id', userId)
      .single();

    return {
      firstName: data?.first_name_encrypted
        ? this.encryption.decrypt(data.first_name_encrypted)
        : null,
      lastName: data?.last_name_encrypted
        ? this.encryption.decrypt(data.last_name_encrypted)
        : null,
    };
  }
}
