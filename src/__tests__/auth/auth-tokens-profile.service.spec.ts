import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { AuthService } from '../../modules/auth/services/auth.service';
import {
  createMockQueryChain,
  createMockSupabaseClient,
  createMockConfigService,
} from '../../__tests__/helpers/mock-supabase';

// ── Module-level mocks ───────────────────────────────────────────────
jest.mock('../../database/supabase.client', () => ({
  supabaseAdmin: jest.fn(),
}));

jest.mock('../../common/utils/logger.util', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn().mockResolvedValue(true),
}));

import { supabaseAdmin } from '../../database/supabase.client';
import * as bcrypt from 'bcrypt';

// ── Helper factories ─────────────────────────────────────────────────

function createMockJwtService() {
  return {
    sign: jest.fn().mockReturnValue('mock-jwt-token'),
    verify: jest
      .fn()
      .mockReturnValue({ sub: 'user-123', email: 'test@example.com' }),
  };
}

function createMockEncryptionUtil() {
  return {
    encrypt: jest.fn((val: string) => `enc_${val}`),
    decrypt: jest.fn((val: string) => val.replace('enc_', '')),
  };
}

function createMockEmailService() {
  return {
    sendOtpEmail: jest.fn().mockResolvedValue(undefined),
    sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetOtpEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetConfirmation: jest.fn().mockResolvedValue(undefined),
  };
}

function createMockOnboardingService() {
  return {
    saveOnboardingData: jest.fn().mockResolvedValue({
      message: 'Onboarding completed',
      has_completed_onboarding: true,
    }),
    getOnboardingStatus: jest.fn().mockResolvedValue({
      hasCompletedOnboarding: false,
    }),
  };
}

// ── Test Suite ────────────────────────────────────────────────────────

