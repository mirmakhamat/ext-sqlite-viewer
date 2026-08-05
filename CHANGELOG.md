# Change Log

All notable changes to the "SQLite Viewer" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
