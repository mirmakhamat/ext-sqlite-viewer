import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { 
    openDatabase, 
    getTables, 
    getTableSchema, 
    getTableDDL, 
    getTableData, 
    executeCustomQuery, 
    exportTableData,
    getSqlEngine 
} from '../sqliteService';
import { Database } from 'sql.js';

suite('SQLite Service Unit & Integration Tests', () => {
    let db: Database;
    let tempDbPath: string;

    suiteSetup(async () => {
        const engine = await getSqlEngine();
        db = new engine.Database();

        db.run(`
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                email TEXT,
                bio TEXT,
                balance REAL DEFAULT 0.0,
                created_at TEXT
            );

            CREATE TABLE products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                price REAL NOT NULL,
                stock INTEGER DEFAULT 0
            );
        `);

        db.run(`
            INSERT INTO users (username, email, bio, balance, created_at) VALUES
            ('alice', 'alice@example.com', 'Developer & <b>Designer</b>', 150.50, '2026-01-01'),
            ('bob', 'bob@example.com', '<script>alert("xss")</script>', 0.00, '2026-01-02'),
            ('charlie', 'charlie@example.com', NULL, 75.25, '2026-01-03'),
            ('david', 'david@example.com', 'Regular User', 500.00, '2026-01-04'),
            ('eve', 'eve@example.com', 'Security Researcher', 200.00, '2026-01-05');

            INSERT INTO products (title, price, stock) VALUES
            ('Laptop', 999.99, 10),
            ('Phone', 499.50, 25),
            ('Monitor', 299.00, 15);
        `);

        const data = db.export();
        const buffer = Buffer.from(data);
        tempDbPath = path.join(os.tmpdir(), `test_sqlite_${Date.now()}.db`);
        fs.writeFileSync(tempDbPath, buffer);
    });

    suiteTeardown(() => {
        if (db) {
            try { db.close(); } catch (e) {}
        }
        if (tempDbPath && fs.existsSync(tempDbPath)) {
            try { fs.unlinkSync(tempDbPath); } catch (e) {}
        }
    });

    test('Engine Initialization & Database Opening from Disk', async () => {
        const loadedDb = await openDatabase(tempDbPath);
        assert.ok(loadedDb, 'Database should open successfully from disk path');
        
        const tables = getTables(loadedDb);
        assert.strictEqual(tables.length, 2, 'Should discover exactly 2 user tables');
        loadedDb.close();
    });

    test('Table Discovery & Row Counting (getTables)', () => {
        const tables = getTables(db);
        assert.strictEqual(tables.length, 2);

        const usersTable = tables.find(t => t.name === 'users');
        const productsTable = tables.find(t => t.name === 'products');

        assert.ok(usersTable, 'users table must exist');
        assert.strictEqual(usersTable?.rowCount, 5, 'users table must have 5 rows');
        
        assert.ok(productsTable, 'products table must exist');
        assert.strictEqual(productsTable?.rowCount, 3, 'products table must have 3 rows');
    });

    test('Table Schema Details (getTableSchema)', () => {
        const schema = getTableSchema(db, 'users');
        assert.ok(schema.length >= 6, 'users schema should contain 6 columns');

        const idCol = schema.find(c => c.name === 'id');
        assert.strictEqual(idCol?.pk, true, 'id column must be primary key');

        const usernameCol = schema.find(c => c.name === 'username');
        assert.strictEqual(usernameCol?.notnull, true, 'username column should be NOT NULL');
    });

    test('Table DDL SQL Statement (getTableDDL)', () => {
        const ddl = getTableDDL(db, 'users');
        assert.ok(ddl.includes('CREATE TABLE users'), 'DDL should contain CREATE TABLE statement');
        assert.ok(ddl.endsWith(';'), 'DDL should end with semicolon');
    });

    test('Pagination & Fetching Data (getTableData)', () => {
        const page1 = getTableData(db, 'users', { page: 1, pageSize: 2 });
        assert.strictEqual(page1.rows.length, 2, 'Page 1 should return 2 rows');
        assert.strictEqual(page1.totalRows, 5, 'Total row count should remain 5');

        const page2 = getTableData(db, 'users', { page: 2, pageSize: 2 });
        assert.strictEqual(page2.rows.length, 2, 'Page 2 should return 2 rows');

        const page3 = getTableData(db, 'users', { page: 3, pageSize: 2 });
        assert.strictEqual(page3.rows.length, 1, 'Page 3 should return remaining 1 row');
    });

    test('Global Search across Columns', () => {
        const searchResult = getTableData(db, 'users', { searchQuery: 'alice' });
        assert.strictEqual(searchResult.rows.length, 1);
        assert.strictEqual(searchResult.rows[0].username, 'alice');

        const htmlSearchResult = getTableData(db, 'users', { searchQuery: 'script' });
        assert.strictEqual(htmlSearchResult.rows.length, 1);
        assert.strictEqual(htmlSearchResult.rows[0].username, 'bob');
    });

    test('Column-level Filtering', () => {
        const filteredResult = getTableData(db, 'users', { 
            columnFilters: { username: 'davi' } 
        });
        assert.strictEqual(filteredResult.rows.length, 1);
        assert.strictEqual(filteredResult.rows[0].username, 'david');
    });

    test('Sorting (ASC & DESC)', () => {
        const ascResult = getTableData(db, 'users', {
            sortState: [{ col: 'username', dir: 'asc' }]
        });
        assert.strictEqual(ascResult.rows[0].username, 'alice');

        const descResult = getTableData(db, 'users', {
            sortState: [{ col: 'username', dir: 'desc' }]
        });
        assert.strictEqual(descResult.rows[0].username, 'eve');
    });

    test('Safe Raw HTML Content Preservation', () => {
        const data = getTableData(db, 'users', { searchQuery: 'bob' });
        assert.strictEqual(data.rows[0].bio, '<script>alert("xss")</script>', 'Raw HTML strings must be returned as unescaped text from DB service layer');
    });

    test('Executing Custom SQL Queries (executeCustomQuery)', () => {
        const selectResult = executeCustomQuery(db, 'SELECT COUNT(*) as total FROM users;');
        assert.strictEqual(selectResult.rows[0].total, 5);
        assert.ok(selectResult.executionTimeMs >= 0);

        const updateResult = executeCustomQuery(db, 'UPDATE users SET balance = 999.99 WHERE username = "alice";');
        assert.strictEqual(updateResult.error, undefined);

        const syntaxErrResult = executeCustomQuery(db, 'SELECT * FORM users;');
        assert.ok(syntaxErrResult.error, 'Invalid SQL should return error string without throwing uncaught exception');
    });

    test('Exporting Data as CSV', () => {
        const csv = exportTableData(db, 'products', 'csv');
        assert.ok(csv.includes('"title"'), 'CSV should contain quoted header title line');
        assert.ok(csv.includes('"Laptop"'), 'CSV should contain row data');
    });

    test('Exporting Data as JSON', () => {
        const jsonStr = exportTableData(db, 'products', 'json');
        const parsed = JSON.parse(jsonStr);
        assert.strictEqual(parsed.length, 3, 'JSON export should contain 3 product objects');
        assert.strictEqual(parsed[0].title, 'Laptop');
    });

    test('Exporting Data as SQL Dump', () => {
        const sqlDump = exportTableData(db, 'products', 'sql');
        assert.ok(sqlDump.includes('INSERT INTO "products"'), 'SQL Dump should contain INSERT statements');
        assert.ok(sqlDump.includes("'Laptop'"), 'SQL Dump should contain inserted values');
    });
});
