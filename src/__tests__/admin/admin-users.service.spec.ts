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
jest.mock('pdfkit', () =>
  jest.fn().mockImplementation(() => ({
    pipe: jest.fn(),
    text: jest.fn().mockReturnThis(),
    moveDown: jest.fn().mockReturnThis(),
    fontSize: jest.fn().mockReturnThis(),
    font: jest.fn().mockReturnThis(),
    end: jest.fn(),
    on: jest.fn(),
  })),
);

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AdminUsersService } from '../../modules/admin/services/admin-users.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';

describe('AdminUsersService', () => {
  let service: AdminUsersService;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    service = new AdminUsersService(createMockConfigService() as any);
  });

  describe('listUsers', () => {
    it('should return paginated users', async () => {
      const chain = createMockQueryChain({
        data: [
          {
            id: 'u1',
            username: 'TestUser',
            email: 'test@test.com',
            role: 'user',
            created_at: '2026-01-01',
          },
        ],
        error: null,
        count: 1,
      });
      mockClient.from.mockReturnValue(chain);
      const result = await service.listUsers({} as any);
      expect(result.success).toBe(true);
    });

    it('should handle empty results', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);
      const result = await service.listUsers({} as any);
      expect(result.data).toEqual([]);
    });

    it('should throw on DB error', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'fail' },
        count: null,
      });
      mockClient.from.mockReturnValue(chain);
      await expect(service.listUsers({} as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getUserDetail', () => {
    it('should return user detail', async () => {
      // 1) user_profiles 2) harassment_reports 3) mentorship_sessions
      const profileChain = createMockQueryChain({
        data: {
          id: 'u1',
          username: 'Test',
          email: 'test@test.com',
          role: 'user',
        },
        error: null,
      });
      const defaultChain = createMockQueryChain({
        data: [],
        error: null,
        count: 0,
      });
      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValue(defaultChain);
      const result = await service.getUserDetail('u1');
      expect(result.success).toBe(true);
    });

    it('should throw if user not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { code: 'PGRST116' },
      });
      mockClient.from.mockReturnValue(chain);
      await expect(service.getUserDetail('nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('suspendUser', () => {
    it('should suspend user', async () => {
      // 1) fetch user 2) update user 3) logAction
      const fetchChain = createMockQueryChain({
        data: { id: 'u2', role: 'user', is_suspended: false },
        error: null,
      });
      const defaultChain = createMockQueryChain({
        data: { id: 'u2', is_suspended: true },
        error: null,
      });
      mockClient.from
        .mockReturnValueOnce(fetchChain)
        .mockReturnValue(defaultChain);
      const result = await service.suspendUser(
        'admin-1',
        'Admin',
        'admin',
        'u2',
        'Violation',
      );
      expect(result.success).toBe(true);
    });

    it('should throw if suspending self', async () => {
      await expect(
        service.suspendUser('admin-1', 'Admin', 'admin', 'admin-1', 'Nope'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw on DB error', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'fail' },
      });
      mockClient.from.mockReturnValue(chain);
      await expect(
        service.suspendUser('admin-1', 'Admin', 'admin', 'u2', 'Reason'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('unsuspendUser', () => {
    it('should unsuspend user', async () => {
      const fetchChain = createMockQueryChain({
        data: { id: 'u2', is_suspended: true },
        error: null,
      });
      const defaultChain = createMockQueryChain({
        data: { id: 'u2', is_suspended: false },
        error: null,
      });
      mockClient.from
        .mockReturnValueOnce(fetchChain)
        .mockReturnValue(defaultChain);
      const result = await service.unsuspendUser(
        'admin-1',
        'Admin',
        'u2',
        'Resolved',
      );
      expect(result.success).toBe(true);
    });

    it('should throw if unsuspending self', async () => {
      await expect(
        service.unsuspendUser('admin-1', 'Admin', 'admin-1', 'Nope'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('changeRole', () => {
    it('should change user role', async () => {
      const fetchChain = createMockQueryChain({
        data: { id: 'u2', role: 'user' },
        error: null,
      });
      const defaultChain = createMockQueryChain({
        data: { id: 'u2', role: 'admin' },
        error: null,
      });
      mockClient.from
        .mockReturnValueOnce(fetchChain)
        .mockReturnValue(defaultChain);
      const result = await service.changeRole(
        'admin-1',
        'Admin',
        'super_admin',
        'u2',
        'admin',
      );
      expect(result.success).toBe(true);
    });

    it('should throw if changing own role', async () => {
      await expect(
        service.changeRole(
          'admin-1',
          'Admin',
          'super_admin',
          'admin-1',
          'user',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if not super_admin trying to set super_admin', async () => {
      const fetchChain = createMockQueryChain({
        data: { id: 'u2', role: 'user' },
        error: null,
      });
      mockClient.from.mockReturnValue(fetchChain);
      await expect(
        service.changeRole('admin-1', 'Admin', 'admin', 'u2', 'super_admin'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteUser', () => {
    it('should soft-delete user', async () => {
      const fetchChain = createMockQueryChain({
        data: { id: 'u2', role: 'user' },
        error: null,
      });
      const defaultChain = createMockQueryChain({ data: null, error: null });
      mockClient.from
        .mockReturnValueOnce(fetchChain)
        .mockReturnValue(defaultChain);
      const result = await service.deleteUser(
        'admin-1',
        'Admin',
        'super_admin',
        'u2',
        'Violation',
      );
      expect(result).toBeNull();
    });

    it('should throw if not super_admin', async () => {
      await expect(
        service.deleteUser('admin-1', 'Admin', 'admin', 'u2', 'Nope'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw if deleting self', async () => {
      await expect(
        service.deleteUser(
          'admin-1',
          'Admin',
          'super_admin',
          'admin-1',
          'Nope',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getAdminProfile', () => {
    it('should return admin profile', async () => {
      const chain = createMockQueryChain({
        data: { id: 'admin-1', username: 'Admin', role: 'admin' },
        error: null,
      });
      mockClient.from.mockReturnValue(chain);
      const result = await service.getAdminProfile('admin-1');
      expect(result.success).toBe(true);
    });

    it('should throw if not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { code: 'PGRST116' },
      });
      mockClient.from.mockReturnValue(chain);
      await expect(service.getAdminProfile('nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('logAction', () => {
    it('should log admin action', async () => {
      const chain = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValue(chain);
      await service.logAction(
        'admin-1',
        'Admin',
        'suspend_user',
        'user',
        'u2',
        'Violation',
      );
      expect(mockClient.from).toHaveBeenCalledWith('admin_logs');
    });
  });
});
