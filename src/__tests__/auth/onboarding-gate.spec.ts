import { ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard, needsOnboarding } from '../../modules/auth/guards/jwt-auth.guard';

const ctx = (url: string) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ originalUrl: url }) }) }) as any;

describe('events-only access before onboarding', () => {
  const guard = new JwtAuthGuard();
  const newcomer = { userId: 'u1', role: 'user', hasCompletedOnboarding: false };

  it.each(['/api/v1/forum', '/api/v1/feeds?limit=5', '/api/v1/nooks/abc', '/api/v1/mentorship/discover', '/api/v1/messaging/x'])(
    'refuses %s',
    (url) => {
      expect(needsOnboarding(url)).toBe(true);
      expect(() => guard.handleRequest(null, newcomer, null, ctx(url))).toThrow(ForbiddenException);
    },
  );

  it.each(['/api/v1/events/mine', '/api/v1/auth/me', '/api/v1/auth/password/set', '/api/v1/user/profile/edit', '/api/v1/notifications', '/api/v1/companies'])(
    'allows %s',
    (url) => {
      expect(guard.handleRequest(null, newcomer, null, ctx(url))).toBe(newcomer);
    },
  );

  it('lets onboarded members and staff through', () => {
    expect(guard.handleRequest(null, { ...newcomer, hasCompletedOnboarding: true }, null, ctx('/api/v1/forum'))).toBeTruthy();
    expect(guard.handleRequest(null, { ...newcomer, role: 'moderator' }, null, ctx('/api/v1/forum'))).toBeTruthy();
  });

  it('cannot be passed by changing letter case', () => {
    expect(needsOnboarding('/API/v1/FORUM/topics')).toBe(true);
    expect(needsOnboarding('/api/v1/Feeds')).toBe(true);
  });

  it('says why, with a code the apps can act on', () => {
    expect.assertions(1);
    try {
      guard.handleRequest(null, newcomer, null, ctx('/api/v1/forum'));
    } catch (e: any) {
      expect(e.getResponse()).toMatchObject({ code: 'ONBOARDING_REQUIRED' });
    }
  });
});
