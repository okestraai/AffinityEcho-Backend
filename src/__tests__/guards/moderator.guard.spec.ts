import { ModeratorGuard } from '../../common/guards/moderator.guard';
import { ForbiddenException } from '@nestjs/common';

function mockContext(user: any) {
  return { switchToHttp: () => ({ getRequest: () => ({ user }) }) } as any;
}

describe('ModeratorGuard', () => {
  let guard: ModeratorGuard;

  beforeEach(() => {
    guard = new ModeratorGuard();
  });

  it('should allow super_admin', () => {
    expect(guard.canActivate(mockContext({ role: 'super_admin' }))).toBe(true);
  });

  it('should allow admin', () => {
    expect(guard.canActivate(mockContext({ role: 'admin' }))).toBe(true);
  });

  it('should allow moderator', () => {
    expect(guard.canActivate(mockContext({ role: 'moderator' }))).toBe(true);
  });

  it('should reject regular user', () => {
    expect(() => guard.canActivate(mockContext({ role: 'user' }))).toThrow(
      ForbiddenException,
    );
  });

  it('should reject when no role', () => {
    expect(() => guard.canActivate(mockContext({}))).toThrow(
      ForbiddenException,
    );
  });
});
