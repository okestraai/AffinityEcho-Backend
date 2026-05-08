jest.mock('../../database/supabase.client', () => ({
  supabaseAdmin: jest.fn(),
  supabaseClient: jest.fn(),
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

// Suppress NestJS Logger
jest.spyOn(console, 'log').mockImplementation();
jest.spyOn(console, 'error').mockImplementation();

import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { CompanyVerificationService } from '../../modules/user/services/company-verification.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';

describe('CompanyVerificationService', () => {
  let service: CompanyVerificationService;
  let mockClient: any;
  const mockEncryption = {
    decrypt: jest.fn((v: string) => 'dec_' + v),
    encrypt: jest.fn((v: string) => 'enc_' + v),
    hmac: jest.fn((v: string) => 'hmac_' + v),
  };
  const mockEmailService = {
    sendCompanyVerificationEmail: jest.fn().mockResolvedValue({}),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    service = new CompanyVerificationService(
      createMockConfigService() as any,
      mockEncryption as any,
      mockEmailService as any,
    );
  });

  describe('getVerificationStatus', () => {
    it('should return verification status for verified user', async () => {
      // 1) from('user_profiles').select(...).eq.single
      const profileChain = createMockQueryChain({
        data: {
          is_company_verified: true,
          company_verification_email: 'enc_email',
          company_verified_at: '2026-01-01',
          company_encrypted: 'enc_Google',
        },
        error: null,
      });
      // 2) from('company_verification_tokens').select(...).eq.order.limit.maybeSingle
      const tokenChain = createMockQueryChain({
        data: {
          created_at: '2026-01-01',
          expires_at: new Date(Date.now() + 86400000).toISOString(),
        },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(tokenChain);

      const result = await service.getVerificationStatus('u1');
      expect(result.success).toBe(true);
      expect(result.data.is_verified).toBe(true);
      expect(result.data.company).toBe('dec_enc_Google');
    });

    it('should return not verified status', async () => {
      const profileChain = createMockQueryChain({
        data: {
          is_company_verified: false,
          company_verification_email: null,
          company_verified_at: null,
          company_encrypted: 'enc_Startup',
        },
        error: null,
      });
      const tokenChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(tokenChain);

      const result = await service.getVerificationStatus('u1');
      expect(result.data.is_verified).toBe(false);
      expect(result.data.is_pending).toBe(false);
    });

    it('should throw on profile fetch error', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'fail' },
      });
      mockClient.from.mockReturnValue(chain);

      await expect(service.getVerificationStatus('u1')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('requestVerification', () => {
    it('should throw if already verified', async () => {
      const profileChain = createMockQueryChain({
        data: {
          id: 'u1',
          company_encrypted: 'enc_Google',
          is_company_verified: true,
        },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(profileChain);

      await expect(
        service.requestVerification('u1', 'user@google.com'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if no company on profile', async () => {
      const profileChain = createMockQueryChain({
        data: { id: 'u1', company_encrypted: null, is_company_verified: false },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(profileChain);

      // decrypt returns null for null input
      mockEncryption.decrypt.mockReturnValueOnce(null);

      await expect(
        service.requestVerification('u1', 'user@google.com'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('confirmVerification', () => {
    it('should return error redirect for invalid token', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { code: 'PGRST116' },
      });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.confirmVerification('bad-token');
      expect(result.redirectUrl).toContain('status=error');
      expect(result.redirectUrl).toContain('reason=invalid_token');
    });

    it('should return error redirect for expired token', async () => {
      const chain = createMockQueryChain({
        data: {
          expires_at: new Date(Date.now() - 86400000).toISOString(), // expired yesterday
          user_id: 'u1',
          email: 'enc_email',
        },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.confirmVerification('expired-token');
      expect(result.redirectUrl).toContain('status=error');
      expect(result.redirectUrl).toContain('reason=expired');
    });

    it('should verify successfully with valid token', async () => {
      // 1) fetch token
      const tokenChain = createMockQueryChain({
        data: {
          id: 't1',
          token: 'valid-token',
          user_id: 'u1',
          email: 'enc_user@google.com',
          company_name: 'Google',
          expires_at: new Date(Date.now() + 86400000).toISOString(),
        },
        error: null,
      });
      // All subsequent queries succeed with default mock
      const defaultChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(tokenChain)
        .mockReturnValue(defaultChain);

      const result = await service.confirmVerification('valid-token');
      expect(result.redirectUrl).toContain('status=success');
    });
  });
});
