import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../database/supabase.client';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { MSG } from '../constants/messages';

// All valid permission keys — must match frontend exactly
export const VALID_PERMISSIONS = [
  'dashboard:view',
  'users:view',
  'users:view_detail',
  'users:suspend',
  'users:delete',
  'users:change_role',
  'users:notify',
  'users:export',
  'reports:view',
  'reports:view_detail',
  'reports:update',
  'reports:assign',
  'reports:export',
  'content:view',
  'content:view_detail',
  'content:hide',
  'content:restore',
  'content:remove',
  'content:export',
  'forums:view',
  'forums:create',
  'forums:update',
  'forums:delete',
  'forums:export',
  'nooks:view',
  'nooks:create',
  'nooks:update',
  'nooks:delete',
  'nooks:remove_member',
  'nooks:export',
  'notifications:view',
  'notifications:create',
  'notifications:send',
  'notifications:delete',
  'notifications:export',
  'logs:view',
  'logs:export',
] as const;

export type AdminPermission = (typeof VALID_PERMISSIONS)[number];

@Injectable()
export class PermissionGuard implements CanActivate {
  private admin;

  constructor(
    private reflector: Reflector,
    private config: ConfigService,
  ) {
    this.admin = supabaseAdmin(config);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.get<string>(
      PERMISSION_KEY,
      context.getHandler(),
    );

    // No @RequirePermission on this route — guard not applicable
    if (!requiredPermission) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) throw new UnauthorizedException();

    // super_admin bypasses all permission checks
    if (user.role === 'super_admin') return true;

    // Must be admin role to access permission-gated endpoints
    if (user.role !== 'admin') {
      throw new ForbiddenException(MSG.ADMIN.ACCESS_REQUIRED);
    }

    // Load the admin's permission row from DB
    const { data } = await this.admin
      .from('admin_permissions')
      .select('permissions')
      .eq('admin_id', user.userId)
      .maybeSingle();

    const permissions: string[] = data?.permissions ?? [];

    if (!permissions.includes(requiredPermission)) {
      throw new ForbiddenException(
        `Forbidden: requires permission '${requiredPermission}'`,
      );
    }

    return true;
  }
}
