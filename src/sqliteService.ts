import { SqlJsStatic, QueryExecResult } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

// Minimal surface shared by sql.js Database and the native node:sqlite adapter.
export interface Database {
  exec(sql: string): QueryExecResult[];
  close(): void;
  /** Which engine backs this handle. */
  engine?: 'native' | 'sql.js';
  /** Row-by-row streaming; only the native engine provides it. */
  iterate?(sql: string): Iterable<Record<string, unknown>>;
}

// Limits keep memory and UI cost bounded on multi-GB databases.
const BADGE_COUNT_CAP = 100_000;
const VIEW_COUNT_CAP = 1_000_000;
const MAX_CUSTOM_ROWS = 10_000;
const MAX_CELL_CHARS = 5_000;
const EXPORT_FLUSH_CHARS = 64 * 1024;

const SQLJS_MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024 - 1;

let SQL: SqlJsStatic | null = null;
let extensionContext: vscode.ExtensionContext | null = null;

export function setExtensionContext(context: vscode.ExtensionContext) {
  extensionContext = context;
}

export interface TableColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: boolean;
  dflt_value: string | null;
  pk: boolean;
  /** Computed column (GENERATED ... AS); cannot be written. */
  generated: boolean;
}

export interface TableSummary {
  name: string;
  rowCount: number;
  badgeCount: string;
  rowCountCapped: boolean;
  kind: 'table' | 'view';
  /** Virtual table this internal (shadow) table belongs to. */
  shadowOf?: string;
  /** Virtual and shadow tables must never be edited. */
  readOnly: boolean;
}

export interface QueryOptions {
  searchQuery?: string;
  columnFilters?: Record<string, string>;
  sortState?: Array<{ col: string; dir: 'asc' | 'desc' }>;
  page?: number;
  pageSize?: number;
}

export interface QueryResult {
  columns: Array<{ key: string; title: string; type: string }>;
  rows: Array<Record<string, any>>;
  totalRows: number;
  totalCapped: boolean;
}

export interface CustomQueryResult {
  columns: string[];
  rows: Array<Record<string, any>>;
  executionTimeMs: number;
  affectedRows?: number;
  truncated?: boolean;
  error?: string;
}

export async function getSqlEngine(): Promise<SqlJsStatic> {
  if (!SQL) {
    const initSqlJs = require('sql.js/dist/sql-wasm.js');
    let wasmPath = '';
    if (extensionContext) {
      wasmPath = vscode.Uri.joinPath(extensionContext.extensionUri, 'dist', 'sql-wasm.wasm').fsPath;
    }
    if (!wasmPath || !fs.existsSync(wasmPath)) {
      wasmPath = path.join(__dirname, 'sql-wasm.wasm');
    }
    if (!fs.existsSync(wasmPath)) {
      wasmPath = path.resolve(__dirname, '../node_modules/sql.js/dist/sql-wasm.wasm');
    }

    let wasmBinary: Buffer | undefined;
    if (fs.existsSync(wasmPath)) {
      wasmBinary = fs.readFileSync(wasmPath);
    }

    SQL = await initSqlJs({
      locateFile: () => wasmPath,
      wasmBinary: wasmBinary
    });
  }
  return SQL!;
}

function toJsValue(v: unknown): unknown {
  if (typeof v === 'bigint') {
    return v >= BigInt(Number.MIN_SAFE_INTEGER) && v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v.toString();
  }
  return v;
}

function convertRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    out[key] = toJsValue(row[key]);
  }
  return out;
}

function openNativeDatabase(filePath: string): Database {
  const { DatabaseSync } = require('node:sqlite');
  const native = new DatabaseSync(filePath, { readOnly: true });
  try {
    // Small page cache, no mmap: keep RSS low on huge files.
    native.exec('PRAGMA cache_size = -16384; PRAGMA mmap_size = 0;');
  } catch { /* tuning is best effort */ }

  const prepare = (sql: string) => {
    const stmt = native.prepare(sql);
    stmt.setReadBigInts(true);
    return stmt;
  };

  return {
    engine: 'native',
    exec(sql: string): QueryExecResult[] {
      const stmt = prepare(sql);
      const rows: Array<Record<string, unknown>> = stmt.all();
      const columns: string[] = rows.length > 0
        ? Object.keys(rows[0])
        : (typeof stmt.columns === 'function' ? stmt.columns().map((c: { name: string }) => c.name) : []);
      if (columns.length === 0) {
        return [];
      }
      return [{ columns, values: rows.map(r => columns.map(c => toJsValue(r[c])) as any) }];
    },
    *iterate(sql: string): Iterable<Record<string, unknown>> {
      for (const row of prepare(sql).iterate()) {
        yield convertRow(row as Record<string, unknown>);
      }
    },
    close() {
      native.close();
    }
  };
}

