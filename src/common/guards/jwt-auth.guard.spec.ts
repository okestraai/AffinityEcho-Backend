jest.mock('../../database/supabase.client', () => ({
  supabaseClient: jest.fn(),
}));

jest.mock('../utils/logger.util', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { supabaseClient } from '../../database/supabase.client';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let mockSupabase: any;

  const mockConfig = { get: jest.fn() } as any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSupabase = {
      auth: {
        getUser: jest.fn(),
      },
    };

    (supabaseClient as jest.Mock).mockReturnValue(mockSupabase);
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

  it('should throw UnauthorizedException when Supabase returns error', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid token', status: 401 },
    });

    const context = createMockContext({
      authorization: 'Bearer valid-looking-token',
    });
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should throw UnauthorizedException when user is null', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const context = createMockContext({
      authorization: 'Bearer valid-looking-token',
    });
    await expect(guard.canActivate(context)).rejects.toThrow(
      'User not found',
    );
  });

  it('should set request.user and return true for valid token', async () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      user_metadata: { username: 'testuser' },
    };

    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    });

    const context = createMockContext({
      authorization: 'Bearer valid-token',
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(context.request.user).toEqual({
      sub: 'user-123',
      email: 'test@example.com',
      user_metadata: { username: 'testuser' },
    });
  });

  it('should throw generic UnauthorizedException on unexpected errors', async () => {
    mockSupabase.auth.getUser.mockRejectedValue(new Error('Network error'));

    const context = createMockContext({
      authorization: 'Bearer some-token',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      'Authentication failed',
    );
  });
});
