import {
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
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

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('user-123'),
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
    sendSignInCodeEmail: jest.fn().mockResolvedValue(undefined),
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

describe('AuthService – email code sign-in', () => {
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

  const from = () => mockAdminSupabase.client.from as jest.Mock;
  const chain = (data: any) => createMockQueryChain({ data, error: null });
  // The last code emailed to an address.
  const sentCode = () =>
    (mockEmail as any).sendSignInCodeEmail.mock.calls.at(-1)[1] as string;

  describe('sendLoginCode', () => {
    it('gives the same reply for an unknown email and sends a code', async () => {
      from().mockReturnValueOnce(chain(null));
      const reply = await service.sendLoginCode({ email: 'New@Example.com' });
      expect(reply.message).toBe('If this email can sign in, a code is on its way.');
      expect((mockEmail as any).sendSignInCodeEmail).toHaveBeenCalledWith(
        'new@example.com',
        expect.stringMatching(/^\d{6}$/),
        'there',
      );
    });

    it('sends nothing to a suspended account, with the same reply', async () => {
      from().mockReturnValueOnce(chain({ username: 'x', is_suspended: true }));
      const reply = await service.sendLoginCode({ email: 'sus@example.com' });
      expect(reply.message).toBe('If this email can sign in, a code is on its way.');
      expect((mockEmail as any).sendSignInCodeEmail).not.toHaveBeenCalled();
    });

    it('sends nothing to an unknown email on the sign-in screen, with the same reply', async () => {
      from().mockReturnValueOnce(chain(null));
      const reply = await service.sendLoginCode({ email: 'new@example.com', existingOnly: true });
      expect(reply.message).toBe('If this email can sign in, a code is on its way.');
      expect((mockEmail as any).sendSignInCodeEmail).not.toHaveBeenCalled();
    });

    it('sends a code to a known email on the sign-in screen', async () => {
      from().mockReturnValueOnce(chain({ username: 'ada' }));
      await service.sendLoginCode({ email: 'ada@example.com', existingOnly: true });
      expect((mockEmail as any).sendSignInCodeEmail).toHaveBeenCalled();
    });

    it('answers a known email on the sign-in screen without waiting for the mail, even if it fails', async () => {
      from().mockReturnValueOnce(chain({ username: 'ada' }));
      (mockEmail as any).sendSignInCodeEmail.mockImplementationOnce(
        () => new Promise((_resolve, reject) => setTimeout(() => reject(new Error('smtp down')), 50)),
      );
      const reply = await service.sendLoginCode({ email: 'ada@example.com', existingOnly: true });
      expect(reply.message).toBe('If this email can sign in, a code is on its way.');
      await new Promise((r) => setTimeout(r, 80));
    });

    it('allows 3 sends every 5 minutes', async () => {
      from().mockReturnValue(chain(null));
      for (let i = 0; i < 3; i++) await service.sendLoginCode({ email: 'a@example.com' });
      await expect(service.sendLoginCode({ email: 'a@example.com' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('verifyLoginCode', () => {
    const user = {
      id: 'u1',
      email: 'ada@example.com',
      username: 'Quiet_Owl',
      role: 'user',
      has_completed_onboarding: false,
      password_hash: null,
      first_name_encrypted: null,
    };

    it('refuses a wrong code', async () => {
      from().mockReturnValue(chain(null));
      await service.sendLoginCode({ email: 'ada@example.com' });
      await expect(
        service.verifyLoginCode({ email: 'ada@example.com', code: '000000' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('allows 5 tries per code', async () => {
      from().mockReturnValue(chain(null));
      await service.sendLoginCode({ email: 'ada@example.com' });
      for (let i = 0; i < 5; i++) {
        await expect(
          service.verifyLoginCode({ email: 'ada@example.com', code: '000000' }),
        ).rejects.toThrow(UnauthorizedException);
      }
      await expect(
        service.verifyLoginCode({ email: 'ada@example.com', code: sentCode() }),
      ).rejects.toThrow('Too many attempts');
    });

    it('signs in an existing member without making a second account', async () => {
      from().mockReturnValueOnce(chain(null));
      await service.sendLoginCode({ email: 'ada@example.com' });
      const update = chain(null);
      from().mockReturnValueOnce(chain(user)).mockReturnValueOnce(update);
      const result = await service.verifyLoginCode({
        email: 'ada@example.com',
        code: sentCode(),
        firstName: 'Ada',
      });
      expect(result.created).toBe(false);
      expect(result.accessToken ?? (result as any).access_token).toBeDefined();
      expect(result.user.has_password).toBe(false);
      expect(update.update).toHaveBeenCalledWith(
        expect.objectContaining({ first_name_encrypted: 'enc_Ada' }),
      );
      // The code is used once.
      await expect(
        service.verifyLoginCode({ email: 'ada@example.com', code: sentCode() }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('needs the terms before making a new account', async () => {
      from().mockReturnValueOnce(chain(null));
      await service.sendLoginCode({ email: 'new@example.com' });
      from().mockReturnValueOnce(chain(null));
      await expect(
        service.verifyLoginCode({ email: 'new@example.com', code: sentCode() }),
      ).rejects.toThrow('Accept the terms');
    });

    it('never makes an account from the sign-in screen', async () => {
      from().mockReturnValueOnce(chain(null));
      await service.sendLoginCode({ email: 'new@example.com' });
      from().mockReturnValueOnce(chain(null));
      await expect(
        service.verifyLoginCode({
          email: 'new@example.com',
          code: sentCode(),
          termsAccepted: true,
          existingOnly: true,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('makes an account with no password for a new email', async () => {
      from().mockReturnValueOnce(chain(null));
      await service.sendLoginCode({ email: 'new@example.com' });
      const insert = chain(null);
      from()
        .mockReturnValueOnce(chain(null))
        .mockReturnValueOnce(insert)
        .mockReturnValueOnce(chain({ ...user, id: 'user-123', email: 'new@example.com' }))
        .mockReturnValue(chain(null));
      const result = await service.verifyLoginCode({
        email: 'new@example.com',
        code: sentCode(),
        termsAccepted: true,
      });
      expect(result.created).toBe(true);
      expect(insert.insert).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@example.com', password_hash: null, terms_accepted: true }),
      );
    });

    it('stops a password set by someone who never proved the email', async () => {
      from().mockReturnValueOnce(chain(null));
      await service.sendLoginCode({ email: 'ada@example.com' });
      const update = chain(null);
      from()
        .mockReturnValueOnce(chain({ ...user, password_hash: 'attacker-hash', email_confirmed_at: null }))
        .mockReturnValueOnce(update);
      const result = await service.verifyLoginCode({ email: 'ada@example.com', code: sentCode() });
      expect(update.update).toHaveBeenCalledWith(expect.objectContaining({ password_hash: null }));
      expect(result.user.has_password).toBe(false);
    });

    it("keeps a confirmed member's password", async () => {
      from().mockReturnValueOnce(chain(null));
      await service.sendLoginCode({ email: 'ada@example.com' });
      const update = chain(null);
      from()
        .mockReturnValueOnce(chain({ ...user, password_hash: 'own-hash', email_confirmed_at: '2026-01-01' }))
        .mockReturnValueOnce(update);
      const result = await service.verifyLoginCode({ email: 'ada@example.com', code: sentCode() });
      expect(update.update).toHaveBeenCalledWith(expect.not.objectContaining({ password_hash: null }));
      expect(result.user.has_password).toBe(true);
    });

    it("doesn't give fresh tries when a new code is sent", async () => {
      from().mockReturnValue(chain(null));
      await service.sendLoginCode({ email: 'bo@example.com' });
      for (let i = 0; i < 5; i++) {
        await expect(service.verifyLoginCode({ email: 'bo@example.com', code: '000000' })).rejects.toThrow(UnauthorizedException);
      }
      await service.sendLoginCode({ email: 'bo@example.com' });
      await expect(
        service.verifyLoginCode({ email: 'bo@example.com', code: sentCode() }),
      ).rejects.toThrow('Too many attempts');
    });

    it('caps tries per hour across codes', async () => {
      from().mockReturnValue(chain(null));
      for (let i = 0; i < 15; i++) {
        await service.verifyLoginCode({ email: 'cy@example.com', code: '000000' }).catch(() => undefined);
      }
      await expect(service.verifyLoginCode({ email: 'cy@example.com', code: '000000' })).rejects.toThrow('Try again later');
    });

    it('refuses a suspended account', async () => {
      from().mockReturnValueOnce(chain(null));
      await service.sendLoginCode({ email: 'ada@example.com' });
      from().mockReturnValueOnce(chain({ ...user, is_suspended: true }));
      await expect(
        service.verifyLoginCode({ email: 'ada@example.com', code: sentCode() }),
      ).rejects.toThrow('suspended');
    });
  });

  describe('setPassword', () => {
    it('sets a password only when there is none', async () => {
      from().mockReturnValueOnce(chain([{ id: 'u1' }]));
      await expect(service.setPassword('u1', 'StrongPass1!')).resolves.toBeDefined();
      from().mockReturnValueOnce(chain([]));
      await expect(service.setPassword('u1', 'StrongPass1!')).rejects.toThrow(ConflictException);
    });

    it('refuses a weak password', async () => {
      await expect(service.setPassword('u1', 'short')).rejects.toThrow(BadRequestException);
    });
  });
});