export async function openDatabase(filePath: string): Promise<Database> {
  // Native SQLite reads pages from disk, so size is not limited by memory.
  try {
    return openNativeDatabase(filePath);
  } catch (nativeErr: any) {
    console.warn('node:sqlite unavailable, falling back to sql.js:', (nativeErr && nativeErr.message) || nativeErr);
    const size = fs.statSync(filePath).size;
    if (size > SQLJS_MAX_FILE_SIZE) {
      throw new Error(
        `File is ${(size / 1024 ** 3).toFixed(2)} GiB; files over 2 GiB need node:sqlite, ` +
        `which is unavailable in this VS Code version (${nativeErr.message || nativeErr}). Update VS Code.`
      );
    }
    const engine = await getSqlEngine();
    const fallback: Database = new engine.Database(fs.readFileSync(filePath));
    fallback.engine = 'sql.js';
    return fallback;
  }
}

/** Stream rows of a statement without materializing the whole result. */
function* iterateRows(db: Database, sql: string): Generator<Record<string, any>> {
  if (db.iterate) {
    yield* db.iterate(sql);
    return;
  }
  const stmt = (db as any).prepare(sql);
  try {
    while (stmt.step()) {
      yield stmt.getAsObject();
    }
  } finally {
    stmt.free();
  }
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Count rows, scanning at most cap + 1 of them. */
function countRowsCapped(db: Database, tableName: string, whereSql: string, cap: number): { count: number; capped: boolean } {
  const res = db.exec(`SELECT COUNT(*) FROM (SELECT 1 FROM ${quoteIdent(tableName)} ${whereSql} LIMIT ${cap + 1});`);
  const n = res && res[0] && res[0].values ? Number(res[0].values[0][0]) : 0;
  return n > cap ? { count: cap, capped: true } : { count: n, capped: false };
}

/** Make a cell safe and cheap to send to the webview. */
function displayValue(v: any): any {
  if (v instanceof Uint8Array) {
    return `[BLOB ${v.byteLength} bytes]`;
  }
  if (typeof v === 'string' && v.length > MAX_CELL_CHARS) {
    return `${v.slice(0, MAX_CELL_CHARS)}… (+${v.length - MAX_CELL_CHARS} chars)`;
  }
  return v;
}

function displayRow(row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const key of Object.keys(row)) {
    out[key] = displayValue(row[key]);
  }
  return out;
}

export function getTables(db: Database): TableSummary[] {
  const res = db.exec("SELECT name, sql, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name ASC;");
  if (!res || res.length === 0 || !res[0].values) {
    return [];
  }

  const entries = res[0].values.map(r => ({ name: String(r[0]), kind: String(r[2]) as 'table' | 'view', isVirtual: /^\s*CREATE\s+VIRTUAL\s+TABLE/i.test(String(r[1] || '')) }));
  const virtualNames = entries.filter(e => e.isVirtual).map(e => e.name);

  // SQLite itself reports which tables are shadow tables (3.37+); an ordinary "docs_notes" stays ordinary.
  // shortcut: needs the virtual-table module loaded, so shadows of fts5 are not detected under sql.js.
  const shadowNames = new Set<string>();
  try {
    const tl = db.exec('PRAGMA table_list;');
    if (tl[0]) {
      const nameIdx = tl[0].columns.indexOf('name');
      const typeIdx = tl[0].columns.indexOf('type');
      tl[0].values.forEach(r => { if (r[typeIdx] === 'shadow') { shadowNames.add(String(r[nameIdx])); } });
    }
  } catch { /* old SQLite: no shadow grouping */ }

  const tables: TableSummary[] = [];
  for (const { name, kind, isVirtual } of entries) {
    // Owner = longest virtual table whose name prefixes this shadow table.
    const shadowOf = shadowNames.has(name)
      ? virtualNames.filter(v => name.startsWith(v + '_')).sort((x, y) => y.length - x.length)[0] || 'virtual table'
      : undefined;

    let count = 0;
    let capped = false;
    try {
      ({ count, capped } = countRowsCapped(db, name, '', BADGE_COUNT_CAP));
    } catch (e) {
      console.warn(`Could not fetch count for table ${name}:`, e);
    }

    tables.push({
      name,
      rowCount: count,
      badgeCount: formatBadgeCount(count, capped),
      rowCountCapped: capped,
      kind,
      shadowOf,
      readOnly: kind === 'view' || isVirtual || !!shadowOf
    });
  }

  return tables;
}

