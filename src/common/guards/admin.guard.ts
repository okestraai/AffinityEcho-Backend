import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    const role = user?.role;
    if (role === 'admin' || role === 'super_admin') return true;
    throw new ForbiddenException('Admin access required');
  }
}
