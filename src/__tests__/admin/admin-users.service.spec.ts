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
    fillColor: jest.fn().mockReturnThis(),
    rect: jest.fn().mockReturnThis(),
    fill: jest.fn().mockReturnThis(),
    stroke: jest.fn().mockReturnThis(),
    roundedRect: jest.fn().mockReturnThis(),
    strokeColor: jest.fn().mockReturnThis(),
    lineWidth: jest.fn().mockReturnThis(),
    moveTo: jest.fn().mockReturnThis(),
    lineTo: jest.fn().mockReturnThis(),
    addPage: jest.fn().mockReturnThis(),
    end: jest.fn(),
    on: jest.fn(),
    page: { width: 842, height: 595 },
    bufferedPageRange: jest.fn().mockReturnValue({ start: 0 }),
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

  // =============================================
  // listUsers
  // =============================================
  describe('listUsers', () => {
    const mockUser = {
      id: 'u1',
      username: 'john',
      email: 'john@test.com',
      role: 'user',
      is_suspended: false,
      is_deactivated: false,
      is_deleted: false,
    };

    it('should return paginated users with reports count', async () => {
      const usersChain = createMockQueryChain({
        data: [mockUser],
        error: null,
        count: 1,
      });
      const reportsChain = createMockQueryChain({
        data: [
          { reported_user_id: 'u1' },
          { reported_user_id: 'u1' },
        ],
        error: null,
      });
      mockClient.from
        .mockReturnValueOnce(usersChain)
        .mockReturnValueOnce(reportsChain);

      const result = await service.listUsers({});

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].account_status).toBe('active');
      expect(result.data[0].reports_against).toBe(2);
      expect(result.meta.page).toBe(1);
      expect(result.meta.total).toBe(1);
    });

    it('should handle empty results without fetching reports', async () => {
      const usersChain = createMockQueryChain({
        data: [],
        error: null,
        count: 0,
      });
      mockClient.from.mockReturnValueOnce(usersChain);

      const result = await service.listUsers({});

      expect(result.data).toEqual([]);
      expect(mockClient.from).toHaveBeenCalledTimes(1);
    });

    it('should apply search filter with or()', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValueOnce(chain);

      await service.listUsers({ search: 'john' });

      expect(chain.or).toHaveBeenCalledWith(
        'username.ilike.%john%,email.ilike.%john%',
      );
    });

    it('should apply role filter', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValueOnce(chain);

      await service.listUsers({ role: 'admin' });

      expect(chain.eq).toHaveBeenCalledWith('role', 'admin');
    });

    it('should apply provider filter', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValueOnce(chain);

      await service.listUsers({ provider: 'google' });

      expect(chain.eq).toHaveBeenCalledWith('auth_provider', 'google');
    });

    it('should filter by status=suspended', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValueOnce(chain);

      await service.listUsers({ status: 'suspended' });

      expect(chain.eq).toHaveBeenCalledWith('is_suspended', true);
    });

    it('should filter by status=deactivated', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValueOnce(chain);

      await service.listUsers({ status: 'deactivated' });

      expect(chain.eq).toHaveBeenCalledWith('is_deactivated', true);
      expect(chain.eq).toHaveBeenCalledWith('is_deleted', false);
    });

    it('should filter by status=deleted', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValueOnce(chain);

      await service.listUsers({ status: 'deleted' });

      expect(chain.eq).toHaveBeenCalledWith('is_deleted', true);
    });

    it('should filter by status=active (all three false)', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValueOnce(chain);

      await service.listUsers({ status: 'active' });

      expect(chain.eq).toHaveBeenCalledWith('is_suspended', false);
      expect(chain.eq).toHaveBeenCalledWith('is_deactivated', false);
      expect(chain.eq).toHaveBeenCalledWith('is_deleted', false);
    });

    it('should apply default status filter (is_deleted=false) when no status', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValueOnce(chain);

      await service.listUsers({});

      expect(chain.eq).toHaveBeenCalledWith('is_deleted', false);
    });

    it('should throw BadRequestException on DB error', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'DB error' },
        count: null,
      });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.listUsers({})).rejects.toThrow(BadRequestException);
    });

    it('should handle reports fetch error gracefully', async () => {
      const usersChain = createMockQueryChain({
        data: [mockUser],
        error: null,
        count: 1,
      });
      const reportsChain = createMockQueryChain({
        data: null,
        error: { message: 'reports error' },
      });
      mockClient.from
        .mockReturnValueOnce(usersChain)
        .mockReturnValueOnce(reportsChain);

      const result = await service.listUsers({});

      expect(result.success).toBe(true);
      expect(result.data[0].reports_against).toBe(0);
    });

    it('should respect page and limit params', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 50 });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.listUsers({ page: '3', limit: '10' });

      expect(chain.range).toHaveBeenCalledWith(20, 29);
      expect(result.meta.page).toBe(3);
      expect(result.meta.page_size).toBe(10);
    });

    it('should sort by created_at when sortBy=reports_against', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValueOnce(chain);

      await service.listUsers({ sortBy: 'reports_against' });

      expect(chain.order).toHaveBeenCalledWith('created_at', {
        ascending: false,
      });
    });

    it('should set ascending=true when sortOrder=asc', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValueOnce(chain);

      await service.listUsers({ sortOrder: 'asc' });

      expect(chain.order).toHaveBeenCalledWith('created_at', {
        ascending: true,
      });
    });
  });

  // =============================================
  // getUserDetail
  // =============================================
  describe('getUserDetail', () => {
    const mockProfile = {
      id: 'u1',
      username: 'john',
      email: 'john@test.com',
      role: 'user',
      is_suspended: false,
      is_deactivated: false,
      is_deleted: false,
      total_posts: 5,
      total_comments: 10,
    };

    it('should return detailed user info with reports and suspension history', async () => {
      const profileChain = createMockQueryChain({
        data: mockProfile,
        error: null,
      });
      const reportsChain = createMockQueryChain({
        data: [{ id: 'r1' }, { id: 'r2' }],
        error: null,
      });
      const sessionsChain = createMockQueryChain({
        data: [],
        error: null,
        count: 7,
      });
      const logsChain = createMockQueryChain({
        data: [
          {
            action: 'suspend_user',
            reason: 'spam',
            admin_username: 'admin1',
            created_at: '2024-01-01',
            metadata: {},
          },
        ],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(reportsChain)
        .mockReturnValueOnce(sessionsChain)
        .mockReturnValueOnce(logsChain);

      const result = await service.getUserDetail('u1');

      expect(result.success).toBe(true);
      expect(result.data.user.account_status).toBe('active');
      expect(result.data.user.reports_against).toBe(2);
      expect(result.data.user.mentorship_sessions).toBe(7);
      expect(result.data.user.total_posts).toBe(5);
      expect(result.data.user.total_comments).toBe(10);
      expect(result.data.reports_against).toHaveLength(2);
      expect(result.data.suspension_history).toHaveLength(1);
      expect(result.data.suspension_history[0].performed_by).toBe('admin1');
    });

    it('should throw NotFoundException when user not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'not found' },
      });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.getUserDetail('bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should handle null data from parallel queries', async () => {
      const profileChain = createMockQueryChain({
        data: { ...mockProfile, total_posts: null, total_comments: null },
        error: null,
      });
      const defaultChain = createMockQueryChain({
        data: null,
        error: null,
        count: null,
      });
      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValue(defaultChain);

      const result = await service.getUserDetail('u1');

      expect(result.data.user.reports_against).toBe(0);
      expect(result.data.user.mentorship_sessions).toBe(0);
      expect(result.data.user.total_posts).toBe(0);
      expect(result.data.user.total_comments).toBe(0);
      expect(result.data.suspension_history).toEqual([]);
    });
  });

  // =============================================
  // suspendUser
  // =============================================
  describe('suspendUser', () => {
    it('should suspend a user successfully', async () => {
      const roleChain = createMockQueryChain({
        data: { role: 'user' },
        error: null,
      });
      const updateChain = createMockQueryChain({ data: null, error: null });
      const logChain = createMockQueryChain({ data: null, error: null });
      const notifChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(roleChain)
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(logChain)
        .mockReturnValueOnce(notifChain);

      const result = await service.suspendUser(
        'admin-1',
        'adminuser',
        'admin',
        'u2',
        'Spam behavior',
        '2025-12-31',
        '127.0.0.1',
      );

      expect(result.success).toBe(true);
      expect(result.data.account_status).toBe('suspended');
      expect(result.data.suspension_reason).toBe('Spam behavior');
      expect(result.data.suspension_expires_at).toBe('2025-12-31');
    });

    it('should suspend without expiresAt (null default)', async () => {
      const roleChain = createMockQueryChain({
        data: { role: 'user' },
        error: null,
      });
      const updateChain = createMockQueryChain({ data: null, error: null });
      const logChain = createMockQueryChain({ data: null, error: null });
      const notifChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(roleChain)
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(logChain)
        .mockReturnValueOnce(notifChain);

      const result = await service.suspendUser(
        'admin-1',
        'adminuser',
        'admin',
        'u2',
        'Spam',
      );

      expect(result.data.suspension_expires_at).toBeNull();
    });

    it('should throw BadRequestException on self-suspend', async () => {
      await expect(
        service.suspendUser('admin-1', 'admin', 'admin', 'admin-1', 'reason'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException when targeting super_admin', async () => {
      const roleChain = createMockQueryChain({
        data: { role: 'super_admin' },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(roleChain);

      await expect(
        service.suspendUser('admin-1', 'admin', 'admin', 'u2', 'reason'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when non-super_admin targets admin', async () => {
      const roleChain = createMockQueryChain({
        data: { role: 'admin' },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(roleChain);

      await expect(
        service.suspendUser('mod-1', 'moduser', 'moderator', 'admin-1', 'reason'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException on update error', async () => {
      const roleChain = createMockQueryChain({
        data: { role: 'user' },
        error: null,
      });
      const updateChain = createMockQueryChain({
        data: null,
        error: { message: 'update failed' },
      });
      mockClient.from
        .mockReturnValueOnce(roleChain)
        .mockReturnValueOnce(updateChain);

      await expect(
        service.suspendUser('admin-1', 'admin', 'admin', 'u2', 'reason'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow super_admin to suspend admin', async () => {
      const roleChain = createMockQueryChain({
        data: { role: 'admin' },
        error: null,
      });
      const updateChain = createMockQueryChain({ data: null, error: null });
      const logChain = createMockQueryChain({ data: null, error: null });
      const notifChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(roleChain)
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(logChain)
        .mockReturnValueOnce(notifChain);

      const result = await service.suspendUser(
        'sa-1',
        'superadmin',
        'super_admin',
        'admin-1',
        'Misconduct',
      );

      expect(result.success).toBe(true);
    });
  });

  // =============================================
  // unsuspendUser
  // =============================================
  describe('unsuspendUser', () => {
    it('should unsuspend a user successfully', async () => {
      const updateChain = createMockQueryChain({ data: null, error: null });
      const logChain = createMockQueryChain({ data: null, error: null });
      const notifChain = createMockQueryChain({ data: null, error: null });
      mockClient.from
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(logChain)
        .mockReturnValueOnce(notifChain);

      const result = await service.unsuspendUser(
        'admin-1',
        'adminuser',
        'u2',
        'Good behavior',
        '127.0.0.1',
      );

      expect(result.success).toBe(true);
      expect(result.data.account_status).toBe('active');
      expect(result.data.id).toBe('u2');
    });

    it('should throw BadRequestException on self-unsuspend', async () => {
      await expect(
        service.unsuspendUser('admin-1', 'admin', 'admin-1', 'reason'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException on update error', async () => {
      const updateChain = createMockQueryChain({
        data: null,
        error: { message: 'fail' },
      });
      mockClient.from.mockReturnValueOnce(updateChain);

      await expect(
        service.unsuspendUser('admin-1', 'admin', 'u2', 'reason'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =============================================
  // changeRole
  // =============================================
  describe('changeRole', () => {
    it('should change user role successfully', async () => {
      const targetChain = createMockQueryChain({
        data: { role: 'user' },
        error: null,
      });
      const updateChain = createMockQueryChain({ data: null, error: null });
      const logChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(targetChain)
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(logChain);

      const result = await service.changeRole(
        'admin-1',
        'adminuser',
        'super_admin',
        'u2',
        'moderator',
      );

      expect(result.success).toBe(true);
      expect(result.data.role).toBe('moderator');
    });

    it('should throw BadRequestException for invalid role', async () => {
      await expect(
        service.changeRole('admin-1', 'admin', 'super_admin', 'u2', 'invalid'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException when non-super_admin assigns admin role', async () => {
      await expect(
        service.changeRole('admin-1', 'admin', 'admin', 'u2', 'admin'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException on self-role-change', async () => {
      await expect(
        service.changeRole('admin-1', 'admin', 'super_admin', 'admin-1', 'user'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow super_admin to assign admin role', async () => {
      const targetChain = createMockQueryChain({
        data: { role: 'user' },
        error: null,
      });
      const updateChain = createMockQueryChain({ data: null, error: null });
      const logChain = createMockQueryChain({ data: null, error: null });
      mockClient.from
        .mockReturnValueOnce(targetChain)
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(logChain);

      const result = await service.changeRole(
        'sa-1',
        'superadmin',
        'super_admin',
        'u2',
        'admin',
      );

      expect(result.success).toBe(true);
      expect(result.data.role).toBe('admin');
    });

    it('should throw BadRequestException on update error', async () => {
      const targetChain = createMockQueryChain({
        data: { role: 'user' },
        error: null,
      });
      const updateChain = createMockQueryChain({
        data: null,
        error: { message: 'update failed' },
      });
      mockClient.from
        .mockReturnValueOnce(targetChain)
        .mockReturnValueOnce(updateChain);

      await expect(
        service.changeRole('admin-1', 'admin', 'super_admin', 'u2', 'moderator'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle null target role as user', async () => {
      const targetChain = createMockQueryChain({
        data: { role: null },
        error: null,
      });
      const updateChain = createMockQueryChain({ data: null, error: null });
      const logChain = createMockQueryChain({ data: null, error: null });
      mockClient.from
        .mockReturnValueOnce(targetChain)
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(logChain);

      const result = await service.changeRole(
        'admin-1',
        'admin',
        'super_admin',
        'u2',
        'moderator',
      );

      expect(result.success).toBe(true);
    });
  });

  // =============================================
  // deleteUser
  // =============================================
  describe('deleteUser', () => {
    it('should soft-delete user as super_admin', async () => {
      const updateChain = createMockQueryChain({ data: null, error: null });
      const logChain = createMockQueryChain({ data: null, error: null });
      mockClient.from
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(logChain);

      const result = await service.deleteUser(
        'sa-1',
        'superadmin',
        'super_admin',
        'u2',
        'Violation',
        '127.0.0.1',
      );

      expect(result).toBeNull();
      expect(mockClient.from).toHaveBeenCalledWith('user_profiles');
    });

    it('should throw ForbiddenException when non-super_admin tries to delete', async () => {
      await expect(
        service.deleteUser('admin-1', 'admin', 'admin', 'u2', 'reason'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException on self-delete', async () => {
      await expect(
        service.deleteUser('sa-1', 'superadmin', 'super_admin', 'sa-1', 'reason'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException on update error', async () => {
      const updateChain = createMockQueryChain({
        data: null,
        error: { message: 'delete failed' },
      });
      mockClient.from.mockReturnValueOnce(updateChain);

      await expect(
        service.deleteUser('sa-1', 'superadmin', 'super_admin', 'u2', 'reason'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =============================================
  // notifyUser
  // =============================================
  describe('notifyUser', () => {
    it('should notify user successfully', async () => {
      const insertChain = createMockQueryChain({ data: null, error: null });
      const logChain = createMockQueryChain({ data: null, error: null });
      mockClient.from
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(logChain);

      const result = await service.notifyUser(
        'admin-1',
        'adminuser',
        'u2',
        'Warning',
        'Please follow rules',
        'admin_warning',
        '127.0.0.1',
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
      expect(mockClient.from).toHaveBeenCalledWith('notifications');
    });

    it('should throw BadRequestException on insert error', async () => {
      const insertChain = createMockQueryChain({
        data: null,
        error: { message: 'insert failed' },
      });
      mockClient.from.mockReturnValueOnce(insertChain);

      await expect(
        service.notifyUser('admin-1', 'admin', 'u2', 'Title', 'Msg', 'type'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =============================================
  // getAdminProfile
  // =============================================
  describe('getAdminProfile', () => {
    it('should return admin profile with mapped fields', async () => {
      const chain = createMockQueryChain({
        data: {
          id: 'admin-1',
          username: 'adminuser',
          email: 'admin@test.com',
          first_name_encrypted: 'John',
          last_name_encrypted: 'Doe',
          avatar: 'avatar.png',
          role: 'admin',
          created_at: '2024-01-01',
          updated_at: '2024-06-01',
        },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getAdminProfile('admin-1');

      expect(result.success).toBe(true);
      expect(result.data.username).toBe('adminuser');
      expect(result.data.first_name).toBe('John');
      expect(result.data.last_name).toBe('Doe');
      expect(result.data.avatar).toBe('avatar.png');
    });

    it('should handle null optional fields', async () => {
      const chain = createMockQueryChain({
        data: {
          id: 'admin-1',
          username: 'adminuser',
          email: 'admin@test.com',
          first_name_encrypted: null,
          last_name_encrypted: null,
          avatar: null,
          role: 'admin',
          created_at: '2024-01-01',
          updated_at: '2024-06-01',
        },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getAdminProfile('admin-1');

      expect(result.data.first_name).toBeNull();
      expect(result.data.last_name).toBeNull();
      expect(result.data.avatar).toBeNull();
    });

    it('should throw NotFoundException when admin not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'not found' },
      });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.getAdminProfile('bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =============================================
  // updateAdminProfile
  // =============================================
  describe('updateAdminProfile', () => {
    it('should update profile without username change', async () => {
      const updateChain = createMockQueryChain({
        data: {
          id: 'admin-1',
          username: 'adminuser',
          email: 'admin@test.com',
          first_name_encrypted: 'Jane',
          last_name_encrypted: 'Smith',
          avatar: null,
          role: 'admin',
        },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(updateChain);

      const result = await service.updateAdminProfile('admin-1', {
        first_name: 'Jane',
        last_name: 'Smith',
      });

      expect(result.success).toBe(true);
      expect(result.data.first_name).toBe('Jane');
      expect(result.data.last_name).toBe('Smith');
    });

    it('should check username uniqueness and update when available', async () => {
      const uniqueChain = createMockQueryChain({ data: null, error: null });
      const updateChain = createMockQueryChain({
        data: {
          id: 'admin-1',
          username: 'newname',
          email: 'admin@test.com',
          first_name_encrypted: null,
          last_name_encrypted: null,
          avatar: null,
          role: 'admin',
        },
        error: null,
      });
      mockClient.from
        .mockReturnValueOnce(uniqueChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.updateAdminProfile('admin-1', {
        username: 'newname',
      });

      expect(result.success).toBe(true);
      expect(result.data.username).toBe('newname');
    });

    it('should throw BadRequestException when username is taken', async () => {
      const uniqueChain = createMockQueryChain({
        data: { id: 'other-user' },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(uniqueChain);

      await expect(
        service.updateAdminProfile('admin-1', { username: 'taken' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException on update error', async () => {
      const updateChain = createMockQueryChain({
        data: null,
        error: { message: 'update failed' },
      });
      mockClient.from.mockReturnValueOnce(updateChain);

      await expect(
        service.updateAdminProfile('admin-1', { first_name: 'New' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =============================================
  // exportUsers
  // =============================================
  describe('exportUsers', () => {
    const mockExportUser = {
      id: 'u1',
      username: 'user1',
      email: 'user1@test.com',
      role: 'user',
      is_suspended: false,
      is_deactivated: false,
      is_deleted: false,
      job_title: 'Dev',
      created_at: '2024-01-01',
      last_active_at: '2024-06-01',
      total_posts: 5,
      total_comments: 10,
    };

    it('should generate CSV export with correct headers and data', async () => {
      const usersChain = createMockQueryChain({
        data: [mockExportUser],
        error: null,
      });
      const reportsChain = createMockQueryChain({ data: [], error: null });
      mockClient.from
        .mockReturnValueOnce(usersChain)
        .mockReturnValueOnce(reportsChain);

      const result = await service.exportUsers({ format: 'csv' });

      expect(result.success).toBe(true);
      expect(result.metadata.format).toBe('csv');
      expect(result.metadata.count).toBe(1);
      expect(result.data).toBeInstanceOf(Buffer);

      const csv = result.data.toString();
      expect(csv).toContain('ID,Username,Email,Role,Status');
      expect(csv).toContain('user1');
    });

    it('should throw BadRequestException when no users to export', async () => {
      const usersChain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValueOnce(usersChain);

      await expect(
        service.exportUsers({ format: 'csv' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException on DB error during export', async () => {
      const usersChain = createMockQueryChain({
        data: null,
        error: { message: 'DB error' },
      });
      mockClient.from.mockReturnValueOnce(usersChain);

      await expect(
        service.exportUsers({ format: 'csv' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should apply search filter in export', async () => {
      const usersChain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValueOnce(usersChain);

      await expect(
        service.exportUsers({ format: 'csv', search: 'test' }),
      ).rejects.toThrow(BadRequestException);

      expect(usersChain.or).toHaveBeenCalledWith(
        'username.ilike.%test%,email.ilike.%test%',
      );
    });

    it('should apply role filter in export', async () => {
      const usersChain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValueOnce(usersChain);

      await expect(
        service.exportUsers({ format: 'csv', role: 'admin' }),
      ).rejects.toThrow(BadRequestException);

      expect(usersChain.eq).toHaveBeenCalledWith('role', 'admin');
    });

    it('should apply suspended status filter in export', async () => {
      const usersChain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValueOnce(usersChain);

      await expect(
        service.exportUsers({ format: 'csv', status: 'suspended' }),
      ).rejects.toThrow(BadRequestException);

      expect(usersChain.eq).toHaveBeenCalledWith('is_suspended', true);
    });

    it('should apply deactivated status filter in export', async () => {
      const usersChain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValueOnce(usersChain);

      await expect(
        service.exportUsers({ format: 'csv', status: 'deactivated' }),
      ).rejects.toThrow(BadRequestException);

      expect(usersChain.eq).toHaveBeenCalledWith('is_deactivated', true);
      expect(usersChain.eq).toHaveBeenCalledWith('is_deleted', false);
    });

    it('should apply deleted status filter in export', async () => {
      const usersChain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValueOnce(usersChain);

      await expect(
        service.exportUsers({ format: 'csv', status: 'deleted' }),
      ).rejects.toThrow(BadRequestException);

      expect(usersChain.eq).toHaveBeenCalledWith('is_deleted', true);
    });

    it('should apply active status filter in export', async () => {
      const usersChain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValueOnce(usersChain);

      await expect(
        service.exportUsers({ format: 'csv', status: 'active' }),
      ).rejects.toThrow(BadRequestException);

      expect(usersChain.eq).toHaveBeenCalledWith('is_suspended', false);
      expect(usersChain.eq).toHaveBeenCalledWith('is_deactivated', false);
      expect(usersChain.eq).toHaveBeenCalledWith('is_deleted', false);
    });

    it('should handle reports fetch error during export gracefully', async () => {
      const usersChain = createMockQueryChain({
        data: [mockExportUser],
        error: null,
      });
      const reportsChain = createMockQueryChain({
        data: null,
        error: { message: 'reports error' },
      });
      mockClient.from
        .mockReturnValueOnce(usersChain)
        .mockReturnValueOnce(reportsChain);

      const result = await service.exportUsers({ format: 'csv' });

      expect(result.success).toBe(true);
      const csv = result.data.toString();
      expect(csv).toContain('"0"'); // reports_against = 0
    });

    it('should include reports count in CSV export', async () => {
      const usersChain = createMockQueryChain({
        data: [mockExportUser],
        error: null,
      });
      const reportsChain = createMockQueryChain({
        data: [
          { reported_user_id: 'u1' },
          { reported_user_id: 'u1' },
          { reported_user_id: 'u1' },
        ],
        error: null,
      });
      mockClient.from
        .mockReturnValueOnce(usersChain)
        .mockReturnValueOnce(reportsChain);

      const result = await service.exportUsers({ format: 'csv' });

      const csv = result.data.toString();
      expect(csv).toContain('"3"'); // 3 reports
    });
  });

  // =============================================
  // logAction
  // =============================================
  describe('logAction', () => {
    it('should insert an admin log entry', async () => {
      const logChain = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValueOnce(logChain);

      await service.logAction(
        'admin-1',
        'adminuser',
        'test_action',
        'user',
        'u2',
        'test reason',
        { key: 'value' },
        '127.0.0.1',
      );

      expect(mockClient.from).toHaveBeenCalledWith('admin_logs');
    });

    it('should not throw when log insert fails', async () => {
      mockClient.from.mockReturnValueOnce({
        insert: jest.fn().mockRejectedValue(new Error('log write failed')),
      });

      await expect(
        service.logAction('admin-1', 'adminuser', 'action', 'user', 'u2'),
      ).resolves.not.toThrow();
    });

    it('should use null defaults for optional params', async () => {
      const logChain = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValueOnce(logChain);

      await service.logAction('admin-1', 'adminuser', 'action', 'user', 'u2');

      expect(logChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: null,
          metadata: {},
          ip_address: null,
        }),
      );
    });
  });
});
