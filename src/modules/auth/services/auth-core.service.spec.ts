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
  supabaseClient: jest.fn(),
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

import {
  supabaseClient,
  supabaseAdmin,
} from '../../../database/supabase.client';

// ── Helper factories ─────────────────────────────────────────────────

function createMockJwtService() {
  return {
    sign: jest.fn().mockReturnValue('mock-jwt-token'),
    verify: jest.fn().mockReturnValue({ sub: 'user-123', email: 'test@example.com' }),
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
  let mockClientSupabase: ReturnType<typeof createMockSupabaseClient>;
  let mockAdminSupabase: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = createMockConfigService();
    mockJwt = createMockJwtService();
    mockEncryption = createMockEncryptionUtil();
    mockEmail = createMockEmailService();
    mockOnboarding = createMockOnboardingService();

    mockClientSupabase = createMockSupabaseClient();
    mockAdminSupabase = createMockSupabaseClient();

    (supabaseClient as jest.Mock).mockReturnValue(mockClientSupabase.client);
    (supabaseAdmin as jest.Mock).mockReturnValue(mockAdminSupabase.client);

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
      const usernameCheckChain = createMockQueryChain({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(usernameCheckChain);

      mockClientSupabase.client.auth.signUp.mockResolvedValue({
        data: {
          user: { id: 'user-123', email: 'new@example.com' },
          session: null,
        },
        error: null,
      });

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
      expect(mockClientSupabase.client.auth.signUp).toHaveBeenCalledWith({
        email: 'new@example.com',
        password: 'StrongPass1!',
        options: { data: { username: 'newuser' } },
      });
      expect(mockEmail.sendOtpEmail).toHaveBeenCalled();
    });

    it('should throw ConflictException when username is already taken', async () => {
      const usernameCheckChain = createMockQueryChain({
        data: { id: 'existing-user' },
        error: null,
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(usernameCheckChain);

      await expect(service.signup(validDto)).rejects.toThrow(
        ConflictException,
      );
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
      const usernameCheckChain = createMockQueryChain({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(usernameCheckChain);

      mockClientSupabase.client.auth.signUp.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'User already registered', code: 'user_exists' },
      });

      await expect(service.signup(validDto)).rejects.toThrow(ConflictException);
      await expect(service.signup(validDto)).rejects.toThrow(
        'An account with this email already exists',
      );
    });

    it('should throw InternalServerErrorException on fetch failure', async () => {
      const usernameCheckChain = createMockQueryChain({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(usernameCheckChain);

      mockClientSupabase.client.auth.signUp.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'fetch failed', code: 'network_error' },
      });

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
      mockClientSupabase.client.auth.signInWithPassword.mockResolvedValue({
        data: {
          user: { id: 'user-123', email: 'user@example.com' },
          session: { access_token: 'supabase-token' },
        },
        error: null,
      });

      const profileChain = createMockQueryChain({
        data: {
          id: 'user-123',
          has_completed_onboarding: true,
          is_deactivated: false,
        },
        error: null,
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(profileChain);

      const result = await service.login(validDto);

      expect(result).toEqual(
        expect.objectContaining({
          access_token: 'mock-jwt-token',
          refresh_token: 'mock-jwt-token',
          token_type: 'Bearer',
          expires_in: 86400,
          has_completed_onboarding: true,
          is_deactivated: false,
          user: {
            id: 'user-123',
            email: 'user@example.com',
          },
        }),
      );
      expect(
        mockClientSupabase.client.auth.signInWithPassword,
      ).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'password123',
      });
    });

    it('should throw UnauthorizedException for invalid credentials', async () => {
      mockClientSupabase.client.auth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials', code: 'invalid_grant' },
      });

      await expect(service.login(validDto)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.login(validDto)).rejects.toThrow(
        'Invalid email or password',
      );
    });

    it('should throw BadRequestException for invalid email format', async () => {
      const dto = { email: 'bad-email', password: 'password123' };
      await expect(service.login(dto)).rejects.toThrow(BadRequestException);
      await expect(service.login(dto)).rejects.toThrow('Invalid email format');
    });

    it('should throw BadRequestException for short password', async () => {
      const dto = { email: 'user@example.com', password: 'short' };
      await expect(service.login(dto)).rejects.toThrow(BadRequestException);
      await expect(service.login(dto)).rejects.toThrow(
        'Invalid password format',
      );
    });

    it('should throw UnauthorizedException when email is not confirmed', async () => {
      mockClientSupabase.client.auth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Email not confirmed', code: 'email_not_confirmed' },
      });

      await expect(service.login(validDto)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.login(validDto)).rejects.toThrow(
        'Please confirm your email address',
      );
    });

    it('should throw UnauthorizedException when no session is returned', async () => {
      mockClientSupabase.client.auth.signInWithPassword.mockResolvedValue({
        data: {
          user: { id: 'user-123', email: 'user@example.com' },
          session: null,
        },
        error: null,
      });

      await expect(service.login(validDto)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.login(validDto)).rejects.toThrow(
        'Login failed - unable to create session',
      );
    });

    it('should throw InternalServerErrorException on fetch failure', async () => {
      mockClientSupabase.client.auth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'fetch failed', code: 'network_error' },
      });

      await expect(service.login(validDto)).rejects.toThrow(
        InternalServerErrorException,
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

      const profileChain = createMockQueryChain({
        data: { id: 'user-123', username: 'testuser' },
        error: null,
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(profileChain);

      mockAdminSupabase.client.auth.admin.updateUserById.mockResolvedValue({
        data: {},
        error: null,
      });

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
      expect(
        mockAdminSupabase.client.auth.admin.updateUserById,
      ).toHaveBeenCalledWith('user-123', { email_confirm: true });
      expect(mockEmail.sendWelcomeEmail).toHaveBeenCalledWith(
        email,
        'testuser',
      );
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

      const profileChain = createMockQueryChain({
        data: { id: 'user-123', username: 'testuser' },
        error: null,
      });
      mockAdminSupabase.client.from.mockReturnValueOnce(profileChain);

      mockAdminSupabase.client.auth.admin.updateUserById.mockResolvedValue({
        data: {},
        error: null,
      });

      await service.verifyOtp(email, token);

      expect((service as any).otpStore.has('user@example.com')).toBe(false);
    });
  });
});
