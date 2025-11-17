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

@Injectable()
export class OnboardingService {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  async saveOnboardingData(userId: string, data: OnboardingDataDto) {
    logger.info('Saving onboarding data', { userId, data });

    try {
      // Validate user exists
      const { data: user, error: userError } = await this.admin
        .from('user_profiles')
        .select('id')
        .eq('id', userId)
        .single();

      if (userError || !user) {
        logger.warn('User not found during onboarding', { userId });
        throw new NotFoundException('User not found');
      }

      // Prepare update data
      const updateData: any = {
        has_completed_onboarding: true,
        updated_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
      };

      // Add optional fields if provided
      if (data.race) updateData.race_encrypted = data.race; // In production, encrypt this
      if (data.gender) updateData.gender_encrypted = data.gender; // In production, encrypt this
      if (data.careerLevel) updateData.career_level = data.careerLevel;
      if (data.company) updateData.company = data.company;
      if (data.jobTitle) updateData.job_title = data.jobTitle;
      if (data.location) updateData.location = data.location;
      if (data.skills) updateData.skills = data.skills;
      if (data.affinityTags) updateData.affinity_tags = data.affinityTags;
      if (data.isWillingToMentor !== undefined) {
        updateData.is_willing_to_mentor = data.isWillingToMentor;
      }

      const { data: updatedUser, error } = await this.admin
        .from('user_profiles')
        .update(updateData)
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        logger.error('Failed to save onboarding data', {
          userId,
          error: error.message,
        });
        throw new BadRequestException(
          `Failed to save onboarding data: ${error.message}`,
        );
      }

      logger.info('Onboarding data saved successfully', { userId });
      return {
        message: 'Onboarding completed successfully',
        user: updatedUser,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      logger.error('Unexpected error during onboarding', {
        userId,
        error,
      });
      throw new InternalServerErrorException(
        'Onboarding service temporarily unavailable',
      );
    }
  }

  async getOnboardingStatus(userId: string) {
    logger.info('Fetching onboarding status', { userId });

    try {
      const { data: user, error } = await this.admin
        .from('user_profiles')
        .select('has_completed_onboarding, career_level, company, affinity_tags, is_willing_to_mentor')
        .eq('id', userId)
        .single();

      if (error) {
        logger.warn('User not found when fetching onboarding status', { userId });
        throw new NotFoundException('User not found');
      }

      return {
        hasCompletedOnboarding: user.has_completed_onboarding,
        currentData: {
          careerLevel: user.career_level,
          company: user.company,
          affinityTags: user.affinity_tags,
          isWillingToMentor: user.is_willing_to_mentor,
        },
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

  async updateOnboardingData(userId: string, data: Partial<OnboardingDataDto>) {
    logger.info('Updating onboarding data', { userId, data });

    try {
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      // Add optional fields if provided
      if (data.race !== undefined) updateData.race_encrypted = data.race;
      if (data.gender !== undefined) updateData.gender_encrypted = data.gender;
      if (data.careerLevel !== undefined) updateData.career_level = data.careerLevel;
      if (data.company !== undefined) updateData.company = data.company;
      if (data.jobTitle !== undefined) updateData.job_title = data.jobTitle;
      if (data.location !== undefined) updateData.location = data.location;
      if (data.skills !== undefined) updateData.skills = data.skills;
      if (data.affinityTags !== undefined) updateData.affinity_tags = data.affinityTags;
      if (data.isWillingToMentor !== undefined) {
        updateData.is_willing_to_mentor = data.isWillingToMentor;
      }

      const { data: updatedUser, error } = await this.admin
        .from('user_profiles')
        .update(updateData)
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        logger.error('Failed to update onboarding data', {
          userId,
          error: error.message,
        });
        throw new BadRequestException(
          `Failed to update onboarding data: ${error.message}`,
        );
      }

      logger.info('Onboarding data updated successfully', { userId });
      return {
        message: 'Onboarding data updated successfully',
        user: updatedUser,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      logger.error('Unexpected error updating onboarding data', {
        userId,
        error,
      });
      throw new InternalServerErrorException(
        'Onboarding update service temporarily unavailable',
      );
    }
  }
}