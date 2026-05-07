import { BadRequestException } from '@nestjs/common';
import { UserSettingsService } from '../../modules/user/services/user-settings.service';
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

describe('UserSettingsService', () => {
  let service: UserSettingsService;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    service = new UserSettingsService(createMockConfigService() as any);
  });

  describe('getPrivacySettings', () => {
    it('should return privacy settings', async () => {
      const chain = createMockQueryChain({
        data: {
          profile_visibility: 'public',
          show_email: true,
          show_company: true,
          show_location: true,
          allow_messages_from: 'everyone',
          show_activity: true,
          show_connections: true,
        },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);
      const result = await service.getPrivacySettings('u1');
      expect(result.success).toBe(true);
      expect(result.data.profileVisibility).toBe('public');
      expect(result.data.showEmail).toBe(true);
    });

    it('should return defaults on error', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'not found' },
      });
      mockClient.from.mockReturnValueOnce(chain);
      const result = await service.getPrivacySettings('u1');
      expect(result.success).toBe(true);
      expect(result.data.profileVisibility).toBe('public');
      expect(result.data.showEmail).toBe(false);
    });
  });

  describe('updatePrivacySettings', () => {
    it('should update settings', async () => {
      const chain = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValueOnce(chain);
      const result = await service.updatePrivacySettings('u1', {
        showEmail: false,
        showLocation: false,
      });
      expect(result.success).toBe(true);
    });

    it('should throw on error', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'fail' },
      });
      mockClient.from.mockReturnValueOnce(chain);
      await expect(
        service.updatePrivacySettings('u1', { showEmail: false }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getNotificationSettings', () => {
    it('should return notification settings', async () => {
      const chain = createMockQueryChain({
        data: {
          email_notifications: true,
          push_notifications: true,
          notify_on_comment: true,
          notify_on_like: true,
          notify_on_follow: true,
          notify_on_mention: true,
          notify_on_message: true,
          notify_on_connection_request: true,
          digest_frequency: 'daily',
        },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);
      const result = await service.getNotificationSettings('u1');
      expect(result.success).toBe(true);
      expect(result.data.emailNotifications).toBe(true);
      expect(result.data.digestFrequency).toBe('daily');
    });

    it('should return defaults on error', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'fail' },
      });
      mockClient.from.mockReturnValueOnce(chain);
      const result = await service.getNotificationSettings('u1');
      expect(result.success).toBe(true);
      expect(result.data.emailNotifications).toBe(true);
    });
  });

  describe('updateNotificationSettings', () => {
    it('should update notification settings', async () => {
      const chain = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValueOnce(chain);
      const result = await service.updateNotificationSettings('u1', {
        emailNotifications: false,
        pushNotifications: true,
      });
      expect(result.success).toBe(true);
    });

    it('should throw on error', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'fail' },
      });
      mockClient.from.mockReturnValueOnce(chain);
      await expect(
        service.updateNotificationSettings('u1', { emailNotifications: false }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
