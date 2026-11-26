// src/auth/guards/jwt-auth.guard.ts
import {
  Injectable,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Community areas a member reaches only after onboarding. Events, account, notifications and
// sign-in stay open, so someone who joined through an event can use them straight away.
export const ONBOARDED_ONLY = [
  'affinity-groups',
  'coaching',
  'content',
  'conversations',
  'feeds',
  'forum',
  'identity-reveal',
  'mentorship',
  'mentorship-chat',
  'mentorship-profiles',
  'messaging',
  'nooks',
  'okestra',
  'referrals',
  'user-discovery',
  'users',
];

const STAFF = ['moderator', 'admin', 'super_admin'];

export function needsOnboarding(path: string): boolean {
  const first = path
    .split('?')[0]
    .replace(/^\/+/, '')
    .replace(/^api\/v\d+\//, '')
    .split('/')[0];
  return ONBOARDED_ONLY.includes(first);
}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, _info: any, context?: ExecutionContext) {
    if (err || !user) {
      throw new UnauthorizedException('Invalid token');
    }

    if (context && !user.hasCompletedOnboarding && !STAFF.includes(user.role)) {
      const req = context.switchToHttp().getRequest();
      if (needsOnboarding(req?.originalUrl ?? req?.url ?? '')) {
        throw new ForbiddenException({
          message: 'Finish setting up your profile to use this part of Affinity Echo',
          code: 'ONBOARDING_REQUIRED',
        });
      }
    }

    return user;
  }
}