export function getTableSchema(db: Database, tableName: string): TableColumnInfo[] {
  const safeName = tableName.replace(/"/g, '""');
  // table_xinfo (unlike table_info) lists generated columns; hidden=1 columns are not part of SELECT *.
  const res = db.exec(`PRAGMA table_xinfo("${safeName}");`);
  if (!res || res.length === 0 || !res[0].values) {
    return [];
  }

  return res[0].values.filter(row => Number(row[6]) !== 1).map(row => ({
    cid: Number(row[0]),
    name: String(row[1]),
    type: String(row[2] || 'TEXT').toUpperCase(),
    notnull: Number(row[3]) === 1,
    dflt_value: row[4] !== null ? String(row[4]) : null,
    pk: Number(row[5]) > 0,
    generated: Number(row[6]) >= 2
  }));
}

export function getTableDDL(db: Database, tableName: string): string {
  const res = db.exec(`SELECT sql FROM sqlite_master WHERE type IN ('table','view') AND name='${tableName.replace(/'/g, "''")}';`);
  if (res && res[0] && res[0].values && res[0].values[0]) {
    return String(res[0].values[0][0]) + ';';
  }
  return `-- DDL for ${tableName} not found`;
}

export function getTableData(db: Database, tableName: string, options: QueryOptions = {}): QueryResult {
  const schema = getTableSchema(db, tableName);
  const columns = schema.map(col => ({
    key: col.name,
    title: col.name,
    type: col.type
  }));

  const safeName = tableName.replace(/"/g, '""');
  const whereClauses: string[] = [];

  if (options.searchQuery && options.searchQuery.trim() !== '') {
    const q = options.searchQuery.replace(/'/g, "''").toLowerCase();
    const searchConditions = schema.map(c => `LOWER(CAST("${c.name}" AS TEXT)) LIKE '%${q}%'`);
    whereClauses.push(`(${searchConditions.join(' OR ')})`);
  }

  if (options.columnFilters) {
    Object.keys(options.columnFilters).forEach(colKey => {
      const val = options.columnFilters![colKey];
      if (val && val.trim() !== '') {
        const safeVal = val.replace(/'/g, "''").toLowerCase();
        whereClauses.push(`LOWER(CAST("${colKey}" AS TEXT)) LIKE '%${safeVal}%'`);
      }
    });
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const { count: totalRows, capped: totalCapped } = countRowsCapped(db, tableName, whereSql, VIEW_COUNT_CAP);

  let orderBySql = '';
  if (options.sortState && options.sortState.length > 0) {
    const sortOrders = options.sortState.map(s => `"${s.col}" ${s.dir.toUpperCase()}`);
    orderBySql = `ORDER BY ${sortOrders.join(', ')}`;
  }

  const page = options.page || 1;
  const pageSize = options.pageSize || 100;
  const offset = (page - 1) * pageSize;

  const queryRes = db.exec(`SELECT * FROM "${safeName}" ${whereSql} ${orderBySql} LIMIT ${pageSize} OFFSET ${offset};`);
  if (!queryRes || queryRes.length === 0 || !queryRes[0].values) {
    return { columns, rows: [], totalRows, totalCapped };
  }

  const resCols = queryRes[0].columns;
  const rows = queryRes[0].values.map(valArr => {
    const rowObj: Record<string, any> = {};
    resCols.forEach((col, idx) => {
      rowObj[col] = displayValue(valArr[idx]);
    });
    return rowObj;
  });

  return { columns, rows, totalRows, totalCapped };
}

export function executeCustomQuery(db: Database, sqlQuery: string): CustomQueryResult {
  const startTime = Date.now();
  try {
    let columns: string[] = [];
    let rows: Array<Record<string, any>> = [];
    let truncated = false;

    if (db.iterate) {
      // Stream and stop early: a runaway SELECT must not fill memory.
      for (const row of iterateRows(db, sqlQuery)) {
        if (rows.length >= MAX_CUSTOM_ROWS) {
          truncated = true;
          break;
        }
        if (rows.length === 0) {
          columns = Object.keys(row);
        }
        rows.push(displayRow(row));
      }
    } else {
      const res = db.exec(sqlQuery);
      if (res && res.length > 0) {
        columns = res[0].columns;
        truncated = res[0].values.length > MAX_CUSTOM_ROWS;
        rows = res[0].values.slice(0, MAX_CUSTOM_ROWS).map(valArr => {
          const rowObj: Record<string, any> = {};
          columns.forEach((col, idx) => {
            rowObj[col] = displayValue(valArr[idx]);
          });
          return rowObj;
        });
      }
    }

    return {
      columns,
      rows,
      executionTimeMs: Date.now() - startTime,
      affectedRows: rows.length,
      truncated
    };
  } catch (err: any) {
    return {
      columns: [],
      rows: [],
      executionTimeMs: Date.now() - startTime,
      error: err.message || String(err)
    };
  }
}

type ExportFormat = 'csv' | 'json' | 'sql';

function exportCell(format: ExportFormat, val: any): string {
  if (val === null || val === undefined) {
    return format === 'sql' ? 'NULL' : format === 'csv' ? '""' : 'null';
  }
  if (val instanceof Uint8Array) {
    const hex = Buffer.from(val).toString('hex');
    return format === 'sql' ? `X'${hex}'` : `"${hex}"`;
  }
  if (format === 'sql') {
    return typeof val === 'number' ? String(val) : `'${String(val).replace(/'/g, "''")}'`;
  }
  return `"${String(val).replace(/"/g, '""')}"`;
}

/** Yield the export text in pieces; rows are read lazily from the database. */
function* exportChunks(db: Database, tableName: string, format: ExportFormat): Generator<string> {
  const schema = getTableSchema(db, tableName);
  const keys = schema.map(c => c.name);
  const rows = iterateRows(db, `SELECT * FROM ${quoteIdent(tableName)};`);

  if (format === 'csv') {
    yield keys.map(k => `"${k.replace(/"/g, '""')}"`).join(',');
    for (const row of rows) {
      yield '\n' + keys.map(k => exportCell('csv', row[k])).join(',');
    }
  } else if (format === 'json') {
    let first = true;
    yield '[';
    for (const row of rows) {
      const obj: Record<string, any> = {};
      for (const k of keys) {
        const v = row[k];
        obj[k] = v instanceof Uint8Array ? Buffer.from(v).toString('hex') : v;
      }
      yield (first ? '\n  ' : ',\n  ') + JSON.stringify(obj);
      first = false;
    }
    yield first ? ']' : '\n]';
  } else if (format === 'sql') {
    // Generated columns cannot be inserted, so the dump skips them.
    const insertKeys = schema.filter(c => !c.generated).map(c => c.name);
    const cols = insertKeys.map(quoteIdent).join(', ');
    const target = quoteIdent(tableName);
    let first = true;
    for (const row of rows) {
      const vals = insertKeys.map(k => exportCell('sql', row[k])).join(', ');
      yield `${first ? '' : '\n'}INSERT INTO ${target} (${cols}) VALUES (${vals});`;
      first = false;
    }
  }
}

/** In-memory export; use exportTableToFile for large tables. */
export function exportTableData(db: Database, tableName: string, format: ExportFormat): string {
  return Array.from(exportChunks(db, tableName, format)).join('');
}

/** Stream the whole table to a file with bounded memory. Returns bytes written. */
export async function exportTableToFile(db: Database, tableName: string, format: ExportFormat, filePath: string): Promise<number> {
  const out = fs.createWriteStream(filePath, { encoding: 'utf8' });
  const failed = new Promise<never>((_, reject) => out.once('error', reject));
  failed.catch(() => { /* surfaced through the awaited writes below */ });

  const write = (text: string) => out.write(text) ? Promise.resolve() : new Promise<void>(res => out.once('drain', res));

  try {
    let buffer = '';
    for (const piece of exportChunks(db, tableName, format)) {
      buffer += piece;
      if (buffer.length >= EXPORT_FLUSH_CHARS) {
        await Promise.race([write(buffer), failed]);
        buffer = '';
      }
    }
    if (buffer) {
      await Promise.race([write(buffer), failed]);
    }
    await Promise.race([new Promise<void>(res => out.end(res)), failed]);
    return out.bytesWritten;
  } catch (err) {
    out.destroy();
    throw err;
  }
}

function formatBadgeCount(count: number, capped = false): string {
  const suffix = capped ? '+' : '';
  if (count >= 1_000_000) {
    return (count / 1_000_000).toFixed(1).replace('.0', '') + 'M' + suffix;
  } else if (count >= 1_000) {
    return (count / 1_000).toFixed(1).replace('.0', '') + 'K' + suffix;
  }
  return String(count) + suffix;
}
