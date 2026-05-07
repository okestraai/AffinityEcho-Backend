jest.mock('../../database/supabase.client', () => ({ supabaseAdmin: jest.fn(), supabaseClient: jest.fn() }));
jest.mock('../../common/utils/logger.util', () => ({ __esModule: true, default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

// Suppress NestJS Logger
jest.spyOn(console, 'log').mockImplementation();
jest.spyOn(console, 'error').mockImplementation();

import { BadRequestException } from '@nestjs/common';
import { CompanyVerificationService } from '../../modules/user/services/company-verification.service';
import { supabaseAdmin } from '../../database/supabase.client';
import { createMockSupabaseClient, createMockQueryChain, createMockConfigService } from '../helpers/mock-supabase';
import { MSG } from '../../common/constants/messages';

describe('CompanyVerificationService', () => {
  let service: CompanyVerificationService;
  let mockClient: any;
  let mockEncryption: any;
  let mockEmailService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    mockEncryption = { encrypt: jest.fn(v => 'enc_' + v), decrypt: jest.fn(v => 'dec_' + v) };
    mockEmailService = { sendVerificationEmail: jest.fn().mockResolvedValue(true) };

    service = new CompanyVerificationService(
      createMockConfigService() as any,
      mockEncryption, mockEmailService,
    );
  });

  describe('getVerificationStatus', () => {
    it.skip('should return verification status', async () => {
      const profileChain = createMockQueryChain({
        data: {
          id: 'u1', company_encrypted: 'enc_Google', is_company_verified: true,
          verification_email: 'user@google.com', verification_email_hash: 'hash123',
        },
        error: null,
      });
      mockClient.from.mockReturnValue(profileChain);

      const result = await service.getVerificationStatus('u1');
      expect(result.success).toBe(true);
      expect(result.data.isVerified).toBe(true);
    });

    it.skip('should return not verified when no company', async () => {
      const chain = createMockQueryChain({
        data: { id: 'u1', company_encrypted: null, is_company_verified: false },
        error: null,
      });
      mockClient.from.mockReturnValue(chain);

      const result = await service.getVerificationStatus('u1');
      expect(result.data.isVerified).toBe(false);
    });

    it('should handle DB error', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' } });
      mockClient.from.mockReturnValue(chain);

      await expect(service.getVerificationStatus('u1')).rejects.toThrow();
    });
  });

  describe('sendVerificationEmail', () => {
    it('should throw if already verified', async () => {
      const chain = createMockQueryChain({
        data: { id: 'u1', is_company_verified: true, company_encrypted: 'enc_Google' },
        error: null,
      });
      mockClient.from.mockReturnValue(chain);

      await expect(service.requestVerification('u1', 'user@google.com')).rejects.toThrow(BadRequestException);
    });

    it('should throw if no company on profile', async () => {
      const chain = createMockQueryChain({
        data: { id: 'u1', is_company_verified: false, company_encrypted: null },
        error: null,
      });
      mockClient.from.mockReturnValue(chain);

      await expect(service.requestVerification('u1', 'user@google.com')).rejects.toThrow(BadRequestException);
    });
  });

  describe('verifyToken', () => {
    it.skip('should throw if token not found', async () => {
      const chain = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValue(chain);

      await expect(service.confirmVerification('bad-token')).rejects.toThrow();
    });

    it.skip('should throw if token expired', async () => {
      const chain = createMockQueryChain({
        data: { id: 'v1', token: 'tok', user_id: 'u1', expires_at: new Date(Date.now() - 86400000).toISOString() },
        error: null,
      });
      mockClient.from.mockReturnValue(chain);

      await expect(service.confirmVerification('tok')).rejects.toThrow();
    });
  });
});
