import {
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  createMockQueryChain,
  createMockSupabaseClient,
  createMockConfigService,
} from '../../../__tests__/helpers/mock-supabase';

// ── Module-level mocks ───────────────────────────────────────────────
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

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('user-123'),
}));

import { supabaseAdmin } from '../../../database/supabase.client';
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

describe('AuthService – core (signup, login, verifyOtp)', () => {
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
  // signup
  // ================================================================
  describe('signup', () => {
    const validDto = {
      email: 'new@example.com',
      password: 'StrongPass1!',
      username: 'newuser',
    };

    it('should register a new user successfully', async () => {
      // Username check — not found
      const usernameCheckChain = createMockQueryChain({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(usernameCheckChain);

      // Email check — not found
      const emailCheckChain = createMockQueryChain({
        data: null,
        error: null,
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(emailCheckChain);

      // Profile insert
      const insertChain = createMockQueryChain({ data: null, error: null });
      mockAdminSupabase.client.from.mockReturnValueOnce(insertChain);

      const result = await service.signup(validDto);

      expect(result).toEqual(
        expect.objectContaining({
          message: expect.stringContaining('Registration successful'),
          userId: 'user-123',
          email: 'new@example.com',
          requiresOtpVerification: true,
        }),
      );
      expect(bcrypt.hash).toHaveBeenCalledWith('StrongPass1!', 12);
      expect(mockEmail.sendOtpEmail).toHaveBeenCalled();
    });

    it('should throw ConflictException when username is already taken', async () => {
      const usernameCheckChain = createMockQueryChain({
        data: { id: 'existing-user' },
        error: null,
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(usernameCheckChain);

      await expect(service.signup(validDto)).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException for invalid email format', async () => {
      const dto = { ...validDto, email: 'not-an-email' };
      await expect(service.signup(dto)).rejects.toThrow(BadRequestException);
      await expect(service.signup(dto)).rejects.toThrow('Invalid email format');
    });

    it('should throw BadRequestException for short password', async () => {
      const dto = { ...validDto, password: 'short' };
      const usernameCheckChain = createMockQueryChain({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(usernameCheckChain);

      await expect(service.signup(dto)).rejects.toThrow(BadRequestException);
      await expect(service.signup(dto)).rejects.toThrow(
        'Password must be at least 8 characters long',
      );
    });

    it('should throw BadRequestException for short username', async () => {
      const dto = { ...validDto, username: 'ab' };
      await expect(service.signup(dto)).rejects.toThrow(BadRequestException);
      await expect(service.signup(dto)).rejects.toThrow(
        'Username must be at least 3 characters long',
      );
    });

    it('should throw BadRequestException for username with invalid characters', async () => {
      const dto = { ...validDto, username: 'user name!' };
      await expect(service.signup(dto)).rejects.toThrow(BadRequestException);
      await expect(service.signup(dto)).rejects.toThrow(
        'Username can only contain letters, numbers, and underscores',
      );
    });

    it('should throw ConflictException when email is already registered', async () => {
      // Username check — not found
      const usernameCheckChain = createMockQueryChain({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(usernameCheckChain);

      // Email check — found (existing user)
      const emailCheckChain = createMockQueryChain({
        data: { id: 'existing-user' },
        error: null,
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(emailCheckChain);

      await expect(service.signup(validDto)).rejects.toThrow(
        'An account with this email already exists',
      );
    });

    it('should throw InternalServerErrorException on unexpected failure', async () => {
      // Username check — not found
      const usernameCheckChain = createMockQueryChain({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(usernameCheckChain);

      // Email check throws unexpected error
      const emailCheckChain = createMockQueryChain({
        data: null,
        error: null,
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(emailCheckChain);

      // bcrypt.hash throws
      (bcrypt.hash as jest.Mock).mockRejectedValueOnce(
        new Error('bcrypt failure'),
      );

      await expect(service.signup(validDto)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ================================================================
  // login
  // ================================================================
  describe('login', () => {
    const validDto = { email: 'user@example.com', password: 'password123' };

    it('should login successfully and return tokens', async () => {
      // Single combined query (auth + profile fields)
      const userChain = createMockQueryChain({
        data: {
          id: 'user-123',
          email: 'user@example.com',
          password_hash: 'hashed-password',
          auth_provider: 'email',
          username: 'testuser',
          role: 'user',
          has_completed_onboarding: true,
          is_deactivated: false,
          is_suspended: false,
          is_deleted: false,
        },
        error: null,
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(userChain);

      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login(validDto);

      expect(result).toEqual(
        expect.objectContaining({
          access_token: 'mock-jwt-token',
          refresh_token: 'mock-jwt-token',
          token_type: 'Bearer',
          expires_in: 86400,
          user: expect.objectContaining({
            id: 'user-123',
            email: 'user@example.com',
            has_completed_onboarding: true,
            is_deactivated: false,
          }),
        }),
      );
      expect(bcrypt.compare).toHaveBeenCalledWith(
        'password123',
        'hashed-password',
      );
    });

    it('should throw UnauthorizedException for invalid credentials (user not found)', async () => {
      // User lookup — not found
      const userChain = createMockQueryChain({
        data: null,
        error: null,
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(userChain);

      await expect(service.login(validDto)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.login(validDto)).rejects.toThrow(
        'Invalid email or password',
      );
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      // User lookup by email
      const userChain = createMockQueryChain({
        data: {
          id: 'user-123',
          email: 'user@example.com',
          password_hash: 'hashed-password',
          email_confirmed_at: '2024-01-01T00:00:00Z',
          auth_provider: 'email',
        },
        error: null,
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(userChain);

      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(validDto)).rejects.toThrow(
        'Invalid email or password',
      );
    });

    it('should throw BadRequestException for invalid email format', async () => {
      const dto = { email: 'bad-email', password: 'password123' };
      await expect(service.login(dto)).rejects.toThrow('Invalid email format');
    });

    it('should throw BadRequestException for short password', async () => {
      const dto = { email: 'user@example.com', password: 'short' };
      await expect(service.login(dto)).rejects.toThrow(
        'Invalid password format',
      );
    });

    it('should throw UnauthorizedException when user has no password_hash', async () => {
      const userChain = createMockQueryChain({
        data: {
          id: 'user-123',
          email: 'user@example.com',
          password_hash: null,
          email_confirmed_at: '2024-01-01T00:00:00Z',
          auth_provider: 'email',
        },
        error: null,
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(userChain);

      await expect(service.login(validDto)).rejects.toThrow(
        'Invalid email or password',
      );
    });

    it('should throw UnauthorizedException for Google-only account', async () => {
      const userChain = createMockQueryChain({
        data: {
          id: 'user-123',
          email: 'user@example.com',
          password_hash: null,
          email_confirmed_at: '2024-01-01T00:00:00Z',
          auth_provider: 'google',
        },
        error: null,
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(userChain);

      await expect(service.login(validDto)).rejects.toThrow(
        'This account uses Google sign-in',
      );
    });
  });

  // ================================================================
  // verifyOtp
  // ================================================================
  describe('verifyOtp', () => {
    const email = 'user@example.com';
    const token = '123456';

    it('should return tokens for a valid OTP', async () => {
      (service as any).otpStore.set('user@example.com', {
        otp: '123456',
        expires: Date.now() + 15 * 60 * 1000,
        attempts: 1,
        lastSent: Date.now(),
        type: 'signup',
      });

      // Profile lookup by email
      const profileChain = createMockQueryChain({
        data: { id: 'user-123', username: 'testuser' },
        error: null,
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(profileChain);

      // email_confirmed_at update
      const updateChain = createMockQueryChain({ data: null, error: null });
      mockAdminSupabase.client.from.mockReturnValueOnce(updateChain);

      const result = await service.verifyOtp(email, token);

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
      expect(mockEmail.sendWelcomeEmail).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException for invalid OTP', async () => {
      (service as any).otpStore.set('user@example.com', {
        otp: '999999',
        expires: Date.now() + 15 * 60 * 1000,
        attempts: 1,
        lastSent: Date.now(),
        type: 'signup',
      });

      await expect(service.verifyOtp(email, token)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.verifyOtp(email, '000000')).rejects.toThrow(
        'Invalid or expired code',
      );
    });

    it('should throw UnauthorizedException for expired OTP', async () => {
      (service as any).otpStore.set('user@example.com', {
        otp: '123456',
        expires: Date.now() - 1000,
        attempts: 1,
        lastSent: Date.now(),
        type: 'signup',
      });

      await expect(service.verifyOtp(email, token)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw BadRequestException for invalid email format', async () => {
      await expect(service.verifyOtp('bad-email', token)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.verifyOtp('bad-email', token)).rejects.toThrow(
        'Invalid email format',
      );
    });

    it('should throw BadRequestException for invalid OTP format', async () => {
      await expect(service.verifyOtp(email, 'abc')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.verifyOtp(email, 'abc')).rejects.toThrow(
        'Invalid OTP code',
      );
    });

    it('should throw BadRequestException for non-6-digit OTP', async () => {
      await expect(service.verifyOtp(email, '12345')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.verifyOtp(email, '1234567')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should remove OTP from store after successful verification', async () => {
      (service as any).otpStore.set('user@example.com', {
        otp: '123456',
        expires: Date.now() + 15 * 60 * 1000,
        attempts: 1,
        lastSent: Date.now(),
        type: 'signup',
      });

      // Profile lookup by email
      const profileChain = createMockQueryChain({
        data: { id: 'user-123', username: 'testuser' },
        error: null,
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(profileChain);

      // email_confirmed_at update
      const updateChain = createMockQueryChain({ data: null, error: null });
      mockAdminSupabase.client.from.mockReturnValueOnce(updateChain);

      await service.verifyOtp(email, token);

      expect((service as any).otpStore.has('user@example.com')).toBe(false);
    });
  });
});
