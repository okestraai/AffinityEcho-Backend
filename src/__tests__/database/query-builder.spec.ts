import { QueryChain, SupabaseAdapter } from '../../database/query-builder';

// Create a mock Pool that captures SQL queries
function createMockPool(returnRows: any[] = [], rowCount = 0) {
  const queries: { sql: string; params?: any[] }[] = [];
  const pool = {
    query: jest.fn().mockImplementation((sql: string, params?: any[]) => {
      queries.push({ sql, params });
      return Promise.resolve({ rows: returnRows, rowCount });
    }),
  };
  return { pool, queries };
}

describe('QueryChain', () => {
  describe('SELECT', () => {
    it('should build simple select *', async () => {
      const { pool } = createMockPool([{ id: '1', name: 'test' }]);
      const chain = new QueryChain(pool as any, 'users');
      const result = await chain.select('*');
      expect(result.data).toEqual([{ id: '1', name: 'test' }]);
      expect(result.error).toBeNull();
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('SELECT "users".* FROM "users"'));
    });

    it('should build select with specific columns', async () => {
      const { pool } = createMockPool([{ id: '1' }]);
      const chain = new QueryChain(pool as any, 'users');
      await chain.select('id, username');
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('"users"."id"'));
    });

    it('should apply eq filter', async () => {
      const { pool } = createMockPool([{ id: '1' }]);
      const chain = new QueryChain(pool as any, 'users');
      await chain.select('*').eq('id', 'abc');
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("\"id\" = 'abc'"));
    });

    it('should apply neq filter', async () => {
      const { pool } = createMockPool([]);
      const chain = new QueryChain(pool as any, 'users');
      await chain.select('*').neq('status', 'deleted');
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("\"status\" != 'deleted'"));
    });

    it('should apply gt/gte/lt/lte filters', async () => {
      const { pool } = createMockPool([]);
      await new QueryChain(pool as any, 't').select('*').gt('age', 18);
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('"age" > 18'));

      pool.query.mockClear();
      await new QueryChain(pool as any, 't').select('*').gte('age', 18);
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('"age" >= 18'));

      pool.query.mockClear();
      await new QueryChain(pool as any, 't').select('*').lt('age', 65);
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('"age" < 65'));

      pool.query.mockClear();
      await new QueryChain(pool as any, 't').select('*').lte('age', 65);
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('"age" <= 65'));
    });

    it('should apply like/ilike filters', async () => {
      const { pool } = createMockPool([]);
      await new QueryChain(pool as any, 't').select('*').like('name', '%test%');
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("LIKE '%test%'"));

      pool.query.mockClear();
      await new QueryChain(pool as any, 't').select('*').ilike('name', '%test%');
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("ILIKE '%test%'"));
    });

    it('should apply is null filter', async () => {
      const { pool } = createMockPool([]);
      await new QueryChain(pool as any, 't').select('*').is('deleted_at', null);
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('"deleted_at" IS NULL'));
    });

    it('should apply in filter', async () => {
      const { pool } = createMockPool([]);
      await new QueryChain(pool as any, 't').select('*').in('id', ['a', 'b', 'c']);
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("\"id\" IN ("));
    });

    it('should apply not filter', async () => {
      const { pool } = createMockPool([]);
      await new QueryChain(pool as any, 't').select('*').not('id', 'eq', 'abc');
      const sql = pool.query.mock.calls[0][0];
      // not filter may produce != or NOT() depending on implementation
      expect(sql).toContain('"id"');
      expect(sql).toContain("'abc'");
    });

    it('should apply or filter', async () => {
      const { pool } = createMockPool([]);
      await new QueryChain(pool as any, 't').select('*').or("name.eq.test,age.gt.18");
      const sql = pool.query.mock.calls[0][0];
      expect(sql).toContain('WHERE');
    });

    it('should apply order', async () => {
      const { pool } = createMockPool([]);
      await new QueryChain(pool as any, 't').select('*').order('created_at', { ascending: false });
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('"created_at" DESC'));
    });

    it('should apply limit', async () => {
      const { pool } = createMockPool([]);
      await new QueryChain(pool as any, 't').select('*').limit(10);
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('LIMIT 10'));
    });

    it('should apply range (offset + limit)', async () => {
      const { pool } = createMockPool([]);
      await new QueryChain(pool as any, 't').select('*').range(10, 19);
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('LIMIT 10'));
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('OFFSET 10'));
    });

    it('should return single row with .single()', async () => {
      const { pool } = createMockPool([{ id: '1', name: 'test' }]);
      const result = await new QueryChain(pool as any, 't').select('*').single();
      expect(result.data).toEqual({ id: '1', name: 'test' });
    });

    it('should return error on single() with no rows', async () => {
      const { pool } = createMockPool([]);
      const result = await new QueryChain(pool as any, 't').select('*').single();
      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('PGRST116');
    });

    it('should return null on maybeSingle() with no rows', async () => {
      const { pool } = createMockPool([]);
      const result = await new QueryChain(pool as any, 't').select('*').maybeSingle();
      expect(result.data).toBeNull();
      expect(result.error).toBeNull();
    });

    it('should return count with exact option', async () => {
      const { pool } = createMockPool([]);
      pool.query.mockImplementation((sql: string) => {
        if (sql.includes('count(*)')) return Promise.resolve({ rows: [{ cnt: 42 }] });
        return Promise.resolve({ rows: [{ id: '1' }] });
      });
      const result = await new QueryChain(pool as any, 't').select('*', { count: 'exact' });
      expect(result.count).toBe(42);
    });

    it('should return only count with head option', async () => {
      const { pool } = createMockPool([]);
      pool.query.mockImplementation(() => Promise.resolve({ rows: [{ cnt: 5 }] }));
      const result = await new QueryChain(pool as any, 't').select('id', { count: 'exact', head: true });
      expect(result.count).toBe(5);
      expect(result.data).toBeNull();
    });

    it('should handle multiple eq filters', async () => {
      const { pool } = createMockPool([]);
      await new QueryChain(pool as any, 't').select('*').eq('a', 1).eq('b', 2);
      const sql = pool.query.mock.calls[0][0];
      expect(sql).toContain('"a" = 1');
      expect(sql).toContain('"b" = 2');
      expect(sql).toContain('AND');
    });
  });

  describe('INSERT', () => {
    it('should build insert with returning', async () => {
      const { pool } = createMockPool([{ id: '1', name: 'test' }]);
      const result = await new QueryChain(pool as any, 'users').insert({ name: 'test', age: 25 }).select('*').single();
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO "users"'));
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("'test'"));
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('RETURNING'));
      expect(result.data).toEqual({ id: '1', name: 'test' });
    });

    it('should handle null values', async () => {
      const { pool } = createMockPool([{ id: '1' }]);
      await new QueryChain(pool as any, 'users').insert({ name: null }).select('*').single();
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('NULL'));
    });

    it('should handle boolean values', async () => {
      const { pool } = createMockPool([{ id: '1' }]);
      await new QueryChain(pool as any, 'users').insert({ active: true }).select('*').single();
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('TRUE'));
    });

    it('should handle array values', async () => {
      const { pool } = createMockPool([{ id: '1' }]);
      await new QueryChain(pool as any, 'users').insert({ tags: ['a', 'b'] }).select('*').single();
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('ARRAY['));
    });

    it('should handle empty array', async () => {
      const { pool } = createMockPool([{ id: '1' }]);
      await new QueryChain(pool as any, 'users').insert({ tags: [] }).select('*').single();
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("'{}'::text[]"));
    });

    it('should handle object values as jsonb', async () => {
      const { pool } = createMockPool([{ id: '1' }]);
      await new QueryChain(pool as any, 'users').insert({ metadata: { key: 'val' } }).select('*').single();
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('::jsonb'));
    });
  });

  describe('UPDATE', () => {
    it('should build update with where clause', async () => {
      const { pool } = createMockPool([{ id: '1', name: 'updated' }]);
      const result = await new QueryChain(pool as any, 'users').update({ name: 'updated' }).eq('id', '1').select('*').single();
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE "users" SET'));
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("\"name\" = 'updated'"));
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("\"id\" = '1'"));
      expect(result.data).toEqual({ id: '1', name: 'updated' });
    });

    it('should handle empty update data', async () => {
      const { pool } = createMockPool([]);
      const result = await new QueryChain(pool as any, 'users').update({});
      expect(result.data).toBeNull();
      expect(pool.query).not.toHaveBeenCalled();
    });
  });

  describe('DELETE', () => {
    it('should build delete with where clause', async () => {
      const { pool } = createMockPool([], 1);
      await new QueryChain(pool as any, 'users').delete().eq('id', '1');
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM "users"'));
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("\"id\" = '1'"));
    });
  });

  describe('UPSERT', () => {
    it('should build upsert with on conflict', async () => {
      const { pool } = createMockPool([{ id: '1' }]);
      await new QueryChain(pool as any, 'users').upsert({ id: '1', name: 'test' }, { onConflict: 'id' });
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT'));
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('DO UPDATE SET'));
    });

    it('should build upsert with ignore duplicates', async () => {
      const { pool } = createMockPool([]);
      await new QueryChain(pool as any, 'users').upsert({ id: '1' }, { onConflict: 'id', ignoreDuplicates: true });
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('DO NOTHING'));
    });

    it('should handle multi-column conflict', async () => {
      const { pool } = createMockPool([]);
      await new QueryChain(pool as any, 't').upsert({ a: 1, b: 2, c: 3 }, { onConflict: 'a,b' });
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('"a", "b"'));
    });
  });

  describe('Error handling', () => {
    it('should catch pool.query errors and return error object', async () => {
      const pool = { query: jest.fn().mockRejectedValue(new Error('Connection refused')) };
      const result = await new QueryChain(pool as any, 'users').select('*');
      expect(result.data).toBeNull();
      expect(result.error.message).toBe('Connection refused');
    });
  });

  describe('SQL injection prevention', () => {
    it('should escape single quotes in string values', async () => {
      const { pool } = createMockPool([]);
      await new QueryChain(pool as any, 't').select('*').eq('name', "O'Brien");
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("O''Brien"));
    });

    it('should escape double quotes in identifiers', async () => {
      const { pool } = createMockPool([{ id: '1' }]);
      await new QueryChain(pool as any, 'my"table').select('*');
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('"my""table"'));
    });
  });
});

  describe('contains filter', () => {
    it('should build contains query', async () => {
      const { pool } = createMockPool([]);
      await new QueryChain(pool as any, 't').select('*').contains('tags', ['a', 'b']);
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('@>'));
    });
  });

  describe('overlaps filter', () => {
    it('should build overlaps query', async () => {
      const { pool } = createMockPool([]);
      await new QueryChain(pool as any, 't').select('*').overlaps('tags', ['a']);
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('&&'));
    });
  });

  describe('textSearch filter', () => {
    it('should build text search query', async () => {
      const { pool } = createMockPool([]);
      await new QueryChain(pool as any, 't').select('*').textSearch('content', 'hello world');
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('to_tsvector'));
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('plainto_tsquery'));
    });
  });

  describe('is filter with boolean', () => {
    it('should build IS TRUE', async () => {
      const { pool } = createMockPool([]);
      await new QueryChain(pool as any, 't').select('*').is('active', true);
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('IS TRUE'));
    });

    it('should build IS FALSE', async () => {
      const { pool } = createMockPool([]);
      await new QueryChain(pool as any, 't').select('*').is('active', false);
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('IS FALSE'));
    });
  });

  describe('eq with null', () => {
    it('should build IS NULL for eq(col, null)', async () => {
      const { pool } = createMockPool([]);
      await new QueryChain(pool as any, 't').select('*').eq('deleted_at', null);
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('IS NULL'));
    });
  });

  describe('neq with null', () => {
    it('should build IS NOT NULL for neq(col, null)', async () => {
      const { pool } = createMockPool([]);
      await new QueryChain(pool as any, 't').select('*').neq('deleted_at', null);
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('IS NOT NULL'));
    });
  });

  describe('not filter variants', () => {
    it('should handle not(col, is, null) as IS NOT NULL', async () => {
      const { pool } = createMockPool([]);
      await new QueryChain(pool as any, 't').select('*').not('col', 'is', null);
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('IS NOT NULL'));
    });

    it('should handle not(col, in, [values])', async () => {
      const { pool } = createMockPool([]);
      await new QueryChain(pool as any, 't').select('*').not('col', 'in', ['a', 'b']);
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('NOT IN'));
    });
  });

  describe('empty in filter', () => {
    it('should use FALSE for empty IN array', async () => {
      const { pool } = createMockPool([]);
      await new QueryChain(pool as any, 't').select('*').in('id', []);
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('FALSE'));
    });
  });

  describe('insert with multiple rows', () => {
    it('should insert multiple rows', async () => {
      const { pool } = createMockPool([{ id: '1' }, { id: '2' }]);
      const result = await new QueryChain(pool as any, 't').insert([{ name: 'a' }, { name: 'b' }]);
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('VALUES'));
      expect(result.data).toHaveLength(2);
    });
  });

  describe('delete with returning', () => {
    it('should delete with returning columns', async () => {
      const { pool } = createMockPool([{ id: '1' }]);
      await new QueryChain(pool as any, 't').delete().select('id').eq('id', '1');
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('DELETE'));
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('RETURNING'));
    });
  });

  describe('dot-notation column (relationship filter)', () => {
    it('should skip dot-notation filters in WHERE', async () => {
      const { pool } = createMockPool([{ id: '1' }]);
      await new QueryChain(pool as any, 't').select('*').eq('user_profile.has_completed_onboarding', true);
      // Should not crash — dot filters are skipped
      expect(pool.query).toHaveBeenCalled();
    });
  });

  describe('or with nested and()', () => {
    it('should parse nested and() in or()', async () => {
      const { pool } = createMockPool([]);
      await new QueryChain(pool as any, 't').select('*').or('and(a.eq.1,b.eq.2),c.eq.3');
      const sql = pool.query.mock.calls[0][0];
      expect(sql).toContain('AND');
      expect(sql).toContain('OR');
    });
  });

  describe('select with relationship syntax', () => {
    it('should parse relationship select and do join query', async () => {
      const { pool } = createMockPool([{ id: '1', user_id: 'u1' }]);
      // Second query for the relationship
      pool.query.mockImplementation((sql: string) => {
        if (sql.includes('user_profiles')) return Promise.resolve({ rows: [{ id: 'u1', username: 'Test' }] });
        return Promise.resolve({ rows: [{ id: '1', user_id: 'u1' }] });
      });
      const result = await new QueryChain(pool as any, 'feed_posts').select('id, user_profile:user_id(id, username)');
      expect(pool.query).toHaveBeenCalledTimes(2);
      expect(result.data[0].user_profile).toBeDefined();
    });
  });

  describe('multiple order clauses', () => {
    it('should support multiple orders', async () => {
      const { pool } = createMockPool([]);
      await new QueryChain(pool as any, 't').select('*').order('created_at', { ascending: false }).order('id', { ascending: true });
      const sql = pool.query.mock.calls[0][0];
      expect(sql).toContain('"created_at" DESC');
      expect(sql).toContain('"id" ASC');
    });
  });
});

describe('SupabaseAdapter', () => {
  it('should return a QueryChain from .from()', () => {
    const pool = { query: jest.fn() };
    const adapter = new SupabaseAdapter(pool as any);
    const chain = adapter.from('users');
    expect(chain).toBeInstanceOf(QueryChain);
  });

  it('should expose auth stub', () => {
    const pool = { query: jest.fn() };
    const adapter = new SupabaseAdapter(pool as any);
    expect(adapter.auth).toBeDefined();
    expect(adapter.auth.getUser).toBeDefined();
  });
});
