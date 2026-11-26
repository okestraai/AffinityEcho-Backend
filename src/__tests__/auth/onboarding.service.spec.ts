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

const mockCompanies = {
  resolve: jest.fn(async (name: string) => ({
    name,
    columns: {
      company_encrypted: 'enc_' + name,
      company_type: 'static',
      company_key: null,
    },
  })),
};

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
      mockCompanies as any,
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
      affinityTags: ['Black Professionals', 'Immigrant Professionals'],
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
      expect(mockCompanies.resolve).toHaveBeenCalledWith('Google');
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

    it('should reject invalid affinity tags', async () => {
      await expect(
        service.saveOnboardingData('u1', {
          ...dto,
          affinityTags: ['Black Professionals', 'not-a-real-group'],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should accept legacy kebab-case and retired affinity tags', async () => {
      const updateChain = createMockQueryChain({
        data: { username: 'Test', email: 'test@test.com' },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(updateChain);

      const result = await service.saveOnboardingData('u1', {
        ...dto,
        affinityTags: ['black-professionals', 'Black Women in Tech'],
      } as any);
      expect(result.has_completed_onboarding).toBe(true);
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

  describe('global and student fields', () => {
    const base = { firstName: 'Ada', lastName: 'Obi' };
    const lastUpdate = () =>
      mockClient.from.mock.results.at(-1).value.update.mock.calls.at(-1)[0];

    beforeEach(() => {
      mockClient.from.mockReturnValue(
        createMockQueryChain({
          data: { username: 'u', email: 'u@x.co' },
          error: null,
        }),
      );
    });

    it('saves the country, joined ethnicities and student details', async () => {
      await service.saveOnboardingData('u1', {
        ...base,
        country: 'ng',
        ethnicities: ['Black / African', 'Caribbean', 'Caribbean'],
        isStudent: true,
        school: '  university of  lagos ',
        expectedGradYear: new Date().getFullYear() + 1,
        showSchool: true,
      } as any);
      const saved = lastUpdate();
      expect(saved.country_code).toBe('NG');
      expect(saved.race_encrypted).toBe('enc_Black / African, Caribbean');
      expect(saved.is_student).toBe(true);
      expect(saved.school_encrypted).toBe('enc_University Of Lagos');
      expect(saved.show_school).toBe(true);
    });

    it('takes the company type from the company list, not the app', async () => {
      mockCompanies.resolve.mockResolvedValueOnce({
        name: 'Dangote',
        columns: {
          company_encrypted: 'enc_Dangote',
          company_type: 'other',
          company_key: 'k1',
        },
      });
      await service.saveOnboardingData('u1', {
        ...base,
        company: 'dangote',
        companyType: 'static',
      } as any);
      const saved = lastUpdate();
      expect(saved.company_type).toBe('other');
      expect(saved.company_key).toBe('k1');
    });

    it('saves no company when none is given', async () => {
      await service.saveOnboardingData('u1', { ...base, company: '  ' } as any);
      expect(lastUpdate().company_encrypted).toBeUndefined();
    });

    it('refuses a school name that is only spaces', async () => {
      await expect(
        service.saveOnboardingData('u1', {
          ...base,
          isStudent: true,
          school: '   ',
        } as any),
      ).rejects.toThrow('Add your school or university');
    });

    it('treats a null country or company as not given', async () => {
      await service.saveOnboardingData('u1', {
        ...base,
        country: null,
        company: null,
      } as any);
      const saved = lastUpdate();
      expect(saved.country_code).toBeUndefined();
      expect(saved.company_encrypted).toBeUndefined();
    });

    it('refuses a school named like a forum space', async () => {
      await expect(
        service.saveOnboardingData('u1', {
          ...base,
          isStudent: true,
          school: 'students',
        } as any),
      ).rejects.toThrow("can't be used as a school name");
    });
  });
});
