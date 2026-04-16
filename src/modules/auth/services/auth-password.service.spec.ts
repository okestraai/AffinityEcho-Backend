import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  createMockQueryChain,
  createMockSupabaseClient,
  createMockConfigService,
} from '../../../__tests__/helpers/mock-supabase';

jest.mock('../../../database/supabase.client', () => ({
  supabaseAdmin: jest.fn(),
}));

jest.mock('../../../common/utils/logger.util', () => ({
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

import { supabaseAdmin } from '../../../database/supabase.client';
import * as bcrypt from 'bcrypt';

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

describe('AuthService – password', () => {
  let service: AuthService;
  let mockEmail: ReturnType<typeof createMockEmailService>;
  let mockAdminSupabase: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    const mockConfig = createMockConfigService();
    const mockJwt = createMockJwtService();
    const mockEncryption = createMockEncryptionUtil();
    mockEmail = createMockEmailService();
    const mockOnboarding = createMockOnboardingService();
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

  describe('forgotPassword', () => {
    const dto = { email: 'user@example.com' };

    it('should send reset OTP email when profile exists', async () => {
      const profileChain = createMockQueryChain({
        data: { id: 'user-123', username: 'testuser' },
        error: null,
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(profileChain);

      const result = await service.forgotPassword(dto);

      expect(result).toEqual(
        expect.objectContaining({
          message: expect.stringContaining('password reset code has been sent'),
          method: 'otp',
        }),
      );
      expect(mockEmail.sendPasswordResetOtpEmail).toHaveBeenCalledWith(
        'user@example.com',
        expect.any(String),
        'testuser',
      );
    });

    it('should return generic message when email does not exist', async () => {
      const notFoundChain = createMockQueryChain({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(notFoundChain);

      const result = await service.forgotPassword(dto);

      expect(result).toEqual(
        expect.objectContaining({
          message: expect.stringContaining(
            'If an account exists with this email',
          ),
        }),
      );
    });

    it('should throw BadRequestException for invalid email', async () => {
      await expect(
        service.forgotPassword({ email: 'not-valid' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('resetPasswordWithOtp', () => {
    const dto = {
      email: 'user@example.com',
      password: 'NewStrongPass1!',
      otp: '654321',
    };

    beforeEach(() => {
      (service as any).otpStore.set('user@example.com', {
        otp: '654321',
        expires: Date.now() + 15 * 60 * 1000,
        attempts: 1,
        lastSent: Date.now(),
        type: 'password_reset',
      });
    });

    it('should reset password successfully with valid OTP', async () => {
      // Profile lookup by email
      const profileChain = createMockQueryChain({
        data: { id: 'user-123', username: 'testuser' },
        error: null,
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(profileChain);

      // Password hash update
      const updateChain = createMockQueryChain({ data: null, error: null });
      mockAdminSupabase.client.from.mockReturnValueOnce(updateChain);

      const result = await service.resetPasswordWithOtp(dto);

      expect(result).toEqual(
        expect.objectContaining({
          message: expect.stringContaining(
            'Password has been reset successfully',
          ),
        }),
      );
      expect(bcrypt.hash).toHaveBeenCalledWith('NewStrongPass1!', 12);
    });

    it('should throw BadRequestException for wrong OTP', async () => {
      await expect(
        service.resetPasswordWithOtp({ ...dto, otp: '000000' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for weak new password', async () => {
      await expect(
        service.resetPasswordWithOtp({ ...dto, password: 'short' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when OTP is missing', async () => {
      await expect(
        service.resetPasswordWithOtp({ ...dto, otp: '' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should clear OTP from store after successful reset', async () => {
      // Profile lookup by email
      const profileChain = createMockQueryChain({
        data: { id: 'user-123', username: 'testuser' },
        error: null,
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(profileChain);

      // Password hash update
      const updateChain = createMockQueryChain({ data: null, error: null });
      mockAdminSupabase.client.from.mockReturnValueOnce(updateChain);

      await service.resetPasswordWithOtp(dto);
      expect((service as any).otpStore.has('user@example.com')).toBe(false);
    });
  });

  describe('logout', () => {
    it('should logout successfully', async () => {
      const result = await service.logout('user-123');

      expect(result).toEqual(
        expect.objectContaining({
          message: 'You have been logged out',
          timestamp: expect.any(String),
        }),
      );
    });

    it('should still return success even without userId', async () => {
      const result = await service.logout(undefined);
      expect(result.message).toBe('You have been logged out');
    });
  });

  describe('getCurrentUser', () => {
    it('should return the user profile when found', async () => {
      const mockProfile = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        first_name_encrypted: 'enc_John',
        last_name_encrypted: 'enc_Doe',
        avatar: 'https://example.com/avatar.jpg',
        bio: 'Hello world',
        job_title: 'Developer',
        location: 'NYC',
        years_experience: 5,
        skills: ['TypeScript', 'NestJS'],
        linkedin_url: 'https://linkedin.com/in/test',
        privacy_level: 'anonymous',
        is_willing_to_mentor: true,
        has_completed_onboarding: true,
        reputation_score: 100,
        total_posts: 10,
        total_comments: 20,
        helpful_votes_received: 5,
        mentorship_sessions_completed: 2,
        successful_referrals: 1,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-06-01T00:00:00Z',
        last_active_at: '2024-06-15T00:00:00Z',
        company_type: 'tech',
        race_encrypted: 'enc_race',
        gender_encrypted: 'enc_gender',
        career_level_encrypted: 'enc_mid',
        company_encrypted: 'enc_acme',
        affinity_tags_encrypted: 'enc_tags',
      };

      const profileChain = createMockQueryChain({
        data: mockProfile,
        error: null,
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(profileChain);

      const result = await service.getCurrentUser('user-123');

      expect(result).toEqual(
        expect.objectContaining({
          id: 'user-123',
          username: 'testuser',
          email: 'test@example.com',
          first_name: 'enc_John',
          last_name: 'enc_Doe',
        }),
      );
    });

    it('should map null optional fields properly', async () => {
      const minimalProfile = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        first_name_encrypted: null,
        last_name_encrypted: null,
        avatar: null,
        bio: null,
        job_title: null,
        location: null,
        years_experience: null,
        skills: null,
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
        updated_at: '2024-01-01T00:00:00Z',
        last_active_at: '2024-01-01T00:00:00Z',
        company_type: null,
        race_encrypted: null,
        gender_encrypted: null,
        career_level_encrypted: null,
        company_encrypted: null,
        affinity_tags_encrypted: null,
      };

      const profileChain = createMockQueryChain({
        data: minimalProfile,
        error: null,
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(profileChain);

      const result = await service.getCurrentUser('user-123');

      expect(result.first_name).toBeNull();
      expect(result.last_name).toBeNull();
      expect(result.skills).toEqual([]);
      expect(result.has_completed_onboarding).toBe(false);
    });
  });

  describe('socialLogin', () => {
    it('should return OAuth URL for google provider', async () => {
      const result = await service.socialLogin('google');

      expect(result).toEqual({
        url: expect.stringContaining('accounts.google.com'),
        provider: 'google',
      });
    });

    it('should throw BadRequestException for unsupported provider', async () => {
      await expect(service.socialLogin('twitter' as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
