/**
 * In-memory D1 mock for testing route handlers.
 * Supports prepare/bind/all/first/run/batch.
 */
import { vi } from 'vitest';

type Row = Record<string, unknown>;

export interface MockD1 {
  db: D1Database;
  /** Seed a table with rows */
  seed(table: string, rows: Row[]): void;
  /** Get all rows from a table */
  getAll(table: string): Row[];
  /** Clear all data */
  reset(): void;
}

/**
 * Create a minimal in-memory D1 mock.
 * Supports basic INSERT, SELECT, UPDATE, DELETE for testing route handlers.
 * Does NOT implement full SQL parsing — just enough for our CRUD routes.
 */
export function createMockD1(): MockD1 {
  const tables = new Map<string, Row[]>();

  function getTable(name: string): Row[] {
    if (!tables.has(name)) {
      tables.set(name, []);
    }
    return tables.get(name)!;
  }

  function executeQuery(sql: string, params: unknown[]): { results: Row[]; changes: number } {
    const trimmed = sql.trim().replace(/\s+/g, ' ');

    // INSERT
    const insertMatch = trimmed.match(/^INSERT INTO (\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    if (insertMatch) {
      const table = insertMatch[1];
      const cols = insertMatch[2].split(',').map((c) => c.trim());
      const rows = getTable(table);
      const row: Row = {};
      cols.forEach((col, i) => {
        row[col] = params[i] ?? null;
      });
      rows.push(row);
      return { results: [], changes: 1 };
    }

    // DELETE
    const deleteMatch = trimmed.match(/^DELETE FROM (\w+)\s+WHERE\s+(.+)$/i);
    if (deleteMatch) {
      const table = deleteMatch[1];
      const rows = getTable(table);
      const whereCol = deleteMatch[2].match(/(\w+)\s*=\s*\?/)?.[1];
      if (whereCol) {
        const before = rows.length;
        const filtered = rows.filter((r) => r[whereCol] !== params[0]);
        tables.set(table, filtered);
        return { results: [], changes: before - filtered.length };
      }
      return { results: [], changes: 0 };
    }

    // UPDATE
    const updateMatch = trimmed.match(/^UPDATE (\w+)\s+SET\s+(.+)\s+WHERE\s+(\w+)\s*=\s*\?$/i);
    if (updateMatch) {
      const table = updateMatch[1];
      const rows = getTable(table);
      const setClauses = updateMatch[2].split(',').map((s) => s.trim());
      const whereCol = updateMatch[3];
      const whereVal = params[params.length - 1];

      let changes = 0;
      for (const row of rows) {
        if (row[whereCol] === whereVal) {
          let paramIdx = 0;
          for (const clause of setClauses) {
            const col = clause.match(/(\w+)\s*=\s*\?/)?.[1];
            if (col) {
              row[col] = params[paramIdx];
              paramIdx++;
            }
          }
          changes++;
        }
      }
      return { results: [], changes };
    }

    // SELECT — extract primary table (handles LEFT JOIN, subqueries, etc.)
    const selectMatch = trimmed.match(/^SELECT\s+.+?\s+FROM\s+(\w+)/i);
    if (selectMatch) {
      const table = selectMatch[1];
      const rest = trimmed.slice(selectMatch.index! + selectMatch[0].length).trim();
      let rows = [...getTable(table)];

      // Parse WHERE clause conditions
      const whereMatch = rest.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|\s+GROUP|\s+HAVING|\s*$)/i);
      if (whereMatch) {
        const conditions = whereMatch[1];
        // Split on AND, handle each condition
        const parts = conditions.split(/\s+AND\s+/i);
        let paramIdx = 0;
        for (const part of parts) {
          const trimPart = part.trim();

          // col = ? (bind param)
          const bindMatch = trimPart.match(/^(\w+(?:\.\w+)?)\s*=\s*\?$/);
          if (bindMatch) {
            const col = bindMatch[1].split('.').pop()!;
            const val = params[paramIdx++];
            rows = rows.filter((r) => r[col] === val);
            continue;
          }

          // col = 'literal'
          const litMatch = trimPart.match(/^(\w+(?:\.\w+)?)\s*=\s*'([^']*)'/);
          if (litMatch) {
            const col = litMatch[1].split('.').pop()!;
            const val = litMatch[2];
            rows = rows.filter((r) => r[col] === val);
            continue;
          }

          // col IN ('a', 'b') — filter OUT matching rows (used with NOT IN)
          const notInMatch = trimPart.match(/^(\w+(?:\.\w+)?)\s+NOT\s+IN\s*\(([^)]+)\)/i);
          if (notInMatch) {
            const col = notInMatch[1].split('.').pop()!;
            const vals = notInMatch[2].split(',').map((v) => v.trim().replace(/'/g, ''));
            rows = rows.filter((r) => !vals.includes(String(r[col])));
            continue;
          }

          // col IN ('a', 'b') — keep matching rows
          const inMatch = trimPart.match(/^(\w+(?:\.\w+)?)\s+IN\s*\(([^)]+)\)/i);
          if (inMatch) {
            const col = inMatch[1].split('.').pop()!;
            const vals = inMatch[2].split(',').map((v) => v.trim().replace(/'/g, ''));
            rows = rows.filter((r) => vals.includes(String(r[col])));
            continue;
          }

          // col < ? (bind param comparison)
          const ltBindMatch = trimPart.match(/^(\w+(?:\.\w+)?)\s*<\s*\?$/);
          if (ltBindMatch) {
            const col = ltBindMatch[1].split('.').pop()!;
            const val = params[paramIdx++];
            rows = rows.filter((r) => r[col] != null && String(r[col]) < String(val));
            continue;
          }

          // col IS NULL
          const isNullMatch = trimPart.match(/^(\w+(?:\.\w+)?)\s+IS\s+NULL$/i);
          if (isNullMatch) {
            const col = isNullMatch[1].split('.').pop()!;
            rows = rows.filter((r) => r[col] === null || r[col] === undefined);
            continue;
          }

          // col IS NOT NULL
          const isNotNullMatch = trimPart.match(/^(\w+(?:\.\w+)?)\s+IS\s+NOT\s+NULL$/i);
          if (isNotNullMatch) {
            const col = isNotNullMatch[1].split('.').pop()!;
            rows = rows.filter((r) => r[col] !== null && r[col] !== undefined);
            continue;
          }

          // col LIKE ? (bind param)
          const likeMatch = trimPart.match(/^(\w+(?:\.\w+)?)\s+LIKE\s+\?$/i);
          if (likeMatch) {
            const col = likeMatch[1].split('.').pop()!;
            const pattern = String(params[paramIdx++]);
            const prefix = pattern.replace(/%$/, '');
            rows = rows.filter((r) => r[col] != null && String(r[col]).startsWith(prefix));
            continue;
          }

          // col BETWEEN ? AND ...
          const betweenMatch = trimPart.match(/^(\w+(?:\.\w+)?)\s+BETWEEN\s+\?/i);
          if (betweenMatch) {
            const col = betweenMatch[1].split('.').pop()!;
            const val = params[paramIdx++];
            rows = rows.filter((r) => r[col] != null && String(r[col]) >= String(val));
            continue;
          }

          // Skip conditions we can't parse (complex subqueries, function calls, etc.)
        }
      }

      // LIMIT
      const limitMatch = rest.match(/LIMIT\s+(\?|\d+)/i);
      if (limitMatch) {
        const limit = limitMatch[1] === '?' ? Number(params[params.length - 1]) : Number(limitMatch[1]);
        rows = rows.slice(0, limit);
      }

      return { results: rows, changes: 0 };
    }

    // Fallback: return empty
    return { results: [], changes: 0 };
  }

  function createStatement(sql: string) {
    let boundParams: unknown[] = [];

    const stmt: any = {
      bind(...args: unknown[]) {
        boundParams = args;
        return stmt;
      },
      async all() {
        const result = executeQuery(sql, boundParams);
        return { results: result.results, success: true };
      },
      async first() {
        const result = executeQuery(sql, boundParams);
        return result.results[0] || null;
      },
      async run() {
        const result = executeQuery(sql, boundParams);
        return { success: true, meta: { changes: result.changes } };
      },
    };

    return stmt;
  }

  const db = {
    prepare: vi.fn((sql: string) => createStatement(sql)),
    batch: vi.fn(async (stmts: any[]) => {
      const results = [];
      for (const stmt of stmts) {
        results.push(await stmt.run());
      }
      return results;
    }),
    exec: vi.fn(),
    dump: vi.fn(),
  } as unknown as D1Database;

  return {
    db,
    seed(table: string, rows: Row[]) {
      tables.set(table, [...rows]);
    },
    getAll(table: string) {
      return [...(tables.get(table) || [])];
    },
    reset() {
      tables.clear();
    },
  };
}
