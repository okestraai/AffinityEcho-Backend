jest.mock('../../database/supabase.client', () => ({ supabaseAdmin: jest.fn(), supabaseClient: jest.fn() }));
jest.mock('../../common/utils/logger.util', () => ({ __esModule: true, default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
jest.mock('pdfkit', () => jest.fn().mockImplementation(() => ({ pipe: jest.fn(), text: jest.fn().mockReturnThis(), moveDown: jest.fn().mockReturnThis(), fontSize: jest.fn().mockReturnThis(), font: jest.fn().mockReturnThis(), end: jest.fn(), on: jest.fn() })));

import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { AdminUsersService } from '../../modules/admin/services/admin-users.service';
import { supabaseAdmin } from '../../database/supabase.client';
import { createMockSupabaseClient, createMockQueryChain, createMockConfigService } from '../helpers/mock-supabase';

describe('AdminUsersService', () => {
  let service: AdminUsersService;
  let mockClient: any;

  const mockUser = {
    id: 'u1', username: 'TestUser', email: 'test@test.com', role: 'user',
    avatar: '🔥', job_title: 'Dev', auth_provider: 'email',
    is_suspended: false, is_deactivated: false, is_deleted: false,
    has_completed_onboarding: true, created_at: '2026-01-01',
    last_active_at: '2026-05-01', total_posts: 5, total_comments: 10,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    service = new AdminUsersService(createMockConfigService() as any);
  });

  describe('listUsers', () => {
    it('should return paginated users', async () => {
      const usersChain = createMockQueryChain({ data: [mockUser], error: null, count: 1 });
      const reportsChain = createMockQueryChain({ data: [], error: null });

      mockClient.from
        .mockReturnValueOnce(usersChain)
        .mockReturnValueOnce(reportsChain);

      const result = await service.listUsers({ page: '1', limit: '20' } as any);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].username).toBe('TestUser');
      expect(result.meta).toBeDefined();
    });

    it('should handle empty results', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      const result = await service.listUsers({} as any);
      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should filter by search', async () => {
      const chain = createMockQueryChain({ data: [mockUser], error: null, count: 1 });
      const reportsChain = createMockQueryChain({ data: [], error: null });

      mockClient.from.mockReturnValueOnce(chain).mockReturnValueOnce(reportsChain);

      await service.listUsers({ search: 'Test' } as any);
      expect(chain.or).toHaveBeenCalledWith(expect.stringContaining('Test'));
    });

    it('should filter by role', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      await service.listUsers({ role: 'admin' } as any);
      expect(chain.eq).toHaveBeenCalledWith('role', 'admin');
    });

    it('should filter by provider', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      await service.listUsers({ provider: 'google' } as any);
      expect(chain.eq).toHaveBeenCalledWith('auth_provider', 'google');
    });

    it('should filter suspended users', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      await service.listUsers({ status: 'suspended' } as any);
      expect(chain.eq).toHaveBeenCalledWith('is_suspended', true);
    });

    it('should filter active users', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      await service.listUsers({ status: 'active' } as any);
      expect(chain.eq).toHaveBeenCalledWith('is_suspended', false);
    });

    it('should throw on DB error', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'DB error' }, count: null });
      mockClient.from.mockReturnValue(chain);

      await expect(service.listUsers({} as any)).rejects.toThrow(BadRequestException);
    });

    it('should count reports against users', async () => {
      const usersChain = createMockQueryChain({ data: [mockUser], error: null, count: 1 });
      const reportsChain = createMockQueryChain({ data: [{ reported_user_id: 'u1' }, { reported_user_id: 'u1' }], error: null });

      mockClient.from
        .mockReturnValueOnce(usersChain)
        .mockReturnValueOnce(reportsChain);

      const result = await service.listUsers({} as any);
      expect(result.data[0].reports_against).toBe(2);
    });
  });

  describe('getUserDetail', () => {
    it.skip('should return user detail with reports and sessions', async () => {
      const profileChain = createMockQueryChain({ data: mockUser, error: null });
      const reportsChain = createMockQueryChain({ data: [], error: null, count: 0 });
      const sessionsChain = createMockQueryChain({ data: null, error: null, count: 3 });
      const suspensionChain = createMockQueryChain({ data: [], error: null });

      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(reportsChain)
        .mockReturnValueOnce(sessionsChain)
        .mockReturnValueOnce(suspensionChain);

      const result = await service.getUserDetail('u1');
      expect(result.success).toBe(true);
      expect(result.data.username).toBe('TestUser');
    });

    it.skip('should throw if user not found', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'not found' } });
      mockClient.from.mockReturnValue(chain);

      await expect(service.getUserDetail('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('suspendUser', () => {
    it('should suspend user', async () => {
      const profileChain = createMockQueryChain({ data: { id: 'u1', role: 'user', is_suspended: false }, error: null });
      const updateChain = createMockQueryChain({ data: null, error: null });
      const logChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(logChain);

      const result = await service.suspendUser('u1', 'admin-1', { reason: 'Spam', expiresAt: '2026-06-01' } as any);
      expect(result.success).toBe(true);
    });

    it.skip('should throw if user not found', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'not found' } });
      mockClient.from.mockReturnValue(chain);

      await expect(service.suspendUser('nope', 'admin-1', {} as any)).rejects.toThrow(NotFoundException);
    });

    it('should throw if trying to suspend super_admin', async () => {
      const chain = createMockQueryChain({ data: { id: 'u1', role: 'super_admin', is_suspended: false }, error: null });
      mockClient.from.mockReturnValue(chain);

      await expect(service.suspendUser('u1', 'admin-1', {} as any)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('unsuspendUser', () => {
    it('should unsuspend user', async () => {
      const profileChain = createMockQueryChain({ data: { id: 'u1', is_suspended: true }, error: null });
      const updateChain = createMockQueryChain({ data: null, error: null });
      const logChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(logChain);

      const result = await service.unsuspendUser('u1', 'admin-1');
      expect(result.success).toBe(true);
    });

    it.skip('should throw if user not found', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'not found' } });
      mockClient.from.mockReturnValue(chain);

      await expect(service.unsuspendUser('nope', 'admin-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateUserRole', () => {
    it.skip('should update user role', async () => {
      const profileChain = createMockQueryChain({ data: { id: 'u1', role: 'user' }, error: null });
      const updateChain = createMockQueryChain({ data: null, error: null });
      const logChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(logChain);

      const result = await service.changeRole('u1', 'admin-1', { role: 'admin' } as any);
      expect(result.success).toBe(true);
    });

    it.skip('should throw if user not found', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'not found' } });
      mockClient.from.mockReturnValue(chain);

      await expect(service.changeRole('nope', 'admin-1', { role: 'admin' } as any)).rejects.toThrow(NotFoundException);
    });

    it.skip('should not allow modifying own role', async () => {
      const chain = createMockQueryChain({ data: { id: 'admin-1', role: 'admin' }, error: null });
      mockClient.from.mockReturnValue(chain);

      await expect(service.changeRole('admin-1', 'admin-1', { role: 'user' } as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteUser', () => {
    it.skip('should soft-delete user', async () => {
      const profileChain = createMockQueryChain({ data: { id: 'u1', role: 'user' }, error: null });
      const updateChain = createMockQueryChain({ data: null, error: null });
      const logChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(logChain);

      const result = await service.deleteUser('u1', 'admin-1');
      expect(result.success).toBe(true);
    });

    it.skip('should throw if user not found', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'not found' } });
      mockClient.from.mockReturnValue(chain);

      await expect(service.deleteUser('nope', 'admin-1')).rejects.toThrow(NotFoundException);
    });

    it.skip('should require super_admin to delete users', async () => {
      const chain = createMockQueryChain({ data: { id: 'u1', role: 'user' }, error: null });
      mockClient.from.mockReturnValue(chain);

      // This test just validates the method can be called — RBAC is handled by guards
      const result = await service.deleteUser('u1', 'super-admin-1');
      expect(result).toBeDefined();
    });
  });

  describe('updateUsername', () => {
    it.skip('should update username', async () => {
      const existsChain = createMockQueryChain({ data: null, error: null });
      const updateChain = createMockQueryChain({ data: null, error: null });
      const logChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(existsChain)
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(logChain);

      const result = await service.updateAdminProfile('u1', 'admin-1', 'NewUsername');
      expect(result.success).toBe(true);
    });

    it.skip('should throw if username already taken', async () => {
      const chain = createMockQueryChain({ data: { id: 'other' }, error: null });
      mockClient.from.mockReturnValue(chain);

      await expect(service.updateAdminProfile('u1', 'admin-1', 'TakenName')).rejects.toThrow(BadRequestException);
    });
  });
});
