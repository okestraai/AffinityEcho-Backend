import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import { AdminUsersService } from './admin-users.service';
import { VALID_PERMISSIONS } from '../../../common/guards/permission.guard';

@Injectable()
export class AdminPermissionsService {
  private admin;

  constructor(
    private config: ConfigService,
    private adminUsers: AdminUsersService,
  ) {
    this.admin = supabaseAdmin(config);
  }

  async getAdminPermissions(adminId: string) {
    // Verify target user exists and is an admin
    const { data: user } = await this.admin
      .from('user_profiles')
      .select('id, username, role')
      .eq('id', adminId)
      .maybeSingle();

    if (!user) throw new NotFoundException('User not found');
    if (!['admin', 'moderator'].includes(user.role)) {
      throw new NotFoundException('User is not an admin');
    }

    const { data: perms } = await this.admin
      .from('admin_permissions')
      .select('admin_id, permissions, granted_by, updated_at')
      .eq('admin_id', adminId)
      .maybeSingle();

    return {
      success: true,
      data: {
        admin_id: adminId,
        username: user.username,
        role: user.role,
        permissions: perms?.permissions ?? [],
        granted_by: perms?.granted_by ?? null,
        updated_at: perms?.updated_at ?? null,
      },
    };
  }

  async updateAdminPermissions(
    superAdminId: string,
    superAdminUsername: string,
    adminId: string,
    permissions: string[],
    ip?: string,
  ) {
    // Cannot modify self
    if (superAdminId === adminId) {
      throw new ForbiddenException('Cannot modify your own permissions');
    }

    // Verify target user exists and is an admin (not super_admin)
    const { data: user } = await this.admin
      .from('user_profiles')
      .select('id, username, role')
      .eq('id', adminId)
      .maybeSingle();

    if (!user) throw new NotFoundException('User not found');
    if (user.role === 'super_admin') {
      throw new ForbiddenException('Cannot modify super_admin permissions');
    }
    if (!['admin', 'moderator'].includes(user.role)) {
      throw new BadRequestException('Target user is not an admin or moderator');
    }

    // Validate all permission keys
    const invalid = permissions.filter(
      (p) => !(VALID_PERMISSIONS as readonly string[]).includes(p),
    );
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Invalid permission key(s): ${invalid.join(', ')}`,
      );
    }

    const now = new Date().toISOString();

    // Compute diff for audit log
    const { data: existing } = await this.admin
      .from('admin_permissions')
      .select('permissions')
      .eq('admin_id', adminId)
      .maybeSingle();

    const previousPerms: string[] = existing?.permissions ?? [];
    const granted = permissions.filter((p) => !previousPerms.includes(p));
    const revoked = previousPerms.filter((p) => !permissions.includes(p));

    // Upsert (replace entire set)
    const { data, error } = await this.admin
      .from('admin_permissions')
      .upsert(
        {
          admin_id: adminId,
          permissions,
          granted_by: superAdminId,
          updated_at: now,
        },
        { onConflict: 'admin_id' },
      )
      .select('admin_id, permissions, granted_by, updated_at')
      .single();

    if (error) throw new BadRequestException(error.message);

    // Audit log
    await this.adminUsers.logAction(
      superAdminId,
      superAdminUsername,
      'update_admin_permissions',
      'admin',
      adminId,
      undefined,
      { permissions_granted: granted, permissions_revoked: revoked },
      ip,
    );

    return { success: true, data };
  }
}
