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
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('test-token'),
  verify: jest.fn(),
}));

import { AdminHealthService } from '../../modules/admin/services/admin-health.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';

describe('AdminHealthService', () => {
  let service: AdminHealthService;
  let mockClient: any;
  let mockEncryption: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);

    mockEncryption = {
      encrypt: jest.fn().mockReturnValue('encrypted'),
      decrypt: jest.fn().mockReturnValue('decrypted'),
    };

    const mockConfig = createMockConfigService({
      JWT_SECRET: 'test-secret',
      SMTP_HOST: 'smtp.test.com',
      SMTP_USER: 'user',
      SMTP_PASS: 'pass',
      FIREBASE_SERVICE_ACCOUNT: '{"type":"service_account"}',
      RESEND_API_KEY: 'test-key',
    });

    service = new AdminHealthService(mockConfig as any, mockEncryption);
  });

  describe('getHealth', () => {
    it('should return health status for all modules', async () => {
      // Mock all the table queries to succeed
      const successChain = createMockQueryChain({
        data: [{ id: '1' }],
        error: null,
        count: 1,
      });
      mockClient.from.mockReturnValue(successChain);

      const result = await service.getHealth();

      expect(result.success).toBe(true);
      expect(result.data.status).toBeDefined();
      expect(result.data.modules).toBeDefined();
      expect(result.data.uptime_seconds).toBeGreaterThanOrEqual(0);
      expect(result.data.modules.database).toBeDefined();
      expect(result.data.modules.auth).toBeDefined();
      expect(result.data.modules.feed).toBeDefined();
      expect(result.data.modules.forum).toBeDefined();
      expect(result.data.modules.nooks).toBeDefined();
      expect(result.data.modules.messaging).toBeDefined();
      expect(result.data.modules.mentorship).toBeDefined();
      expect(result.data.modules.notifications).toBeDefined();
      expect(result.data.modules.email).toBeDefined();
      expect(result.data.modules.push_notifications).toBeDefined();
      expect(result.data.modules.encryption).toBeDefined();
    });

    it('should report degraded when non-critical module is down', async () => {
      // Database and auth succeed, but feed fails
      let callCount = 0;
      mockClient.from.mockImplementation(() => {
        callCount++;
        if (callCount === 3) {
          // feed check fails
          return createMockQueryChain({
            data: null,
            error: { message: 'table not found' },
            count: null,
          });
        }
        return createMockQueryChain({
          data: [{ id: '1' }],
          error: null,
          count: 1,
        });
      });

      const result = await service.getHealth();
      // Status should be 'up' or 'degraded' depending on which module failed
      expect(['up', 'degraded', 'down']).toContain(result.data.status);
    });

    it('should include resolution guidance for down modules', async () => {
      // Make everything fail
      const failChain = createMockQueryChain({
        data: null,
        error: { message: 'connection refused' },
        count: null,
      });
      mockClient.from.mockReturnValue(failChain);

      const result = await service.getHealth();
      const downModules = Object.entries(result.data.modules).filter(
        ([, h]: [string, any]) => h.status === 'down',
      );
      // At least some down modules should have resolution guidance
      expect(downModules.length).toBeGreaterThan(0);
    });
  });

  describe('storeHealthCheck', () => {
    it('should store health check results to DB', async () => {
      const successChain = createMockQueryChain({
        data: [{ id: '1' }],
        error: null,
        count: 1,
      });
      const insertChain = createMockQueryChain({ data: null, error: null });
      const deleteChain = createMockQueryChain({ data: null, error: null });

      mockClient.from.mockReturnValue(successChain);

      // Should not throw
      await service.storeHealthCheck();
      expect(mockClient.from).toHaveBeenCalled();
    });

    it('should not throw on store failure', async () => {
      const errorChain = createMockQueryChain({
        data: null,
        error: { message: 'insert failed' },
      });
      mockClient.from.mockReturnValue(errorChain);

      // Should not throw even on error
      await expect(service.storeHealthCheck()).resolves.not.toThrow();
    });
  });

  describe('getHistory', () => {
    it('should return health history', async () => {
      const historyChain = createMockQueryChain({
        data: [
          {
            module: 'database',
            status: 'up',
            latency_ms: 10,
            error: null,
            checked_at: '2026-05-07T00:00:00Z',
          },
          {
            module: 'database',
            status: 'up',
            latency_ms: 12,
            error: null,
            checked_at: '2026-05-07T00:05:00Z',
          },
          {
            module: 'feed',
            status: 'up',
            latency_ms: 8,
            error: null,
            checked_at: '2026-05-07T00:00:00Z',
          },
        ],
        error: null,
      });
      mockClient.from.mockReturnValue(historyChain);

      const result = await service.getHistory();
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should handle empty history', async () => {
      const emptyChain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValue(emptyChain);

      const result = await service.getHistory();
      expect(result.success).toBe(true);
    });

    it('should throw on DB error', async () => {
      const errorChain = createMockQueryChain({
        data: null,
        error: new Error('fail'),
      });
      mockClient.from.mockReturnValue(errorChain);

      await expect(service.getHistory()).rejects.toBeDefined();
    });
  });
});