describe('AuthService – tokens & profile (refresh, sendOtp, resendOtp, updateProfile, changePassword, onboarding)', () => {
  let service: AuthService;
  let mockConfig: ReturnType<typeof createMockConfigService>;
  let mockJwt: ReturnType<typeof createMockJwtService>;
  let mockEncryption: ReturnType<typeof createMockEncryptionUtil>;
  let mockEmail: ReturnType<typeof createMockEmailService>;
  let mockOnboarding: ReturnType<typeof createMockOnboardingService>;
  let mockAdminSupabase: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = createMockConfigService();
    mockJwt = createMockJwtService();
    mockEncryption = createMockEncryptionUtil();
    mockEmail = createMockEmailService();
    mockOnboarding = createMockOnboardingService();

    mockAdminSupabase = createMockSupabaseClient();

    (supabaseAdmin as jest.Mock).mockReturnValue(mockAdminSupabase.client);

    // Reset bcrypt mocks to defaults
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    service = new AuthService(
      mockConfig as any,
      mockJwt as any,
      mockEncryption as any,
      mockEmail as any,
      mockOnboarding as any,
    );
  });

  // ================================================================
  // refresh
  // ================================================================
  describe('refresh', () => {
    const dto = { refreshToken: 'valid-refresh-token' };

    it('should return new tokens for a valid refresh token', async () => {
      mockJwt.verify.mockReturnValue({
        sub: 'user-123',
        email: 'user@example.com',
      });

      // User lookup by id from user_profiles
      const userChain = createMockQueryChain({
        data: { id: 'user-123', email: 'user@example.com' },
        error: null,
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(userChain);

      const result = await service.refresh(dto);

      expect(result).toEqual(
        expect.objectContaining({
          access_token: 'mock-jwt-token',
          refresh_token: 'mock-jwt-token',
          token_type: 'Bearer',
          expires_in: 86400,
          user: {
            id: 'user-123',
            email: 'user@example.com',
          },
        }),
      );
      expect(mockJwt.verify).toHaveBeenCalledWith('valid-refresh-token', {
        secret: 'test-jwt-refresh-secret',
      });
    });

    it('should throw UnauthorizedException for expired refresh token', async () => {
      mockJwt.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(service.refresh(dto)).rejects.toThrow(UnauthorizedException);
      await expect(service.refresh(dto)).rejects.toThrow(
        'Refresh token has expired',
      );
    });

    it('should throw UnauthorizedException for malformed refresh token', async () => {
      mockJwt.verify.mockImplementation(() => {
        throw new Error('jwt malformed');
      });

      await expect(service.refresh(dto)).rejects.toThrow(UnauthorizedException);
      await expect(service.refresh(dto)).rejects.toThrow(
        'Your session has expired, please sign in again',
      );
    });

    it('should throw UnauthorizedException when user no longer exists', async () => {
      mockJwt.verify.mockReturnValue({
        sub: 'user-123',
        email: 'user@example.com',
      });

      // User lookup — not found
      const userChain = createMockQueryChain({
        data: null,
        error: {
          message: "We couldn't find this account, please check and try again",
        },
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(userChain);

      await expect(service.refresh(dto)).rejects.toThrow(
        'This account no longer exists, please create a new one',
      );
    });

    it('should throw BadRequestException when refresh token is missing', async () => {
      const badDto = { refreshToken: '' };
      await expect(service.refresh(badDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.refresh(badDto)).rejects.toThrow(
        'Please provide a refresh token to continue',
      );
    });

    it('should throw UnauthorizedException for invalid signature', async () => {
      mockJwt.verify.mockImplementation(() => {
        throw new Error('invalid signature');
      });

      await expect(service.refresh(dto)).rejects.toThrow(UnauthorizedException);
      await expect(service.refresh(dto)).rejects.toThrow(
        'Your session has expired, please sign in again',
      );
    });
  });

  // ================================================================
  // sendOtp
  // ================================================================
  describe('sendOtp', () => {
    const dto = { email: 'user@example.com' };

    it('should send OTP successfully', async () => {
      // Username lookup for email personalization
      const profileChain = createMockQueryChain({
        data: { username: 'testuser' },
        error: null,
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(profileChain);

      const result = await service.sendOtp(dto);

      expect(result).toEqual(
        expect.objectContaining({
          message: expect.stringContaining('One-time password has been sent'),
        }),
      );
      expect(mockEmail.sendOtpEmail).toHaveBeenCalledWith(
        'user@example.com',
        expect.any(String),
        'testuser',
      );
    });

    it('should throw BadRequestException for invalid email format', async () => {
      const badDto = { email: 'not-valid' };
      await expect(service.sendOtp(badDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ================================================================
  // resendOtp
  // ================================================================
  describe('resendOtp', () => {
    const dto = { email: 'user@example.com' };

    it('should resend OTP successfully', async () => {
      // Profile lookup
      const profileChain = createMockQueryChain({
        data: { id: 'user-123', username: 'testuser' },
        error: null,
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(profileChain);

      // email_confirmed_at check
      const authChain = createMockQueryChain({
        data: { email_confirmed_at: null },
        error: null,
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(authChain);

      const result = await service.resendOtp(dto);

      expect(result).toEqual(
        expect.objectContaining({
          message: 'A new verification code has been sent to your email',
          attemptsRemaining: expect.any(Number),
        }),
      );
      expect(mockEmail.sendOtpEmail).toHaveBeenCalled();
    });

    it('should throw BadRequestException for invalid email', async () => {
      await expect(service.resendOtp({ email: 'bad' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when max attempts reached and cooldown not passed', async () => {
      (service as any).otpStore.set('user@example.com', {
        otp: '123456',
        expires: Date.now() + 15 * 60 * 1000,
        attempts: 3,
        lastSent: Date.now(),
        type: 'signup',
      });

      await expect(service.resendOtp(dto)).rejects.toThrow(BadRequestException);
      await expect(service.resendOtp(dto)).rejects.toThrow('Too many attempts');
    });

    it('should throw BadRequestException when resend within 30 seconds', async () => {
      (service as any).otpStore.set('user@example.com', {
        otp: '123456',
        expires: Date.now() + 15 * 60 * 1000,
        attempts: 1,
        lastSent: Date.now(),
        type: 'signup',
      });

      await expect(service.resendOtp(dto)).rejects.toThrow(BadRequestException);
      await expect(service.resendOtp(dto)).rejects.toThrow(
        'Please wait 30 seconds',
      );
    });

    it('should throw BadRequestException when email is already verified', async () => {
      // Profile lookup
      const profileChain = createMockQueryChain({
        data: { id: 'user-123', username: 'testuser' },
        error: null,
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(profileChain);

      // email_confirmed_at check — already confirmed
      const authChain = createMockQueryChain({
        data: { email_confirmed_at: '2024-01-01T00:00:00Z' },
        error: null,
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(authChain);

      await expect(service.resendOtp(dto)).rejects.toThrow(BadRequestException);
    });
  });

  // ================================================================
  // updateProfile
  // ================================================================
  describe('updateProfile', () => {
    it('should update profile successfully', async () => {
      const updateData = { bio: 'Updated bio', job_title: 'Senior Dev' };
      const updatedProfile = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        bio: 'Updated bio',
        job_title: 'Senior Dev',
        first_name_encrypted: null,
        last_name_encrypted: null,
        avatar: null,
        location: null,
        years_experience: null,
        skills: [],
        linkedin_url: null,
        privacy_level: 'anonymous',
        is_willing_to_mentor: false,
        has_completed_onboarding: false,
        reputation_score: 0,
        total_posts: 0,
        total_comments: 0,
        helpful_votes_received: 0,
        mentorship_sessions_completed: 0,
        successful_referrals: 0,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-06-01T00:00:00Z',
        last_active_at: '2024-06-01T00:00:00Z',
        company_type: null,
        race_encrypted: null,
        gender_encrypted: null,
        career_level_encrypted: null,
        company_encrypted: null,
        affinity_tags_encrypted: null,
      };

      const updateChain = createMockQueryChain({
        data: updatedProfile,
        error: null,
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(updateChain);

      const result = await service.updateProfile('user-123', updateData);

      expect(result.message).toBe('Your profile has been updated');
      expect(result.profile).toEqual(
        expect.objectContaining({
          id: 'user-123',
          bio: 'Updated bio',
          job_title: 'Senior Dev',
        }),
      );
    });

    it('should throw BadRequestException when no valid fields provided', async () => {
      await expect(service.updateProfile('user-123', {})).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.updateProfile('user-123', {})).rejects.toThrow(
        'No changes detected, please update at least one field',
      );
    });

    it('should throw when DB update fails', async () => {
      const updateData = { bio: 'Updated bio' };

      const updateChain = createMockQueryChain({
        data: null,
        error: { message: 'update failed', code: 'some_error' },
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(updateChain);

      await expect(
        service.updateProfile('user-123', updateData),
      ).rejects.toThrow();
    });

    it('should filter out undefined fields', async () => {
      const updateData = {
        bio: 'Updated bio',
        job_title: undefined,
        location: undefined,
      };

      const updatedProfile = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        bio: 'Updated bio',
        first_name_encrypted: null,
        last_name_encrypted: null,
        avatar: null,
        job_title: null,
        location: null,
        years_experience: null,
        skills: [],
        linkedin_url: null,
        privacy_level: 'anonymous',
        is_willing_to_mentor: false,
        has_completed_onboarding: false,
        reputation_score: 0,
        total_posts: 0,
        total_comments: 0,
        helpful_votes_received: 0,
        mentorship_sessions_completed: 0,
        successful_referrals: 0,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-06-01T00:00:00Z',
        last_active_at: '2024-06-01T00:00:00Z',
        company_type: null,
        race_encrypted: null,
        gender_encrypted: null,
        career_level_encrypted: null,
        company_encrypted: null,
        affinity_tags_encrypted: null,
      };

      const updateChain = createMockQueryChain({
        data: updatedProfile,
        error: null,
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(updateChain);

      const result = await service.updateProfile('user-123', updateData);
      expect(result.message).toBe('Your profile has been updated');
      expect(result.profile.bio).toBe('Updated bio');
    });
  });

  // ================================================================
  // changePassword
  // ================================================================
  describe('changePassword', () => {
    it('should change password successfully', async () => {
      // User lookup by id (get email + password_hash)
      const userChain = createMockQueryChain({
        data: {
          id: 'user-123',
          email: 'user@example.com',
          password_hash: 'old-hashed-password',
        },
        error: null,
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(userChain);

      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed-password');

      // Password hash update
      const updateChain = createMockQueryChain({ data: null, error: null });
      mockAdminSupabase.client.from.mockReturnValueOnce(updateChain);

      const result = await service.changePassword(
        'user-123',
        'OldPassword1!',
        'NewPassword1!',
      );

      expect(result).toEqual({
        message: 'Your password has been updated successfully',
      });
      expect(bcrypt.compare).toHaveBeenCalledWith(
        'OldPassword1!',
        'old-hashed-password',
      );
      expect(bcrypt.hash).toHaveBeenCalledWith('NewPassword1!', 12);
    });

    it('should throw BadRequestException for weak new password', async () => {
      await expect(
        service.changePassword('user-123', 'OldPass1!', 'short'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.changePassword('user-123', 'OldPass1!', 'short'),
      ).rejects.toThrow('Password must be at least 8 characters long');
    });

    it('should throw BadRequestException when current password is wrong', async () => {
      // User lookup by id
      const userChain = createMockQueryChain({
        data: {
          id: 'user-123',
          email: 'user@example.com',
          password_hash: 'old-hashed-password',
        },
        error: null,
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(userChain);

      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changePassword('user-123', 'WrongPass1!', 'NewPassword1!'),
      ).rejects.toThrow('The current password you entered is incorrect');
    });

    it('should throw BadRequestException when user is not found', async () => {
      // User lookup — not found
      const userChain = createMockQueryChain({
        data: null,
        error: { message: 'not found' },
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(userChain);

      await expect(
        service.changePassword('user-123', 'OldPass1!', 'NewPassword1!'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.changePassword('user-123', 'OldPass1!', 'NewPassword1!'),
      ).rejects.toThrow(
        "We couldn't find this account, please check and try again",
      );
    });

    it('should throw BadRequestException when password update fails in DB', async () => {
      // User lookup by id
      const userChain = createMockQueryChain({
        data: {
          id: 'user-123',
          email: 'user@example.com',
          password_hash: 'old-hashed-password',
        },
        error: null,
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(userChain);

      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed-password');

      // Password hash update fails
      const updateChain = createMockQueryChain({
        data: null,
        error: { message: 'update failed' },
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(updateChain);

      await expect(
        service.changePassword('user-123', 'OldPass1!', 'NewPassword1!'),
      ).rejects.toThrow('Password change failed');
    });
  });

  // ================================================================
  // completeOnboarding / getOnboardingStatus (delegation)
  // ================================================================
  describe('onboarding delegation', () => {
    it('should delegate completeOnboarding to OnboardingService', async () => {
      const data = { step: 'profile' } as any;
      const result = await service.completeOnboarding('user-123', data);

      expect(mockOnboarding.saveOnboardingData).toHaveBeenCalledWith(
        'user-123',
        data,
      );
      expect(result).toEqual({
        message: 'Onboarding completed',
        has_completed_onboarding: true,
      });
    });

    it('should delegate getOnboardingStatus to OnboardingService', async () => {
      const result = await service.getOnboardingStatus('user-123');

      expect(mockOnboarding.getOnboardingStatus).toHaveBeenCalledWith(
        'user-123',
      );
      expect(result).toEqual({ hasCompletedOnboarding: false });
    });
  });
});
