import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
  Optional,
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
import { MSG } from '../../../common/constants/messages';
import { RedisService } from '../../../common/services/redis.service';
import { AttemptCounter } from '../../../common/utils/attempt-counter';

export type VerificationFailure =
  | 'invalid_token'
  | 'expired'
  | 'server_error'
  | 'no_code'
  | 'wrong_code'
  | 'too_many_tries'
  | 'cooling_down';

// Same rules as the login code: 3 tries, then a 5-minute wait; 30 seconds between sends.
export const CODE_RULES = {
  triesBeforeWait: 3,
  waitMs: 5 * 60 * 1000,
  // A daily cap on top, counted per person, so new codes can't be used to guess forever.
  maxTriesPerDay: 10,
  sendsBeforeWait: 3,
  secondsBetweenSends: 30,
};
export const MAX_CODE_TRIES = CODE_RULES.maxTriesPerDay;

export interface VerificationOutcome {
  success: boolean;
  reason?: VerificationFailure;
  message: string;
  redirectUrl: string;
}

const VERIFICATION_MESSAGES: Record<VerificationFailure | 'success', string> = {
  success: 'Your company has been verified! You now have a verified badge.',
  invalid_token: 'This verification link is invalid or has already been used.',
  expired: 'This code or link has expired. Send a new one from your profile.',
  server_error: 'Something went wrong. Please try again.',
  no_code: "There's no code waiting. Send a new code from your profile.",
  wrong_code: "That code isn't right. Check the email and try again.",
  too_many_tries: 'Too many wrong codes. Please try again in 24 hours.',
  cooling_down: 'Too many attempts. Try again in 5 minute(s).',
};

@Injectable()
export class CompanyVerificationService {
  private readonly logger = new Logger(CompanyVerificationService.name);
  private admin;
  private readonly counter: AttemptCounter;

  constructor(
    private config: ConfigService,
    private encryption: EncryptionUtil,
    private emailService: EmailService,
    @Optional() redis?: RedisService,
  ) {
    this.admin = supabaseAdmin(config);
    this.counter = new AttemptCounter(redis);
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
    await this.assertCanSendCode(userId);
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
        throw new BadRequestException(MSG.COMPANY.ALREADY_VERIFIED);
      }

      const companyName = this.decryptField(profile.company_encrypted);
      if (!companyName) {
        throw new BadRequestException(MSG.COMPANY.NO_COMPANY);
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
        this.codeFor(token),
      );
      await this.noteCodeSent(userId);

      return {
        success: true,
        message: MSG.COMPANY.VERIFICATION_SENT,
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
    await this.assertCanSendCode(userId);
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
        throw new BadRequestException(MSG.COMPANY.NO_COMPANY);
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
        this.codeFor(token),
      );
      await this.noteCodeSent(userId);

      return {
        success: true,
        message: MSG.COMPANY.VERIFICATION_UPDATED,
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
      this.codeFor(token),
    );
    await this.noteCodeSent(userId);

