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

    it('should return pending status when token not expired', async () => {
      const profileChain = createMockQueryChain({
        data: {
          is_company_verified: false,
          company_verification_email: 'enc_email',
          company_verified_at: null,
          company_encrypted: 'enc_Google',
        },
        error: null,
      });
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
      expect(result.data.is_pending).toBe(true);
      expect(result.data.is_verified).toBe(false);
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

    it('should throw if company not eligible', async () => {
      const profileChain = createMockQueryChain({
        data: { id: 'u1', company_encrypted: 'enc_Startup', is_company_verified: false },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(profileChain);
      mockEncryption.decrypt.mockReturnValueOnce('SomeUnknownStartupXYZ');

      await expect(
        service.requestVerification('u1', 'user@startup.com'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if email domain does not match company', async () => {
      const profileChain = createMockQueryChain({
        data: { id: 'u1', company_encrypted: 'enc_Google', is_company_verified: false },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(profileChain);
      mockEncryption.decrypt.mockReturnValueOnce('Google');

      await expect(
        service.requestVerification('u1', 'user@notgoogle.com'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if email already used for verification', async () => {
      const profileChain = createMockQueryChain({
        data: { id: 'u1', company_encrypted: 'enc_Google', is_company_verified: false },
        error: null,
      });
      const usedEmailChain = createMockQueryChain({
        data: { id: 'ue1', revoked_at: null },
        error: null,
      });
      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(usedEmailChain);
      mockEncryption.decrypt.mockReturnValueOnce('Google');
      mockEncryption.hmac.mockReturnValueOnce('hmac_user@google.com');

      await expect(
        service.requestVerification('u1', 'user@google.com'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw on profile fetch error', async () => {
      const profileChain = createMockQueryChain({
        data: null,
        error: { message: 'DB error' },
      });
      mockClient.from.mockReturnValueOnce(profileChain);

      await expect(
        service.requestVerification('u1', 'user@google.com'),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should allow revoked email', async () => {
      const profileChain = createMockQueryChain({
        data: { id: 'u1', company_encrypted: 'enc_Google', is_company_verified: false },
        error: null,
      });
      mockEncryption.decrypt.mockReturnValueOnce('Google');
      const usedEmailChain = createMockQueryChain({
        data: { id: 'ue1', revoked_at: '2025-01-01' },
        error: null,
      });
      const pendingUserChain = createMockQueryChain({ data: null, error: null });
      const deleteChain = createMockQueryChain({ data: null, error: null });
      const insertChain = createMockQueryChain({ data: null, error: null });
      const updateChain = createMockQueryChain({ data: null, error: null });
      const usernameChain = createMockQueryChain({ data: { username: 'u' }, error: null });

      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(usedEmailChain)
        .mockReturnValueOnce(pendingUserChain)
        .mockReturnValueOnce(deleteChain)
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(usernameChain);

      const result = await service.requestVerification('u1', 'user@google.com');
      expect(result.success).toBe(true);
    });

    it('should throw if email pending for another user', async () => {
      const profileChain = createMockQueryChain({
        data: { id: 'u1', company_encrypted: 'enc_Google', is_company_verified: false },
        error: null,
      });
      mockEncryption.decrypt.mockReturnValueOnce('Google');
      const usedEmailChain = createMockQueryChain({ data: null, error: null });
      const pendingUserChain = createMockQueryChain({ data: { id: 'u2' }, error: null });

      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(usedEmailChain)
        .mockReturnValueOnce(pendingUserChain);

      await expect(
        service.requestVerification('u1', 'user@google.com'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw on token insert error', async () => {
      const profileChain = createMockQueryChain({
        data: { id: 'u1', company_encrypted: 'enc_Google', is_company_verified: false },
        error: null,
      });
      mockEncryption.decrypt.mockReturnValueOnce('Google');
      const usedEmailChain = createMockQueryChain({ data: null, error: null });
      const pendingUserChain = createMockQueryChain({ data: null, error: null });
      const deleteChain = createMockQueryChain({ data: null, error: null });
      const insertChain = createMockQueryChain({ data: null, error: { message: 'insert fail' } });

      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(usedEmailChain)
        .mockReturnValueOnce(pendingUserChain)
        .mockReturnValueOnce(deleteChain)
        .mockReturnValueOnce(insertChain);

      await expect(
        service.requestVerification('u1', 'user@google.com'),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should throw on profile update error', async () => {
      const profileChain = createMockQueryChain({
        data: { id: 'u1', company_encrypted: 'enc_Google', is_company_verified: false },
        error: null,
      });
      mockEncryption.decrypt.mockReturnValueOnce('Google');
      const usedEmailChain = createMockQueryChain({ data: null, error: null });
      const pendingUserChain = createMockQueryChain({ data: null, error: null });
      const deleteChain = createMockQueryChain({ data: null, error: null });
      const insertChain = createMockQueryChain({ data: null, error: null });
      const updateChain = createMockQueryChain({ data: null, error: { message: 'update fail' } });

      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(usedEmailChain)
        .mockReturnValueOnce(pendingUserChain)
        .mockReturnValueOnce(deleteChain)
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(updateChain);

      await expect(
        service.requestVerification('u1', 'user@google.com'),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should send verification email successfully', async () => {
      const profileChain = createMockQueryChain({
        data: { id: 'u1', company_encrypted: 'enc_Google', is_company_verified: false },
        error: null,
      });
      const noUsedEmail = createMockQueryChain({ data: null, error: null });
      const noPendingUser = createMockQueryChain({ data: null, error: null });
      const deleteTokensChain = createMockQueryChain({ data: null, error: null });
      const insertTokenChain = createMockQueryChain({ data: null, error: null });
      const updateProfileChain = createMockQueryChain({ data: null, error: null });
      const usernameChain = createMockQueryChain({ data: { username: 'TestUser' }, error: null });

      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(noUsedEmail)
        .mockReturnValueOnce(noPendingUser)
        .mockReturnValueOnce(deleteTokensChain)
        .mockReturnValueOnce(insertTokenChain)
        .mockReturnValueOnce(updateProfileChain)
        .mockReturnValueOnce(usernameChain);

      mockEncryption.decrypt.mockReturnValueOnce('Google');

      const result = await service.requestVerification('u1', 'user@google.com');
      expect(result.success).toBe(true);
      expect(mockEmailService.sendCompanyVerificationEmail).toHaveBeenCalled();
    });
  });

  describe('updateVerificationEmail', () => {
    it('should throw if already verified', async () => {
      const profileChain = createMockQueryChain({
        data: { id: 'u1', company_encrypted: 'enc_Google', is_company_verified: true, verification_email_hash: null },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(profileChain);

      await expect(
        service.updateVerificationEmail('u1', 'user@google.com'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if no pending verification', async () => {
      const profileChain = createMockQueryChain({
        data: { id: 'u1', company_encrypted: 'enc_Google', is_company_verified: false, verification_email_hash: null },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(profileChain);

      await expect(
        service.updateVerificationEmail('u1', 'user@google.com'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if email domain does not match', async () => {
      const profileChain = createMockQueryChain({
        data: { id: 'u1', company_encrypted: 'enc_Google', is_company_verified: false, verification_email_hash: 'old_hash' },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(profileChain);
      mockEncryption.decrypt.mockReturnValueOnce('Google');

      await expect(
        service.updateVerificationEmail('u1', 'user@notgoogle.com'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should resend to same email without dedup check', async () => {
      // When hmac matches existing hash, calls _resendVerification
      mockEncryption.hmac.mockReturnValueOnce('existing_hash');
      const profileChain = createMockQueryChain({
        data: {
          id: 'u1',
          company_encrypted: 'enc_Google',
          is_company_verified: false,
          verification_email_hash: 'existing_hash',
        },
        error: null,
      });
      mockEncryption.decrypt.mockReturnValueOnce('Google');
      // _resendVerification: delete tokens, insert token, get username
      const deleteChain = createMockQueryChain({ data: null, error: null });
      const insertChain = createMockQueryChain({ data: null, error: null });
      const usernameChain = createMockQueryChain({ data: { username: 'u' }, error: null });

      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(deleteChain)
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(usernameChain);

      const result = await service.updateVerificationEmail('u1', 'same@google.com');
      expect(result.success).toBe(true);
      expect(mockEmailService.sendCompanyVerificationEmail).toHaveBeenCalled();
    });

    it('should update with new email successfully', async () => {
      const profileChain = createMockQueryChain({
        data: {
          id: 'u1',
          company_encrypted: 'enc_Google',
          is_company_verified: false,
          verification_email_hash: 'old_hash',
        },
        error: null,
      });
      mockEncryption.decrypt.mockReturnValueOnce('Google');
      mockEncryption.hmac.mockReturnValueOnce('new_hash');
      const usedEmailChain = createMockQueryChain({ data: null, error: null });
      const pendingUserChain = createMockQueryChain({ data: null, error: null });
      const deleteChain = createMockQueryChain({ data: null, error: null });
      const insertChain = createMockQueryChain({ data: null, error: null });
      const updateChain = createMockQueryChain({ data: null, error: null });
      const usernameChain = createMockQueryChain({ data: { username: 'u' }, error: null });

      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(usedEmailChain)
        .mockReturnValueOnce(pendingUserChain)
        .mockReturnValueOnce(deleteChain)
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(usernameChain);

      const result = await service.updateVerificationEmail('u1', 'new@google.com');
      expect(result.success).toBe(true);
    });

    it('should throw if profile fetch fails', async () => {
      const profileChain = createMockQueryChain({
        data: null,
        error: { message: 'DB error' },
      });
      mockClient.from.mockReturnValueOnce(profileChain);

      await expect(
        service.updateVerificationEmail('u1', 'new@google.com'),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should throw if new email blocked by dedup', async () => {
      const profileChain = createMockQueryChain({
        data: {
          id: 'u1',
          company_encrypted: 'enc_Google',
          is_company_verified: false,
          verification_email_hash: 'old_hash',
        },
        error: null,
      });
      mockEncryption.decrypt.mockReturnValueOnce('Google');
      mockEncryption.hmac.mockReturnValueOnce('new_hash');
      const usedEmailChain = createMockQueryChain({
        data: { id: 'ue1', revoked_at: null },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(usedEmailChain);

      await expect(
        service.updateVerificationEmail('u1', 'used@google.com'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw on token insert error', async () => {
      const profileChain = createMockQueryChain({
        data: {
          id: 'u1',
          company_encrypted: 'enc_Google',
          is_company_verified: false,
          verification_email_hash: 'old_hash',
        },
        error: null,
      });
      mockEncryption.decrypt.mockReturnValueOnce('Google');
      mockEncryption.hmac.mockReturnValueOnce('new_hash');
      const usedEmailChain = createMockQueryChain({ data: null, error: null });
      const pendingUserChain = createMockQueryChain({ data: null, error: null });
      const deleteChain = createMockQueryChain({ data: null, error: null });
      const insertChain = createMockQueryChain({ data: null, error: { message: 'insert fail' } });

      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(usedEmailChain)
        .mockReturnValueOnce(pendingUserChain)
        .mockReturnValueOnce(deleteChain)
        .mockReturnValueOnce(insertChain);

      await expect(
        service.updateVerificationEmail('u1', 'new@google.com'),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should throw on profile update error', async () => {
      const profileChain = createMockQueryChain({
        data: {
          id: 'u1',
          company_encrypted: 'enc_Google',
          is_company_verified: false,
          verification_email_hash: 'old_hash',
        },
        error: null,
      });
      mockEncryption.decrypt.mockReturnValueOnce('Google');
      mockEncryption.hmac.mockReturnValueOnce('new_hash');
      const usedEmailChain = createMockQueryChain({ data: null, error: null });
      const pendingUserChain = createMockQueryChain({ data: null, error: null });
      const deleteChain = createMockQueryChain({ data: null, error: null });
      const insertChain = createMockQueryChain({ data: null, error: null });
      const updateChain = createMockQueryChain({ data: null, error: { message: 'update fail' } });

      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(usedEmailChain)
        .mockReturnValueOnce(pendingUserChain)
        .mockReturnValueOnce(deleteChain)
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(updateChain);

      await expect(
        service.updateVerificationEmail('u1', 'new@google.com'),
      ).rejects.toThrow(InternalServerErrorException);
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
      const defaultChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(tokenChain)
        .mockReturnValue(defaultChain);

      const result = await service.confirmVerification('valid-token');
      expect(result.redirectUrl).toContain('status=success');
    });

    it('should return error redirect on token update failure', async () => {
      const tokenChain = createMockQueryChain({
        data: {
          token: 'tok-1',
          user_id: 'u1',
          expires_at: new Date(Date.now() + 86400000).toISOString(),
        },
        error: null,
      });
      const updateTokenChain = createMockQueryChain({ data: null, error: { message: 'fail' } });

      mockClient.from
        .mockReturnValueOnce(tokenChain)
        .mockReturnValueOnce(updateTokenChain);

      const result = await service.confirmVerification('tok-1');
      expect(result.redirectUrl).toContain('reason=server_error');
    });

    it('should return error redirect on profile update failure', async () => {
      const tokenChain = createMockQueryChain({
        data: {
          token: 'tok-1',
          user_id: 'u1',
          expires_at: new Date(Date.now() + 86400000).toISOString(),
        },
        error: null,
      });
      const updateTokenChain = createMockQueryChain({ data: null, error: null });
      const profileChain = createMockQueryChain({
        data: { verification_email_hash: 'h', company_verification_email: 'e' },
        error: null,
      });
      const usedEmailChain = createMockQueryChain({ data: null, error: null });
      const updateProfileChain = createMockQueryChain({ data: null, error: { message: 'fail' } });

      mockClient.from
        .mockReturnValueOnce(tokenChain)
        .mockReturnValueOnce(updateTokenChain)
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(usedEmailChain)
        .mockReturnValueOnce(updateProfileChain);

      const result = await service.confirmVerification('tok-1');
      expect(result.redirectUrl).toContain('reason=server_error');
    });

    it('should handle used_verification_emails insert error gracefully', async () => {
      const tokenChain = createMockQueryChain({
        data: {
          token: 'tok-1',
          user_id: 'u1',
          expires_at: new Date(Date.now() + 86400000).toISOString(),
        },
        error: null,
      });
      const updateTokenChain = createMockQueryChain({ data: null, error: null });
      const profileChain = createMockQueryChain({
        data: { verification_email_hash: 'h', company_verification_email: 'e' },
        error: null,
      });
      const usedEmailChain = createMockQueryChain({ data: null, error: { message: 'dup' } });
      const updateProfileChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(tokenChain)
        .mockReturnValueOnce(updateTokenChain)
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(usedEmailChain)
        .mockReturnValueOnce(updateProfileChain);

      const result = await service.confirmVerification('tok-1');
      expect(result.redirectUrl).toContain('status=success');
    });

    it('should skip used_email insert when profile has no hash', async () => {
      const tokenChain = createMockQueryChain({
        data: {
          token: 'tok-1',
          user_id: 'u1',
          expires_at: new Date(Date.now() + 86400000).toISOString(),
        },
        error: null,
      });
      const updateTokenChain = createMockQueryChain({ data: null, error: null });
      const profileChain = createMockQueryChain({
        data: { verification_email_hash: null, company_verification_email: null },
        error: null,
      });
      const updateProfileChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(tokenChain)
        .mockReturnValueOnce(updateTokenChain)
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(updateProfileChain);

      const result = await service.confirmVerification('tok-1');
      expect(result.redirectUrl).toContain('status=success');
    });
  });
});
