import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { MSG } from '../constants/messages';

@Injectable()
export class ModeratorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    const role = user?.role;
    if (role === 'moderator' || role === 'admin' || role === 'super_admin')
      return true;
    throw new ForbiddenException(MSG.ADMIN.MODERATOR_REQUIRED);
  }
}