    return {
      success: true,
      message: MSG.COMPANY.VERIFICATION_RESENT,
    };
  }

  // The answer for the app and website, plus the page a browser lands on for an old email link.
  private outcome(
    reason?: VerificationFailure,
    message?: string,
  ): VerificationOutcome {
    const frontendUrl = this.config.get<string>('FRONTEND_URL');
    const query = reason ? `status=error&reason=${reason}` : 'status=success';
    return {
      success: !reason,
      reason,
      message: message ?? VERIFICATION_MESSAGES[reason ?? 'success'],
      redirectUrl: `${frontendUrl}/verify-company?${query}`,
    };
  }

  async confirmVerification(token: string): Promise<VerificationOutcome> {
    try {
      const { data: tokenData, error: tokenError } = await this.admin
        .from('company_verification_tokens')
        .select('*')
        .eq('token', token)
        .is('used_at', null)
        .single();

      if (tokenError || !tokenData) {
        // A second open of the same link (another device, a link scanner) is still a success.
        return (await this.wasVerifiedWith(token))
          ? this.outcome()
          : this.outcome('invalid_token');
      }

      if (new Date(tokenData.expires_at) < new Date()) {
        return this.outcome('expired');
      }

      return await this.completeVerification(token, tokenData.user_id);
    } catch (error) {
      this.logger.error('Unexpected error in confirmVerification', error);
      return this.outcome('server_error');
    }
  }

  // Shared by the emailed code and older emailed links.
  private async completeVerification(
    token: string,
    userId: string,
  ): Promise<VerificationOutcome> {
    // Claim the token; only one request can, so this step never runs twice.
    const { data: claimed, error: updateTokenError } = await this.admin
      .from('company_verification_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('token', token)
      .is('used_at', null)
      .select('id');

    if (updateTokenError) {
      this.logger.error('Failed to mark token as used', updateTokenError);
      return this.outcome('server_error');
    }
    if (!claimed?.length) {
      // Another request got there first.
      return (await this.wasVerifiedWith(token))
        ? this.outcome()
        : this.outcome('invalid_token');
    }

    // Fetch user's hash + encrypted email for permanent record
    const { data: profile } = await this.admin
      .from('user_profiles')
      .select('verification_email_hash, company_verification_email')
      .eq('id', userId)
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
          user_id: userId,
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
      .eq('id', userId);

    if (updateProfileError) {
      this.logger.error(
        'Failed to update user profile verification status',
        updateProfileError,
      );
      // Give the token back so the person can try the same link again.
      await this.admin
        .from('company_verification_tokens')
        .update({ used_at: null })
        .eq('token', token);
      return this.outcome('server_error');
    }

    return this.outcome();
  }

  // The 6-digit code emailed for a token. Derived from it, so nothing new is stored.
  codeFor(token: string): string {
    const hex = this.encryption.hmac(`company-verification:${token}`);
    return String(parseInt(hex.slice(0, 12), 16) % 1_000_000).padStart(6, '0');
  }

  async verifyCode(userId: string, code: string): Promise<VerificationOutcome> {
    try {
      const { data: tokenData } = await this.admin
        .from('company_verification_tokens')
        .select('*')
        .eq('user_id', userId)
        .is('used_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!tokenData) return this.outcome('no_code');
      if (new Date(tokenData.expires_at) < new Date()) {
        return this.outcome('expired');
      }
      if (
        (await this.counter.count(this.dayKey(userId))).n >=
        CODE_RULES.maxTriesPerDay
      ) {
        return this.outcome('too_many_tries');
      }
      // Each try is counted before the check, so parallel guesses can't get past the limit.
      const tryNumber = await this.counter.bump(
        this.burstKey(userId),
        CODE_RULES.waitMs,
      );
      if (tryNumber > CODE_RULES.triesBeforeWait) {
        return this.coolingDown(userId);
      }

      const expected = Buffer.from(this.codeFor(tokenData.token));
      const given = Buffer.from(String(code));
      const matches =
        given.length === expected.length &&
        crypto.timingSafeEqual(given, expected);
      if (!matches) {
        const today = await this.counter.bump(
          this.dayKey(userId),
          24 * 60 * 60 * 1000,
        );
        if (today >= CODE_RULES.maxTriesPerDay) {
          return this.outcome('too_many_tries');
        }
        return tryNumber >= CODE_RULES.triesBeforeWait
          ? this.coolingDown(userId)
          : this.outcome('wrong_code');
      }

      await this.counter.clear(this.burstKey(userId), this.dayKey(userId));
      return await this.completeVerification(tokenData.token, userId);
    } catch (error) {
      this.logger.error('Unexpected error in verifyCode', error);
      return this.outcome('server_error');
    }
  }

  private async coolingDown(userId: string): Promise<VerificationOutcome> {
    const { msLeft } = await this.counter.count(this.burstKey(userId));
    return this.outcome('cooling_down', this.waitMessage(msLeft));
  }

  // Called before sending a code: 30 seconds apart, and a 5-minute wait after 3 sends.
  async assertCanSendCode(userId: string): Promise<void> {
    const sends = await this.counter.count(this.sendsKey(userId));
    if (sends.n >= CODE_RULES.sendsBeforeWait) {
      throw new BadRequestException(this.waitMessage(sends.msLeft));
    }
    if ((await this.counter.count(this.gapKey(userId))).n > 0) {
      throw new BadRequestException(MSG.AUTH.WAIT_RATE_LIMIT);
    }
  }

  private async noteCodeSent(userId: string): Promise<void> {
    await this.counter.bump(this.sendsKey(userId), CODE_RULES.waitMs, true);
    await this.counter.bump(
      this.gapKey(userId),
      CODE_RULES.secondsBetweenSends * 1000,
    );
  }

  private waitMessage(msLeft: number): string {
    const minutes = Math.max(1, Math.ceil(msLeft / 60_000));
    return `Too many attempts. Try again in ${minutes} minute(s).`;
  }

  private dayKey(userId: string) {
    return `company-verification:tries:user:${userId}`;
  }
  private burstKey(userId: string) {
    return `company-verification:burst:user:${userId}`;
  }
  private sendsKey(userId: string) {
    return `company-verification:sends:user:${userId}`;
  }
  private gapKey(userId: string) {
    return `company-verification:gap:user:${userId}`;
  }

  private async wasVerifiedWith(token: string): Promise<boolean> {
    const { data: used } = await this.admin
      .from('company_verification_tokens')
      .select('user_id, used_at')
      .eq('token', token)
      .maybeSingle();
    if (!used?.used_at) return false;
    const { data: profile } = await this.admin
      .from('user_profiles')
      .select('is_company_verified')
      .eq('id', used.user_id)
      .maybeSingle();
    return profile?.is_company_verified === true;
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
