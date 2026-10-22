# Change Log

All notable changes to the "SQLite Viewer" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-22

### Added
- **Native SQLite engine (`node:sqlite`)**: Databases are opened read-only straight from disk, so files larger than 2 GiB open without loading them into memory (fixes `File size (...) is greater than 2 GiB`). `sql.js` remains as an automatic fallback for files under 2 GiB when `node:sqlite` is unavailable in the running VS Code. Works on Linux, Windows and macOS with no per-platform binary.
- **Engine indicator**: The connection status shows `Connected (sql.js, no FTS5)` when the fallback is in use.
- **Views**: Views are listed in the sidebar (marked `view`), open like tables, and are read-only.
- **Internal tables group**: Shadow tables of virtual tables (FTS5, FTS3/4, R-Tree, e.g. `docs_data`, `docs_idx`) are moved into a collapsed, read-only "Internal tables" group. Detection uses SQLite's own `PRAGMA table_list`, so an ordinary table such as `docs_notes` stays in the main list. Searching the sidebar expands it.
- **Read-only metadata for future editing**: Each table carries `kind`, `shadowOf` and `readOnly`; each column carries `generated`.
- **Streaming export**: CSV, JSON and SQL export now streams rows to the file in chunks with a progress notification, with no 10,000-row limit.
- **`demo.db` edge-case fixtures**: FTS5, FTS4, R-Tree, generated columns, views, `WITHOUT ROWID`, no-PK, `STRICT`, foreign keys with cascade, trigger, BLOB / huge integer / long text / unicode values, an awkwardly named table and an empty table.

### Changed & Improved
- **Bounded row counts**: Sidebar badges count at most 100,000 rows (`100K+`) and the table view at most 1,000,000 (`1,000,000+ rows`) instead of a full `COUNT(*)` scan.
- **Bounded SQL console results**: Custom queries stream and stop at 10,000 rows (shown as "first rows only").
- **Lighter cells**: BLOB values display as `[BLOB N bytes]` and text over 5,000 characters is truncated in the UI; exports keep full values (BLOBs as hex).
- **Low memory footprint**: Native connection uses a 16 MB page cache with mmap disabled.
- **Generated columns**: Table schema uses `PRAGMA table_xinfo`, so generated columns get headers; hidden virtual-table columns are skipped. Composite primary keys mark every key column as `PK`. SQL export skips generated columns in `INSERT` statements.

### Fixed
- **Database no longer fails to open when one table is unreadable**: A table the engine cannot read (e.g. an FTS5 table under `sql.js`, `no such module: fts5`) now shows a warning instead of aborting the whole open. Table selection and paging errors are reported instead of leaving the webview stuck.
- **Table names containing `"`** are now escaped when counting rows.

### Known limitations
- The native connection is read-only, so `INSERT` / `UPDATE` / `DELETE` in the SQL console fail. Editing will require a writable open mode.
- Shadow tables are detected through `PRAGMA table_list`, which needs the virtual-table module. Under the `sql.js` fallback, FTS5 shadow tables are not grouped.
- Search (`LIKE`) and sorting on unindexed columns still scan the whole table; deep `OFFSET` pages are slow on very large tables.
- A native query runs one statement; extra statements in the same input are ignored.

## [0.0.4] - 2026-08-22

### Fixed
- **Resolved WebAssembly Module Loading Issue**: Fixed `Cannot set properties of undefined (setting 'exports')` runtime error in Webpack CommonJS bundle by adding `webpack-sql-wasm-loader` to normalize Emscripten exports.
- **Standalone WebAssembly SQLite Engine**: Directly bundled `sql-wasm.wasm` into the distribution package with instant in-memory binary instantiation, eliminating external runtime dependency on `node_modules`.

### Changed & Improved
- **Unified Header & Toolbar Layout**: Merged the top `.app-header` container directly into the table toolbar, maximizing vertical screen real estate and displaying clean database file names (`demo.db`) instead of long paths.
- **Tabbed SQL Console Drawer**: Divided the SQL terminal into dedicated **Query** and **Results** tabs with automatic switching to Results upon `Run Query` / `Ctrl+Enter`.
- **Optimized Marketplace Icon**: Replaced icon with transparent 256x256 RGBA asset.
- **UI & Layout Polish**: Refined sidebar tree row height, native font integration, and resizable layout handles.

## [0.0.1] - 2026-08-05

### Added
- **High Performance SQLite Engine**: Integrated `sql.js` (asm.js/Wasm) for fast in-memory SQLite querying and table scanning.
- **Automatic File Associations**: Registered custom editor for `.db`, `.sqlite`, `.sqlite3`, and `.db3` files in VS Code.
- **Live In-Input Search**: Added live multi-column global search with loading spinner inside search input.
- **Column-Level Filtering**: Independent text filtering per table column under header titles.
- **Multi-Column Sorting**: Single click header sorting and `Shift` + click multi-column priority sorting with numerical badges.
- **VS Code Terminal Style SQL Console**: Added a collapsible bottom drawer panel with quick preset chips (`SELECT 50`, `COUNT(*)`, `PRAGMA info`, `LIST TABLES`), `Ctrl+Enter` shortcut execution, execution time metrics, and detailed error alerts.
- **Resizable Layouts**:
  - Resizable Left Sidebar with mouse drag support.
  - **Resizable Table Columns**: Mouse drag dividers to adjust individual column widths.
  - **Resizable Bottom SQL Drawer**: Top drag bar to adjust terminal panel height.
- **Table Schema & DDL Viewer**: Tabbed modal displaying PRAGMA column details (PK, Nullable, Default, Type) and full `CREATE TABLE` DDL SQL with 1-click Copy SQL button.
- **Row Record Details Modal & Context Menu**: Right-click context menu (**View Row Details**, **Refresh Rows**, **Copy Row JSON**) and double-click row details modal.
- **Safe HTML Escaping**: Automatic HTML/XSS escaping ensuring raw code and HTML tags display as plain text instead of executing in DOM.
- **Multi-Format Exporting**: Export active table data as CSV (`.csv`), JSON (`.json`), or SQL Dump (`.sql`) defaulting to active VS Code workspace folder.
- **Unit & Integration Test Suite**: 14 automated tests covering database engine setup, pagination, search, sorting, filtering, HTML safety, custom queries, export formats, and VS Code extension lifecycle.
