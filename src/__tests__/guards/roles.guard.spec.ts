import { RolesGuard } from '../../common/guards/roles.guard';

function mockContext(user: any) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: any;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new RolesGuard(reflector);
  });

  it('should allow when no roles required', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(mockContext({ role: 'user' }))).toBe(true);
  });

  it('should allow when user has required role', () => {
    reflector.getAllAndOverride.mockReturnValue(['admin']);
    expect(guard.canActivate(mockContext({ role: 'admin' }))).toBe(true);
  });

  it('should reject when user lacks role', () => {
    reflector.getAllAndOverride.mockReturnValue(['admin']);
    expect(guard.canActivate(mockContext({ role: 'user' }))).toBe(false);
  });

  it('should allow any of multiple required roles', () => {
    reflector.getAllAndOverride.mockReturnValue(['admin', 'moderator']);
    expect(guard.canActivate(mockContext({ role: 'moderator' }))).toBe(true);
  });

  it('should reject when no user', () => {
    reflector.getAllAndOverride.mockReturnValue(['admin']);
    expect(guard.canActivate(mockContext(undefined))).toBe(false);
  });
});
