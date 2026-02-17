/**
 * Supabase mock helpers for unit tests.
 *
 * Usage:
 *   const { client, defaultChain } = createMockSupabaseClient();
 *   (supabaseAdmin as jest.Mock).mockReturnValue(client);
 *
 *   // Configure per-query results:
 *   const chain = createMockQueryChain({ data: { id: '1' }, error: null });
 *   client.from.mockReturnValueOnce(chain);
 */

/**
 * Creates a mock Supabase query chain.
 * - Chain methods (from, select, eq, etc.) return the chain for fluent API.
 * - When awaited (without .single()), resolves to the provided result.
 * - .single() and .maybeSingle() also resolve to the provided result.
 */
export function createMockQueryChain(
  result: any = { data: null, error: null },
) {
  const chain: any = {};

  // Make it thenable so `await chain` works (for queries without .single())
  chain.then = (resolve: (value: any) => any, reject?: (reason: any) => any) => {
    return Promise.resolve(result).then(resolve, reject);
  };

  // Catch support for thenable
  chain.catch = (reject: (reason: any) => any) => {
    return Promise.resolve(result).catch(reject);
  };

  // All chainable methods return the chain itself
  const chainMethods = [
    'from',
    'select',
    'insert',
    'update',
    'delete',
    'upsert',
    'eq',
    'neq',
    'in',
    'not',
    'is',
    'gte',
    'lte',
    'gt',
    'lt',
    'or',
    'and',
    'like',
    'ilike',
    'order',
    'range',
    'limit',
    'single',
    'maybeSingle',
  ];

  chainMethods.forEach((method) => {
    chain[method] = jest.fn().mockReturnValue(chain);
  });

  return chain;
}

/**
 * Creates a mock Supabase client with auth methods and query builder.
 * Returns { client, defaultChain } where:
 * - client: the mock supabase client
 * - defaultChain: the default query chain (resolves to { data: null, error: null })
 */
export function createMockSupabaseClient() {
  const defaultChain = createMockQueryChain();

  const client: any = {
    from: jest.fn().mockReturnValue(defaultChain),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: null },
        error: null,
      }),
      signUp: jest.fn().mockResolvedValue({ data: {}, error: null }),
      signInWithPassword: jest.fn().mockResolvedValue({
        data: {},
        error: null,
      }),
      signInWithOAuth: jest.fn().mockResolvedValue({ data: {}, error: null }),
      signInWithOtp: jest.fn().mockResolvedValue({ data: {}, error: null }),
      signOut: jest.fn().mockResolvedValue({ error: null }),
      updateUser: jest.fn().mockResolvedValue({ data: {}, error: null }),
      admin: {
        updateUserById: jest.fn().mockResolvedValue({
          data: {},
          error: null,
        }),
        getUserById: jest.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
        listUsers: jest.fn().mockResolvedValue({
          data: { users: [] },
          error: null,
        }),
      },
    },
  };

  return { client, defaultChain };
}

/**
 * Creates a mock ConfigService with sensible defaults.
 */
export function createMockConfigService(
  overrides: Record<string, any> = {},
) {
  const defaults: Record<string, any> = {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'eyJtest-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'eyJtest-service-role-key',
    JWT_SECRET: 'test-jwt-secret',
    JWT_REFRESH_SECRET: 'test-jwt-refresh-secret',
    FRONTEND_URL: 'http://localhost:3000',
    ENCRYPTION_KEY: Buffer.from('a'.repeat(32)).toString('base64'),
  };

  const values = { ...defaults, ...overrides };

  return {
    get: jest.fn((key: string) => values[key]),
  };
}
