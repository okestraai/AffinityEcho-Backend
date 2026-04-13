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

  /**
   * Check if a verification email is already in use (by another user or permanently used).
   * Returns an error message if blocked, null if clear.
   */
  private async checkEmailAvailability(
    emailHash: string,
    currentUserId: string,
  ): Promise<string | null> {
    // 1. Check permanently used emails (verified + persists after account deletion)
    const { data: usedEmail } = await this.admin
      .from('used_verification_emails')
      .select('id, revoked_at')
      .eq('email_hash', emailHash)
      .maybeSingle();

    if (usedEmail && !usedEmail.revoked_at) {
      return 'This email has already been used for verification';
    }

    // 2. Check pending verifications by OTHER users (same hash = same email)
    const { data: pendingUser } = await this.admin
      .from('user_profiles')
      .select('id')
      .eq('verification_email_hash', emailHash)
      .neq('id', currentUserId)
      .maybeSingle();

    if (pendingUser) {
      return 'This email is already pending verification for another account';
    }

    return null;
  }

  async requestVerification(userId: string, email: string) {
    try {
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

      const companyName = this.decryptField(profile.company_encrypted);
      if (!companyName) {
        throw new BadRequestException('No company found on your profile');
      }

      if (!isCompanyEligible(companyName)) {
        throw new BadRequestException(
          'Company verification not available for your company',
        );
      }

      if (!isEmailDomainValid(email, companyName)) {
        throw new BadRequestException(
          'Email domain does not match your company',
        );
      }

      // Dedup check
      const emailHash = this.encryption.hmac(email);
      const blocked = await this.checkEmailAvailability(emailHash, userId);
      if (blocked) {
        throw new BadRequestException(blocked);
      }

      // // Rate limit: max 3 requests per day
      // const todayStart = new Date();
      // todayStart.setHours(0, 0, 0, 0);

      // const { count, error: countError } = await this.admin
      //   .from('company_verification_tokens')
      //   .select('*', { count: 'exact', head: true })
      //   .eq('user_id', userId)
      //   .gte('created_at', todayStart.toISOString());

      // if (countError) {
      //   this.logger.error('Failed to check rate limit', countError);
      //   throw new InternalServerErrorException('Failed to check rate limit');
      // }

      // if ((count ?? 0) >= 3) {
      //   throw new BadRequestException(
      //     'Too many verification requests today. Please try again tomorrow.',
      //   );
      // }

      // Delete existing unused tokens for this user
      await this.admin
        .from('company_verification_tokens')
        .delete()
        .eq('user_id', userId)
        .is('used_at', null);

      const token = crypto.randomUUID();
      const encryptedEmail = this.encryption.encrypt(email);
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

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

      // Store hash (dedup) + encrypted email (audit) on user profile
      const { error: updateError } = await this.admin
        .from('user_profiles')
        .update({
          company_verification_email: encryptedEmail,
          verification_email_hash: emailHash,
        })
        .eq('id', userId);

      if (updateError) {
        this.logger.error('Failed to update user profile', updateError);
        throw new InternalServerErrorException('Failed to update user profile');
      }

      const { data: userData } = await this.admin
        .from('user_profiles')
        .select('username')
        .eq('id', userId)
        .single();

      await this.emailService.sendCompanyVerificationEmail(
        email,
        userData?.username || 'User',
        companyName,
        token,
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

  /**
   * Update the verification email for a PENDING (not yet verified) request.
   * Clears the old hash, validates the new email, and resends the verification email.
   */
  async updateVerificationEmail(userId: string, newEmail: string) {
    try {
      const { data: profile, error: profileError } = await this.admin
        .from('user_profiles')
        .select(
          'id, company_encrypted, is_company_verified, verification_email_hash',
        )
        .eq('id', userId)
        .single();

      if (profileError) {
        this.logger.error('Failed to fetch user profile', profileError);
        throw new InternalServerErrorException('Failed to fetch user profile');
      }

      if (profile.is_company_verified) {
        throw new BadRequestException(
          'Already verified — email cannot be changed',
        );
      }

      if (!profile.verification_email_hash) {
        throw new BadRequestException(
          'No pending verification found. Please start a new verification request.',
        );
      }

      const companyName = this.decryptField(profile.company_encrypted);
      if (!companyName) {
        throw new BadRequestException('No company found on your profile');
      }

      if (!isEmailDomainValid(newEmail, companyName)) {
        throw new BadRequestException(
          'Email domain does not match your company',
        );
      }

      const newEmailHash = this.encryption.hmac(newEmail);

      // If same email as before, just resend without dedup re-check
      if (newEmailHash === profile.verification_email_hash) {
        return this._resendVerification(userId, newEmail, companyName);
      }

      // New email — check availability (excluding current user's old hash)
      const blocked = await this.checkEmailAvailability(newEmailHash, userId);
      if (blocked) {
        throw new BadRequestException(blocked);
      }

      // Delete existing unused tokens
      await this.admin
        .from('company_verification_tokens')
        .delete()
        .eq('user_id', userId)
        .is('used_at', null);

      const token = crypto.randomUUID();
      const encryptedEmail = this.encryption.encrypt(newEmail);
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

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

      // Update profile with new hash + new encrypted email
      const { error: updateError } = await this.admin
        .from('user_profiles')
        .update({
          company_verification_email: encryptedEmail,
          verification_email_hash: newEmailHash,
        })
        .eq('id', userId);

      if (updateError) {
        this.logger.error('Failed to update verification email', updateError);
        throw new InternalServerErrorException(
          'Failed to update verification email',
        );
      }

      const { data: userData } = await this.admin
        .from('user_profiles')
        .select('username')
        .eq('id', userId)
        .single();

      await this.emailService.sendCompanyVerificationEmail(
        newEmail,
        userData?.username || 'User',
        companyName,
        token,
      );

      return {
        success: true,
        message: 'Verification email updated and resent to your new address',
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      this.logger.error('Unexpected error in updateVerificationEmail', error);
      throw new InternalServerErrorException(
        'Failed to update verification email',
      );
    }
  }

  /** Resend the verification email to the same address (new token, same email). */
  private async _resendVerification(
    userId: string,
    email: string,
    companyName: string,
  ) {
    await this.admin
      .from('company_verification_tokens')
      .delete()
      .eq('user_id', userId)
      .is('used_at', null);

    const token = crypto.randomUUID();
    const encryptedEmail = this.encryption.encrypt(email);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    await this.admin.from('company_verification_tokens').insert({
      user_id: userId,
      token,
      email: encryptedEmail,
      company_name: companyName,
      expires_at: expiresAt.toISOString(),
    });

    const { data: userData } = await this.admin
      .from('user_profiles')
      .select('username')
      .eq('id', userId)
      .single();

    await this.emailService.sendCompanyVerificationEmail(
      email,
      userData?.username || 'User',
      companyName,
      token,
    );

    return {
      success: true,
      message: 'Verification email resent to your address',
    };
  }

  async confirmVerification(token: string) {
    try {
      const frontendUrl = this.config.get<string>('FRONTEND_URL');

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

      // Fetch user's hash + encrypted email for permanent record
      const { data: profile } = await this.admin
        .from('user_profiles')
        .select('verification_email_hash, company_verification_email')
        .eq('id', tokenData.user_id)
        .single();

      // Write permanent dedup record — survives account deletion
      if (
        profile?.verification_email_hash &&
        profile?.company_verification_email
      ) {
        const { error: usedEmailError } = await this.admin
          .from('used_verification_emails')
          .insert({
            email_hash: profile.verification_email_hash,
            email_encrypted: profile.company_verification_email,
            user_id: tokenData.user_id,
            verified_at: new Date().toISOString(),
          });

        if (usedEmailError) {
          this.logger.error(
            'Failed to record used verification email',
            usedEmailError,
          );
          // Non-fatal: verification still succeeds
        }
      }

      // Mark user as verified
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

      const { data: latestToken } = await this.admin
        .from('company_verification_tokens')
        .select('created_at, expires_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const verificationEmail = this.decryptField(
        profile.company_verification_email,
      );
      const companyName = this.decryptField(profile.company_encrypted);
      const isEligible = companyName ? isCompanyEligible(companyName) : false;
      const isPending =
        !profile.is_company_verified &&
        !!verificationEmail &&
        !!latestToken &&
        new Date(latestToken.expires_at) > new Date();

      return {
        success: true,
        data: {
          is_verified: profile.is_company_verified ?? false,
          is_eligible: isEligible,
          is_pending: isPending,
          company: companyName,
          verified_at: profile.company_verified_at ?? null,
          email_sent_at: latestToken?.created_at ?? null,
          token_expires_at: latestToken?.expires_at ?? null,
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
