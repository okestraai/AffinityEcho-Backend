import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { MSG } from '../constants/messages';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (user?.role === 'super_admin') return true;
    throw new ForbiddenException(MSG.ADMIN.SUPER_ADMIN_REQUIRED);
  }
}
