import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { ForbiddenException } from '@nestjs/common';

function mockContext(user: any) {
  return { switchToHttp: () => ({ getRequest: () => ({ user }) }) } as any;
}

describe('SuperAdminGuard', () => {
  let guard: SuperAdminGuard;

  beforeEach(() => {
    guard = new SuperAdminGuard();
  });

  it('should allow super_admin', () => {
    expect(
      guard.canActivate(mockContext({ sub: 'u1', role: 'super_admin' })),
    ).toBe(true);
  });

  it('should reject admin', () => {
    expect(() =>
      guard.canActivate(mockContext({ sub: 'u1', role: 'admin' })),
    ).toThrow(ForbiddenException);
  });

  it('should reject moderator', () => {
    expect(() =>
      guard.canActivate(mockContext({ sub: 'u1', role: 'moderator' })),
    ).toThrow(ForbiddenException);
  });

  it('should reject regular user', () => {
    expect(() =>
      guard.canActivate(mockContext({ sub: 'u1', role: 'user' })),
    ).toThrow(ForbiddenException);
  });

  it('should reject when no user', () => {
    expect(() => guard.canActivate(mockContext({}))).toThrow(
      ForbiddenException,
    );
  });
});
