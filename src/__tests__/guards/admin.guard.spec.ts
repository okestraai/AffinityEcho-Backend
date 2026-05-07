import { AdminGuard } from '../../common/guards/admin.guard';
import { ForbiddenException } from '@nestjs/common';

function mockContext(user: any) {
  return { switchToHttp: () => ({ getRequest: () => ({ user }) }) } as any;
}

describe('AdminGuard', () => {
  let guard: AdminGuard;

  beforeEach(() => {
    guard = new AdminGuard();
  });

  it('should allow admin', () => {
    expect(guard.canActivate(mockContext({ sub: 'u1', role: 'admin' }))).toBe(
      true,
    );
  });

  it('should allow super_admin', () => {
    expect(
      guard.canActivate(mockContext({ sub: 'u1', role: 'super_admin' })),
    ).toBe(true);
  });

  it('should reject regular user', () => {
    expect(() =>
      guard.canActivate(mockContext({ sub: 'u1', role: 'user' })),
    ).toThrow(ForbiddenException);
  });

  it('should reject moderator', () => {
    expect(() =>
      guard.canActivate(mockContext({ sub: 'u1', role: 'moderator' })),
    ).toThrow(ForbiddenException);
  });

  it('should reject when no user', () => {
    expect(() => guard.canActivate(mockContext({}))).toThrow(
      ForbiddenException,
    );
  });

  it('should reject when no role', () => {
    expect(() => guard.canActivate(mockContext({ sub: 'u1' }))).toThrow(
      ForbiddenException,
    );
  });
});
