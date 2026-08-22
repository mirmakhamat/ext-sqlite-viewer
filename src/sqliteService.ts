import { Database, SqlJsStatic } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

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
}

export interface TableSummary {
  name: string;
  rowCount: number;
  badgeCount: string;
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
}

export interface CustomQueryResult {
  columns: string[];
  rows: Array<Record<string, any>>;
  executionTimeMs: number;
  affectedRows?: number;
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

export async function openDatabase(filePath: string): Promise<Database> {
  const engine = await getSqlEngine();
  const fileBuffer = fs.readFileSync(filePath);
  return new engine.Database(fileBuffer);
}

export function getTables(db: Database): TableSummary[] {
  const res = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC;");
  if (!res || res.length === 0 || !res[0].values) {
    return [];
  }

  const tableNames = res[0].values.map(v => String(v[0]));
  const tables: TableSummary[] = [];

  for (const name of tableNames) {
    let count = 0;
    try {
      const countRes = db.exec(`SELECT COUNT(*) FROM "${name}";`);
      if (countRes && countRes[0] && countRes[0].values) {
        count = Number(countRes[0].values[0][0]);
      }
    } catch (e) {
      console.warn(`Could not fetch count for table ${name}:`, e);
    }

    tables.push({
      name,
      rowCount: count,
      badgeCount: formatBadgeCount(count)
    });
  }

  return tables;
}

export function getTableSchema(db: Database, tableName: string): TableColumnInfo[] {
  const safeName = tableName.replace(/"/g, '""');
  const res = db.exec(`PRAGMA table_info("${safeName}");`);
  if (!res || res.length === 0 || !res[0].values) {
    return [];
  }

  return res[0].values.map(row => ({
    cid: Number(row[0]),
    name: String(row[1]),
    type: String(row[2] || 'TEXT').toUpperCase(),
    notnull: Number(row[3]) === 1,
    dflt_value: row[4] !== null ? String(row[4]) : null,
    pk: Number(row[5]) === 1
  }));
}

export function getTableDDL(db: Database, tableName: string): string {
  const res = db.exec(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${tableName.replace(/'/g, "''")}';`);
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

  let totalRows = 0;
  const countRes = db.exec(`SELECT COUNT(*) FROM "${safeName}" ${whereSql};`);
  if (countRes && countRes[0] && countRes[0].values) {
    totalRows = Number(countRes[0].values[0][0]);
  }

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
    return { columns, rows: [], totalRows };
  }

  const resCols = queryRes[0].columns;
  const rows = queryRes[0].values.map(valArr => {
    const rowObj: Record<string, any> = {};
    resCols.forEach((col, idx) => {
      rowObj[col] = valArr[idx];
    });
    return rowObj;
  });

  return {
    columns,
    rows,
    totalRows
  };
}

export function executeCustomQuery(db: Database, sqlQuery: string): CustomQueryResult {
  const startTime = Date.now();
  try {
    const res = db.exec(sqlQuery);
    const executionTimeMs = Date.now() - startTime;

    if (!res || res.length === 0) {
      return {
        columns: [],
        rows: [],
        executionTimeMs,
        affectedRows: 0
      };
    }

    const columns = res[0].columns;
    const rows = res[0].values.map(valArr => {
      const rowObj: Record<string, any> = {};
      columns.forEach((col, idx) => {
        rowObj[col] = valArr[idx];
      });
      return rowObj;
    });

    return {
      columns,
      rows,
      executionTimeMs,
      affectedRows: rows.length
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

export function exportTableData(db: Database, tableName: string, format: 'csv' | 'json' | 'sql'): string {
  const data = getTableData(db, tableName, { pageSize: 10000 });

  if (format === 'json') {
    return JSON.stringify(data.rows, null, 2);
  } else if (format === 'csv') {
    const headers = data.columns.map(c => `"${c.title}"`).join(',');
    const rows = data.rows.map(row => {
      return data.columns.map(c => {
        const val = row[c.key];
        if (val === null || val === undefined) {
          return '""';
        }
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(',');
    });
    return [headers, ...rows].join('\n');
  } else if (format === 'sql') {
    const inserts = data.rows.map(row => {
      const cols = data.columns.map(c => `"${c.key}"`).join(', ');
      const vals = data.columns.map(c => {
        const val = row[c.key];
        if (val === null || val === undefined) {
          return 'NULL';
        }
        if (typeof val === 'number') {
          return val;
        }
        return `'${String(val).replace(/'/g, "''")}'`;
      }).join(', ');
      return `INSERT INTO "${tableName}" (${cols}) VALUES (${vals});`;
    });
    return inserts.join('\n');
  }

  return '';
}

function formatBadgeCount(count: number): string {
  if (count >= 1_000_000) {
    return (count / 1_000_000).toFixed(1).replace('.0', '') + 'M+';
  } else if (count >= 1_000) {
    return (count / 1_000).toFixed(1).replace('.0', '') + 'K';
  }
  return String(count);
}
