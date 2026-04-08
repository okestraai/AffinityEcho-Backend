jest.mock('../utils/logger.util', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  const JWT_SECRET = 'test-jwt-secret-for-guard';

  const mockConfig = {
    get: jest.fn((key: string) => {
      if (key === 'JWT_SECRET') return JWT_SECRET;
      return undefined;
    }),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new JwtAuthGuard(mockConfig);
  });

  function createMockContext(headers: Record<string, string> = {}) {
    const request = { headers, user: undefined as any };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      request,
    } as any;
  }

  // Generate a real JWT for testing
  function generateTestToken(
    payload: any = { sub: 'user-123', email: 'test@example.com' },
  ) {
    const jwtService = new JwtService({ secret: JWT_SECRET });
    return jwtService.sign(payload);
  }

  it('should throw UnauthorizedException when no authorization header', async () => {
    const context = createMockContext({});
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should throw UnauthorizedException when token type is not Bearer', async () => {
    const context = createMockContext({ authorization: 'Basic some-token' });
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should throw UnauthorizedException when token is empty', async () => {
    const context = createMockContext({ authorization: 'Bearer ' });
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should throw UnauthorizedException for invalid token', async () => {
    const context = createMockContext({
      authorization: 'Bearer invalid-token',
    });
    await expect(guard.canActivate(context)).rejects.toThrow('Invalid token');
  });

  it('should throw UnauthorizedException for expired token', async () => {
    const jwtService = new JwtService({ secret: JWT_SECRET });
    const expiredToken = jwtService.sign(
      { sub: 'user-123' },
      { expiresIn: '0s' },
    );

    // Small delay to ensure expiration
    await new Promise((r) => setTimeout(r, 50));

    const context = createMockContext({
      authorization: `Bearer ${expiredToken}`,
    });
    await expect(guard.canActivate(context)).rejects.toThrow(
      'Token has expired',
    );
  });

  it('should set request.user and return true for valid token', async () => {
    const token = generateTestToken({
      sub: 'user-123',
      email: 'test@example.com',
    });
    const context = createMockContext({ authorization: `Bearer ${token}` });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(context.request.user.sub).toBe('user-123');
    expect(context.request.user.email).toBe('test@example.com');
  });

  it('should throw UnauthorizedException when token has no sub claim', async () => {
    const token = generateTestToken({ email: 'test@example.com' }); // no sub
    const context = createMockContext({ authorization: `Bearer ${token}` });
    await expect(guard.canActivate(context)).rejects.toThrow(
      'Invalid token payload',
    );
  });
});
