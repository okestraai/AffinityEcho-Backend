import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { supabaseAdmin } from '../../../database/supabase.client';
import { EncryptionUtil } from '../../../common/utils/encryption.util';
import { EmailService } from '../../../common/utils/email/email.service';
import {
  isCompanyEligible,
  isEmailDomainValid,
} from '../../../common/constants/company-domains';

@Injectable()
export class CompanyVerificationService {
  private readonly logger = new Logger(CompanyVerificationService.name);
  private admin;

  constructor(
    private config: ConfigService,
    private encryption: EncryptionUtil,
    private emailService: EmailService,
  ) {
    this.admin = supabaseAdmin(config);
  }

  private decryptField(value: string | null | undefined): string | null {
    if (!value) return null;
    try {
      return this.encryption.decrypt(value);
    } catch {
      return null;
    }
  }

  async requestVerification(userId: string, email: string) {
    try {
      // Fetch user profile
      const { data: profile, error: profileError } = await this.admin
        .from('user_profiles')
        .select('id, company_encrypted, is_company_verified')
        .eq('id', userId)
        .single();

      if (profileError) {
        this.logger.error('Failed to fetch user profile', profileError);
        throw new InternalServerErrorException('Failed to fetch user profile');
      }

      if (profile.is_company_verified) {
        throw new BadRequestException('Company already verified');
      }

      // Decrypt company name
      const companyName = this.decryptField(profile.company_encrypted);
      if (!companyName) {
        throw new BadRequestException('No company found on your profile');
      }

      // Check company eligibility
      if (!isCompanyEligible(companyName)) {
        throw new BadRequestException(
          'Company verification not available for your company',
        );
      }

      // Validate email domain
      if (!isEmailDomainValid(email, companyName)) {
        throw new BadRequestException(
          'Email domain does not match your company',
        );
      }

      // Rate limit: count tokens created today for this user
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { count, error: countError } = await this.admin
        .from('company_verification_tokens')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', todayStart.toISOString());

      if (countError) {
        this.logger.error('Failed to check rate limit', countError);
        throw new InternalServerErrorException('Failed to check rate limit');
      }

      if ((count ?? 0) >= 3) {
        throw new BadRequestException(
          'Too many verification requests today. Please try again tomorrow.',
        );
      }

      // Delete existing unused tokens for this user
      const { error: deleteError } = await this.admin
        .from('company_verification_tokens')
        .delete()
        .eq('user_id', userId)
        .is('used_at', null);

      if (deleteError) {
        this.logger.error('Failed to delete existing tokens', deleteError);
      }

      // Generate token
      const token = crypto.randomUUID();

      // Encrypt the email
      const encryptedEmail = this.encryption.encrypt(email);

      // Set expiration to 24 hours from now
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      // Insert verification token
      const { error: insertError } = await this.admin
        .from('company_verification_tokens')
        .insert({
          user_id: userId,
          token,
          email: encryptedEmail,
          company_name: companyName,
          expires_at: expiresAt.toISOString(),
        });

      if (insertError) {
        this.logger.error('Failed to create verification token', insertError);
        throw new InternalServerErrorException(
          'Failed to create verification token',
        );
      }

      // Update user profile with verification email
      const { error: updateError } = await this.admin
        .from('user_profiles')
        .update({ company_verification_email: encryptedEmail })
        .eq('id', userId);

      if (updateError) {
        this.logger.error('Failed to update user profile', updateError);
        throw new InternalServerErrorException(
          'Failed to update user profile',
        );
      }

      // Send verification email
      const backendUrl = this.config.get<string>('BACKEND_URL');
      const verificationUrl = `${backendUrl}/api/v1/user/verify-company/${token}`;

      // Fetch username for email
      const { data: userData } = await this.admin
        .from('user_profiles')
        .select('username')
        .eq('id', userId)
        .single();

      await this.emailService.sendEmail(
        email,
        'Verify Your Company - Affinity Echo',
        'company-verification',
        {
          username: userData?.username || 'User',
          company: companyName,
          verificationUrl,
          expiresIn: '24 hours',
        },
      );

      return {
        success: true,
        message: 'Verification email sent to your company email',
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      this.logger.error('Unexpected error in requestVerification', error);
      throw new InternalServerErrorException(
        'Failed to request company verification',
      );
    }
  }

  async confirmVerification(token: string) {
    try {
      const frontendUrl = this.config.get<string>('FRONTEND_URL');

      // Find token
      const { data: tokenData, error: tokenError } = await this.admin
        .from('company_verification_tokens')
        .select('*')
        .eq('token', token)
        .is('used_at', null)
        .single();

      if (tokenError || !tokenData) {
        return {
          redirectUrl: `${frontendUrl}/settings/verification?status=error&reason=invalid_token`,
        };
      }

      // Check if expired
      if (new Date(tokenData.expires_at) < new Date()) {
        return {
          redirectUrl: `${frontendUrl}/settings/verification?status=error&reason=expired`,
        };
      }

      // Mark token as used
      const { error: updateTokenError } = await this.admin
        .from('company_verification_tokens')
        .update({ used_at: new Date().toISOString() })
        .eq('token', token);

      if (updateTokenError) {
        this.logger.error('Failed to mark token as used', updateTokenError);
        return {
          redirectUrl: `${frontendUrl}/settings/verification?status=error&reason=server_error`,
        };
      }

      // Update user profile
      const { error: updateProfileError } = await this.admin
        .from('user_profiles')
        .update({
          is_company_verified: true,
          company_verified_at: new Date().toISOString(),
        })
        .eq('id', tokenData.user_id);

      if (updateProfileError) {
        this.logger.error(
          'Failed to update user profile verification status',
          updateProfileError,
        );
        return {
          redirectUrl: `${frontendUrl}/settings/verification?status=error&reason=server_error`,
        };
      }

      return {
        redirectUrl: `${frontendUrl}/settings/verification?status=success`,
      };
    } catch (error) {
      this.logger.error('Unexpected error in confirmVerification', error);
      const frontendUrl = this.config.get<string>('FRONTEND_URL');
      return {
        redirectUrl: `${frontendUrl}/settings/verification?status=error&reason=server_error`,
      };
    }
  }

  async getVerificationStatus(userId: string) {
    try {
      // Fetch user profile
      const { data: profile, error: profileError } = await this.admin
        .from('user_profiles')
        .select(
          'is_company_verified, company_verification_email, company_verified_at, company_encrypted',
        )
        .eq('id', userId)
        .single();

      if (profileError) {
        this.logger.error('Failed to fetch user profile', profileError);
        throw new InternalServerErrorException('Failed to fetch user profile');
      }

      // Fetch latest token created_at
      const { data: latestToken } = await this.admin
        .from('company_verification_tokens')
        .select('created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // Decrypt fields
      const verificationEmail = this.decryptField(
        profile.company_verification_email,
      );
      const companyName = this.decryptField(profile.company_encrypted);
      const isEligible = companyName ? isCompanyEligible(companyName) : false;

      return {
        success: true,
        data: {
          is_verified: profile.is_company_verified ?? false,
          is_eligible: isEligible,
          company: companyName,
          verified_at: profile.company_verified_at ?? null,
          email_sent_at: latestToken?.created_at ?? null,
          verification_email: verificationEmail,
        },
      };
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      this.logger.error('Unexpected error in getVerificationStatus', error);
      throw new InternalServerErrorException(
        'Failed to get verification status',
      );
    }
  }
}
