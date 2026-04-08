/**
 * Supabase-compatible query builder that runs against raw PostgreSQL via `pg`.
 *
 * Design goal: every service file that currently does
 *   this.admin.from('users').select('*').eq('id', x).single()
 * keeps working without changes.
 *
 * Supported chain methods (matching @supabase/supabase-js):
 *   from, select, insert, update, delete, upsert, rpc
 *   eq, neq, gt, gte, lt, lte, like, ilike, is, in, not, or, contains, overlaps, textSearch
 *   order, limit, range, single, maybeSingle
 *   count option on select
 */

import { Pool } from 'pg';

// ─── helpers ────────────────────────────────────────────────────────────────

function escapeIdentifier(id: string): string {
  return '"' + id.replace(/"/g, '""') + '"';
}

function escapeLiteral(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') return String(val);
  if (Array.isArray(val)) {
    // PostgreSQL array literal
    const items = val.map((v) => escapeLiteral(v));
    return `ARRAY[${items.join(',')}]`;
  }
  if (typeof val === 'object') {
    return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

// ─── Relationship parser ─────────────────────────────────────────────────────
// Parses Supabase-style select with relationships:
//   "id, user:user_id(username, avatar)"
// Into column list + join info.

interface RelationInfo {
  alias: string;
  fkColumn: string;
  targetTable: string;
  columns: string[];
  isArray: boolean;
}

interface ParsedSelect {
  columns: string[]; // plain columns from the main table
  relations: RelationInfo[];
}

function parseSelectString(selectStr: string, tableName: string): ParsedSelect {
  const columns: string[] = [];
  const relations: RelationInfo[] = [];

  if (!selectStr || selectStr === '*') {
    return { columns: ['*'], relations: [] };
  }

  // Tokenise: split on commas that are NOT inside parentheses
  let depth = 0;
  let current = '';
  const tokens: string[] = [];
  for (const ch of selectStr) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      tokens.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) tokens.push(current.trim());

  for (const token of tokens) {
    // Match relation pattern: alias:fk_column(col1, col2, ...)
    const relMatch = token.match(/^(\w+):(\w+)\((.+)\)$/);
    if (relMatch) {
      const [, alias, fkColumn, innerCols] = relMatch;
      // Guess target table from alias (plural heuristic or exact)
      // For Supabase the FK target table is resolved by DB schema;
      // here we use the alias as the table name and add common mappings.
      const tableMap: Record<string, string> = {
        user: 'user_profiles',
        user_profile: 'user_profiles',
        author: 'user_profiles',
        creator: 'user_profiles',
        mentor: 'user_profiles',
        mentee: 'user_profiles',
        forum: 'forums',
        topic: 'forum_topics',
        nook: 'nooks',
        conversation: 'conversations',
        requester: 'user_profiles',
        responder: 'user_profiles',
        sender: 'user_profiles',
        receiver: 'user_profiles',
        follower: 'user_profiles',
        following: 'user_profiles',
        blocker: 'user_profiles',
        blocked: 'user_profiles',
      };
      const targetTable = tableMap[alias] || alias + 's';
      relations.push({
        alias,
        fkColumn,
        targetTable,
        columns: innerCols.split(',').map((c) => c.trim()),
        isArray: false,
      });
    } else {
      columns.push(token.trim());
    }
  }

  return { columns: columns.length ? columns : ['*'], relations };
}

// ─── Query chain ────────────────────────────────────────────────────────────

type FilterOp =
  | { type: 'eq'; col: string; val: any }
  | { type: 'neq'; col: string; val: any }
  | { type: 'gt'; col: string; val: any }
  | { type: 'gte'; col: string; val: any }
  | { type: 'lt'; col: string; val: any }
  | { type: 'lte'; col: string; val: any }
  | { type: 'like'; col: string; val: any }
  | { type: 'ilike'; col: string; val: any }
  | { type: 'is'; col: string; val: any }
  | { type: 'in'; col: string; val: any[] }
  | { type: 'not'; col: string; op: string; val: any }
  | { type: 'or'; expr: string }
  | { type: 'contains'; col: string; val: any }
  | { type: 'overlaps'; col: string; val: any }
  | { type: 'textSearch'; col: string; val: string };

interface OrderSpec {
  column: string;
  ascending: boolean;
}

export class QueryChain {
  private pool: Pool;
  private table: string;
  private mode: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private selectStr = '*';
  private filters: FilterOp[] = [];
  private orders: OrderSpec[] = [];
  private limitVal?: number;
  private offsetVal?: number;
  private isSingle = false;
  private isMaybeSingle = false;
  private countMode: 'exact' | null = null;
  private headOnly = false;
  private insertData: any = null;
  private updateData: any = null;
  private upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  private returningSelect: string | null = null;

  constructor(pool: Pool, table: string) {
    this.pool = pool;
    this.table = table;
  }

  // ─── SELECT ───────────────────────────────────────────────────────────────

  select(columns?: string, opts?: { count?: 'exact'; head?: boolean }): this {
    this.mode = 'select';
    if (columns) this.selectStr = columns;
    if (opts?.count) this.countMode = opts.count;
    if (opts?.head) this.headOnly = true;
    return this;
  }

  // ─── INSERT ───────────────────────────────────────────────────────────────

  insert(data: any | any[]): this {
    this.mode = 'insert';
    this.insertData = Array.isArray(data) ? data : [data];
    return this;
  }

  // ─── UPDATE ───────────────────────────────────────────────────────────────

  update(data: any): this {
    this.mode = 'update';
    this.updateData = data;
    return this;
  }

  // ─── DELETE ───────────────────────────────────────────────────────────────

  delete(): this {
    this.mode = 'delete';
    return this;
  }

  // ─── UPSERT ───────────────────────────────────────────────────────────────

  upsert(
    data: any | any[],
    opts?: { onConflict?: string; ignoreDuplicates?: boolean },
  ): this {
    this.mode = 'upsert';
    this.insertData = Array.isArray(data) ? data : [data];
    if (opts) this.upsertOpts = opts;
    return this;
  }

  // ─── FILTERS ──────────────────────────────────────────────────────────────

  eq(col: string, val: any): this {
    this.filters.push({ type: 'eq', col, val });
    return this;
  }
  neq(col: string, val: any): this {
    this.filters.push({ type: 'neq', col, val });
    return this;
  }
  gt(col: string, val: any): this {
    this.filters.push({ type: 'gt', col, val });
    return this;
  }
  gte(col: string, val: any): this {
    this.filters.push({ type: 'gte', col, val });
    return this;
  }
  lt(col: string, val: any): this {
    this.filters.push({ type: 'lt', col, val });
    return this;
  }
  lte(col: string, val: any): this {
    this.filters.push({ type: 'lte', col, val });
    return this;
  }
  like(col: string, val: any): this {
    this.filters.push({ type: 'like', col, val });
    return this;
  }
  ilike(col: string, val: any): this {
    this.filters.push({ type: 'ilike', col, val });
    return this;
  }

  is(col: string, val: any): this {
    this.filters.push({ type: 'is', col, val });
    return this;
  }

  in(col: string, val: any[]): this {
    this.filters.push({ type: 'in', col, val });
    return this;
  }

  not(col: string, op: string, val: any): this {
    this.filters.push({ type: 'not', col, op, val });
    return this;
  }

  or(expr: string): this {
    this.filters.push({ type: 'or', expr });
    return this;
  }

  contains(col: string, val: any): this {
    this.filters.push({ type: 'contains', col, val });
    return this;
  }

  overlaps(col: string, val: any): this {
    this.filters.push({ type: 'overlaps', col, val });
    return this;
  }

  textSearch(col: string, val: string): this {
    this.filters.push({ type: 'textSearch', col, val });
    return this;
  }

  // ─── MODIFIERS ────────────────────────────────────────────────────────────

  order(
    col: string,
    opts?: { ascending?: boolean; nullsFirst?: boolean },
  ): this {
    this.orders.push({ column: col, ascending: opts?.ascending ?? true });
    return this;
  }

  limit(n: number): this {
    this.limitVal = n;
    return this;
  }

  range(from: number, to: number): this {
    this.offsetVal = from;
    this.limitVal = to - from + 1;
    return this;
  }

  single(): this {
    this.isSingle = true;
    return this;
  }

  maybeSingle(): this {
    this.isMaybeSingle = true;
    return this;
  }

  // ─── EXECUTE (thenable) ───────────────────────────────────────────────────

  /** Makes the chain thenable so `await this.admin.from(...).select(...)` works. */
  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<{ data: any; error: any; count?: number }> {
    try {
      switch (this.mode) {
        case 'select':
          return await this.execSelect();
        case 'insert':
          return await this.execInsert();
        case 'update':
          return await this.execUpdate();
        case 'delete':
          return await this.execDelete();
        case 'upsert':
          return await this.execUpsert();
        default:
          return {
            data: null,
            error: { message: `Unknown mode: ${this.mode}` },
          };
      }
    } catch (err: any) {
      return {
        data: null,
        error: {
          message: err.message,
          code: err.code,
          details: err.detail,
          hint: err.hint,
        },
      };
    }
  }

  // ─── SELECT execution ─────────────────────────────────────────────────────

  private async execSelect(): Promise<{
    data: any;
    error: any;
    count?: number;
  }> {
    const parsed = parseSelectString(this.selectStr, this.table);
    const where = this.buildWhere();

    // Build column list for main query
    const colList = parsed.columns
      .map((c) =>
        c === '*'
          ? `${escapeIdentifier(this.table)}.*`
          : `${escapeIdentifier(this.table)}.${escapeIdentifier(c)}`,
      )
      .join(', ');

    let dataSql = `SELECT ${colList} FROM ${escapeIdentifier(this.table)} ${where}`;
    dataSql += this.buildOrderBy();
    dataSql += this.buildLimit();

    // Run count + data in PARALLEL when count is requested
    let totalCount: number | undefined;
    let rows: any[];

    if (this.countMode === 'exact') {
      const countSql = `SELECT count(*)::int AS cnt FROM ${escapeIdentifier(this.table)} ${where}`;

      if (this.headOnly) {
        const countRes = await this.pool.query(countSql);
        totalCount = countRes.rows[0]?.cnt ?? 0;
        return { data: null, error: null, count: totalCount };
      }

      // Parallel: count + data
      const [countRes, dataRes] = await Promise.all([
        this.pool.query(countSql),
        this.pool.query(dataSql),
      ]);
      totalCount = countRes.rows[0]?.cnt ?? 0;
      rows = dataRes.rows;
    } else {
      const result = await this.pool.query(dataSql);
      rows = result.rows;
    }

    // Resolve relationships in PARALLEL (one batch query per relation, all at once)
    if (parsed.relations.length > 0 && rows.length > 0) {
      const relPromises = parsed.relations.map(async (rel) => {
        const fkValues = [
          ...new Set(rows.map((r) => r[rel.fkColumn]).filter(Boolean)),
        ];
        if (fkValues.length === 0) {
          for (const row of rows) row[rel.alias] = null;
          return;
        }

        const relCols = rel.columns.map((c) => escapeIdentifier(c)).join(', ');
        const placeholders = fkValues.map((_, i) => `$${i + 1}`).join(', ');
        const relSql = `SELECT id, ${relCols} FROM ${escapeIdentifier(rel.targetTable)} WHERE id IN (${placeholders})`;
        const relResult = await this.pool.query(relSql, fkValues);
        const relMap = new Map<string, any>();
        for (const rr of relResult.rows) relMap.set(rr.id, rr);

        for (const row of rows) {
          const related = relMap.get(row[rel.fkColumn]);
          row[rel.alias] = related || null;
        }
      });

      await Promise.all(relPromises);
    }

    if (this.isSingle) {
      if (rows.length === 0) {
        return {
          data: null,
          error: { message: 'Row not found', code: 'PGRST116' },
          count: totalCount,
        };
      }
      return { data: rows[0], error: null, count: totalCount };
    }

    if (this.isMaybeSingle) {
      return { data: rows[0] || null, error: null, count: totalCount };
    }

    return { data: rows, error: null, count: totalCount };
  }

  // ─── INSERT execution ─────────────────────────────────────────────────────

  private async execInsert(): Promise<{ data: any; error: any }> {
    const rows = this.insertData;
    if (!rows || rows.length === 0) return { data: null, error: null };

    const keys = Object.keys(rows[0]);
    const colNames = keys.map(escapeIdentifier).join(', ');
    const valueSets: string[] = [];
    for (const row of rows) {
      const vals = keys.map((k) => escapeLiteral(row[k]));
      valueSets.push(`(${vals.join(', ')})`);
    }

    const returning = this.returningSelect || this.selectStr || '*';
    const returnCols =
      returning === '*'
        ? '*'
        : returning
            .split(',')
            .map((c) => escapeIdentifier(c.trim()))
            .join(', ');

    const sql = `INSERT INTO ${escapeIdentifier(this.table)} (${colNames}) VALUES ${valueSets.join(', ')} RETURNING ${returnCols}`;
    const result = await this.pool.query(sql);

    if (this.isSingle || rows.length === 1) {
      return { data: result.rows[0] || null, error: null };
    }
    return { data: result.rows, error: null };
  }

  // ─── UPDATE execution ─────────────────────────────────────────────────────

  private async execUpdate(): Promise<{ data: any; error: any }> {
    const data = this.updateData;
    if (!data || Object.keys(data).length === 0)
      return { data: null, error: null };

    const sets = Object.entries(data)
      .map(([k, v]) => `${escapeIdentifier(k)} = ${escapeLiteral(v)}`)
      .join(', ');

    const where = this.buildWhere();
    const returning = this.returningSelect || this.selectStr || '*';
    const returnCols =
      returning === '*'
        ? '*'
        : returning
            .split(',')
            .map((c) => escapeIdentifier(c.trim()))
            .join(', ');

    const sql = `UPDATE ${escapeIdentifier(this.table)} SET ${sets} ${where} RETURNING ${returnCols}`;
    const result = await this.pool.query(sql);

    if (this.isSingle) {
      return { data: result.rows[0] || null, error: null };
    }
    return { data: result.rows, error: null };
  }

  // ─── DELETE execution ─────────────────────────────────────────────────────

  private async execDelete(): Promise<{ data: any; error: any }> {
    const where = this.buildWhere();
    const sql = `DELETE FROM ${escapeIdentifier(this.table)} ${where}`;
    await this.pool.query(sql);
    return { data: null, error: null };
  }

  // ─── UPSERT execution ────────────────────────────────────────────────────

  private async execUpsert(): Promise<{ data: any; error: any }> {
    const rows = this.insertData;
    if (!rows || rows.length === 0) return { data: null, error: null };

    const keys = Object.keys(rows[0]);
    const colNames = keys.map(escapeIdentifier).join(', ');
    const valueSets: string[] = [];
    for (const row of rows) {
      const vals = keys.map((k) => escapeLiteral(row[k]));
      valueSets.push(`(${vals.join(', ')})`);
    }

    const conflictCol = this.upsertOpts.onConflict || 'id';
    const updateSet = keys
      .filter((k) => k !== conflictCol)
      .map((k) => `${escapeIdentifier(k)} = EXCLUDED.${escapeIdentifier(k)}`)
      .join(', ');

    const conflictAction = this.upsertOpts.ignoreDuplicates
      ? 'ON CONFLICT DO NOTHING'
      : `ON CONFLICT (${escapeIdentifier(conflictCol)}) DO UPDATE SET ${updateSet}`;

    const sql = `INSERT INTO ${escapeIdentifier(this.table)} (${colNames}) VALUES ${valueSets.join(', ')} ${conflictAction} RETURNING *`;
    const result = await this.pool.query(sql);

    if (this.isSingle || rows.length === 1) {
      return { data: result.rows[0] || null, error: null };
    }
    return { data: result.rows, error: null };
  }

  // ─── SQL builders ─────────────────────────────────────────────────────────

  private buildWhere(): string {
    if (this.filters.length === 0) return '';

    const clauses: string[] = [];
    for (const f of this.filters) {
      switch (f.type) {
        case 'eq':
          clauses.push(
            f.val === null
              ? `${escapeIdentifier(f.col)} IS NULL`
              : `${escapeIdentifier(f.col)} = ${escapeLiteral(f.val)}`,
          );
          break;
        case 'neq':
          clauses.push(
            f.val === null
              ? `${escapeIdentifier(f.col)} IS NOT NULL`
              : `${escapeIdentifier(f.col)} != ${escapeLiteral(f.val)}`,
          );
          break;
        case 'gt':
          clauses.push(`${escapeIdentifier(f.col)} > ${escapeLiteral(f.val)}`);
          break;
        case 'gte':
          clauses.push(`${escapeIdentifier(f.col)} >= ${escapeLiteral(f.val)}`);
          break;
        case 'lt':
          clauses.push(`${escapeIdentifier(f.col)} < ${escapeLiteral(f.val)}`);
          break;
        case 'lte':
          clauses.push(`${escapeIdentifier(f.col)} <= ${escapeLiteral(f.val)}`);
          break;
        case 'like':
          clauses.push(
            `${escapeIdentifier(f.col)} LIKE ${escapeLiteral(f.val)}`,
          );
          break;
        case 'ilike':
          clauses.push(
            `${escapeIdentifier(f.col)} ILIKE ${escapeLiteral(f.val)}`,
          );
          break;
        case 'is':
          if (f.val === null)
            clauses.push(`${escapeIdentifier(f.col)} IS NULL`);
          else if (f.val === true)
            clauses.push(`${escapeIdentifier(f.col)} IS TRUE`);
          else if (f.val === false)
            clauses.push(`${escapeIdentifier(f.col)} IS FALSE`);
          break;
        case 'in':
          if (f.val.length === 0) {
            clauses.push('FALSE'); // empty IN = no match
          } else {
            clauses.push(
              `${escapeIdentifier(f.col)} IN (${f.val.map(escapeLiteral).join(', ')})`,
            );
          }
          break;
        case 'not':
          if (f.op === 'is' && f.val === null) {
            clauses.push(`${escapeIdentifier(f.col)} IS NOT NULL`);
          } else if (f.op === 'eq') {
            clauses.push(
              `${escapeIdentifier(f.col)} != ${escapeLiteral(f.val)}`,
            );
          } else if (f.op === 'in') {
            const vals = Array.isArray(f.val) ? f.val : [f.val];
            clauses.push(
              `${escapeIdentifier(f.col)} NOT IN (${vals.map(escapeLiteral).join(', ')})`,
            );
          } else {
            clauses.push(
              `NOT (${escapeIdentifier(f.col)} ${f.op} ${escapeLiteral(f.val)})`,
            );
          }
          break;
        case 'or':
          // Supabase .or() takes a string like "col1.eq.val1,col2.eq.val2"
          clauses.push(`(${this.parseOrExpr(f.expr)})`);
          break;
        case 'contains':
          if (Array.isArray(f.val)) {
            clauses.push(
              `${escapeIdentifier(f.col)} @> ${escapeLiteral(f.val)}`,
            );
          } else {
            clauses.push(
              `${escapeIdentifier(f.col)} @> ${escapeLiteral(f.val)}`,
            );
          }
          break;
        case 'overlaps':
          clauses.push(`${escapeIdentifier(f.col)} && ${escapeLiteral(f.val)}`);
          break;
        case 'textSearch':
          clauses.push(
            `to_tsvector(${escapeIdentifier(f.col)}) @@ plainto_tsquery(${escapeLiteral(f.val)})`,
          );
          break;
      }
    }
    return 'WHERE ' + clauses.join(' AND ');
  }

  /** Parse Supabase .or() expression: "col1.eq.val1,col2.gt.val2" */
  private parseOrExpr(expr: string): string {
    // Split on commas NOT inside parentheses
    const parts: string[] = [];
    let depth = 0;
    let current = '';
    for (const ch of expr) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        parts.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) parts.push(current.trim());

    return parts.map((part) => this.parseFilterExpr(part)).join(' OR ');
  }

  /** Parse a single filter expression like "col.eq.value" */
  private parseFilterExpr(expr: string): string {
    // Handle nested .or() and .and()
    const orMatch = expr.match(/^or\((.+)\)$/);
    if (orMatch) return `(${this.parseOrExpr(orMatch[1])})`;

    const andMatch = expr.match(/^and\((.+)\)$/);
    if (andMatch) {
      const parts = andMatch[1]
        .split(',')
        .map((p) => this.parseFilterExpr(p.trim()));
      return `(${parts.join(' AND ')})`;
    }

    // Standard: col.op.value
    const dotIdx = expr.indexOf('.');
    if (dotIdx === -1) return expr;

    const col = expr.substring(0, dotIdx);
    const rest = expr.substring(dotIdx + 1);
    const opIdx = rest.indexOf('.');
    if (opIdx === -1) return expr;

    const op = rest.substring(0, opIdx);
    const val = rest.substring(opIdx + 1);

    const colEsc = escapeIdentifier(col);
    switch (op) {
      case 'eq':
        return val === 'null'
          ? `${colEsc} IS NULL`
          : `${colEsc} = ${escapeLiteral(val)}`;
      case 'neq':
        return `${colEsc} != ${escapeLiteral(val)}`;
      case 'gt':
        return `${colEsc} > ${escapeLiteral(val)}`;
      case 'gte':
        return `${colEsc} >= ${escapeLiteral(val)}`;
      case 'lt':
        return `${colEsc} < ${escapeLiteral(val)}`;
      case 'lte':
        return `${colEsc} <= ${escapeLiteral(val)}`;
      case 'like':
        return `${colEsc} LIKE ${escapeLiteral(val)}`;
      case 'ilike':
        return `${colEsc} ILIKE ${escapeLiteral(val)}`;
      case 'is':
        if (val === 'null') return `${colEsc} IS NULL`;
        if (val === 'true') return `${colEsc} IS TRUE`;
        if (val === 'false') return `${colEsc} IS FALSE`;
        return `${colEsc} IS ${escapeLiteral(val)}`;
      case 'in': {
        const inVals = val
          .replace(/^\(|\)$/g, '')
          .split(',')
          .map((v) => escapeLiteral(v.trim()));
        return `${colEsc} IN (${inVals.join(', ')})`;
      }
      default:
        return `${colEsc} ${op} ${escapeLiteral(val)}`;
    }
  }

  private buildOrderBy(): string {
    if (this.orders.length === 0) return '';
    const parts = this.orders.map(
      (o) => `${escapeIdentifier(o.column)} ${o.ascending ? 'ASC' : 'DESC'}`,
    );
    return ' ORDER BY ' + parts.join(', ');
  }

  private buildLimit(): string {
    let sql = '';
    if (this.limitVal !== undefined) sql += ` LIMIT ${this.limitVal}`;
    if (this.offsetVal !== undefined) sql += ` OFFSET ${this.offsetVal}`;
    if (this.isSingle || this.isMaybeSingle) {
      if (this.limitVal === undefined) sql += ' LIMIT 1';
    }
    return sql;
  }
}

// ─── RPC executor ───────────────────────────────────────────────────────────

async function execRpc(
  pool: Pool,
  fnName: string,
  params?: Record<string, any>,
): Promise<{ data: any; error: any }> {
  try {
    const paramEntries = params ? Object.entries(params) : [];
    const placeholders = paramEntries.map((_, i) => `$${i + 1}`).join(', ');
    // Named-arg style: SELECT fn(param1 := $1, param2 := $2)
    const namedArgs = paramEntries
      .map(([k], i) => `${k} := $${i + 1}`)
      .join(', ');
    const values = paramEntries.map(([, v]) => v);

    const sql = `SELECT ${escapeIdentifier(fnName)}(${namedArgs})`;
    const result = await pool.query(sql, values);
    return { data: result.rows[0] || null, error: null };
  } catch (err: any) {
    return {
      data: null,
      error: { message: err.message, code: err.code, details: err.detail },
    };
  }
}

// ─── Adapter (drop-in for Supabase client) ──────────────────────────────────

export class SupabaseAdapter {
  private pool: Pool;

  /** Stub auth namespace — real auth is handled by auth.service.ts directly. */
  auth: any;

  constructor(pool: Pool) {
    this.pool = pool;
    // Provide a minimal auth stub so existing code that references
    // `this.supabase.auth` or `this.admin.auth` doesn't crash at import time.
    // The actual auth logic is rewritten in auth.service.ts.
    this.auth = {
      signUp: () =>
        Promise.resolve({
          data: null,
          error: { message: 'Use auth.service.ts directly' },
        }),
      signInWithPassword: () =>
        Promise.resolve({
          data: null,
          error: { message: 'Use auth.service.ts directly' },
        }),
      signInWithOAuth: () =>
        Promise.resolve({
          data: null,
          error: { message: 'Use auth.service.ts directly' },
        }),
      exchangeCodeForSession: () =>
        Promise.resolve({
          data: null,
          error: { message: 'Use auth.service.ts directly' },
        }),
      signOut: () => Promise.resolve({ error: null }),
      getUser: () =>
        Promise.resolve({
          data: null,
          error: { message: 'Use auth.service.ts directly' },
        }),
      updateUser: () =>
        Promise.resolve({
          data: null,
          error: { message: 'Use auth.service.ts directly' },
        }),
      admin: {
        getUserById: () =>
          Promise.resolve({
            data: null,
            error: { message: 'Use auth.service.ts directly' },
          }),
        updateUserById: () =>
          Promise.resolve({
            data: null,
            error: { message: 'Use auth.service.ts directly' },
          }),
        listUsers: () => Promise.resolve({ data: { users: [] }, error: null }),
      },
    };
  }

  from(table: string): QueryChain {
    return new QueryChain(this.pool, table);
  }

  rpc(
    fnName: string,
    params?: Record<string, any>,
  ): Promise<{ data: any; error: any }> {
    return execRpc(this.pool, fnName, params);
  }
}
