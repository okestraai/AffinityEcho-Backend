import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { OnboardingService } from '../../modules/auth/services/onboarding.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';

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

describe('OnboardingService', () => {
  let service: OnboardingService;
  let mockClient: any;
  let mockEmailService: any;
  let mockEncryption: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    mockEmailService = { sendWelcomeEmail: jest.fn().mockResolvedValue({}) };
    mockEncryption = {
      encrypt: jest.fn((t: string) => 'enc_' + t),
      decrypt: jest.fn((t: string) => 'dec_' + t),
    };
    service = new OnboardingService(
      createMockConfigService() as any,
      mockEmailService,
      mockEncryption,
    );
  });

  describe('saveOnboardingData', () => {
    const dto = {
      firstName: 'John',
      lastName: 'Doe',
      race: 'Black',
      gender: 'Male',
      careerLevel: 'Senior',
      company: 'Google',
      companyType: 'static',
      affinityTags: ['black-professionals', 'immigrant-professionals'],
    };

    it('should save onboarding data and send welcome email', async () => {
      const updateChain = createMockQueryChain({
        data: { username: 'TestUser', email: 'test@test.com' },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(updateChain);

      const result = await service.saveOnboardingData('u1', dto as any);
      expect(result.has_completed_onboarding).toBe(true);
      expect(mockEncryption.encrypt).toHaveBeenCalledWith('John');
      expect(mockEncryption.encrypt).toHaveBeenCalledWith('Doe');
      expect(mockEncryption.encrypt).toHaveBeenCalledWith('Black');
      expect(mockEncryption.encrypt).toHaveBeenCalledWith('Male');
      expect(mockEncryption.encrypt).toHaveBeenCalledWith('Senior');
      expect(mockEncryption.encrypt).toHaveBeenCalledWith('Google');
      expect(mockEmailService.sendWelcomeEmail).toHaveBeenCalledWith(
        'test@test.com',
        'TestUser',
      );
    });

    it('should handle ageConfirmed field', async () => {
      const updateChain = createMockQueryChain({
        data: { username: 'Test', email: 'test@test.com' },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(updateChain);

      const result = await service.saveOnboardingData('u1', {
        ...dto,
        ageConfirmed: true,
      } as any);
      expect(result.has_completed_onboarding).toBe(true);
    });

    it('should succeed even if welcome email fails', async () => {
      const updateChain = createMockQueryChain({
        data: { username: 'Test', email: 'test@test.com' },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(updateChain);
      mockEmailService.sendWelcomeEmail.mockRejectedValueOnce(
        new Error('SMTP down'),
      );

      const result = await service.saveOnboardingData('u1', dto as any);
      expect(result.has_completed_onboarding).toBe(true); // Still succeeds
    });

    it('should throw on update error', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'update failed' },
      });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(
        service.saveOnboardingData('u1', dto as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle minimal data (only required fields)', async () => {
      const updateChain = createMockQueryChain({
        data: { username: 'Test', email: 'test@test.com' },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(updateChain);

      const result = await service.saveOnboardingData('u1', {
        firstName: 'Jane',
        lastName: 'Smith',
      } as any);
      expect(result.has_completed_onboarding).toBe(true);
      expect(mockEncryption.encrypt).toHaveBeenCalledWith('Jane');
      expect(mockEncryption.encrypt).toHaveBeenCalledWith('Smith');
    });
  });
});
