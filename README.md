# SQLite Viewer for Visual Studio Code

A fast, modern, feature-rich SQLite Database Viewer extension for Visual Studio Code built with Node.js, WebAssembly (`sql.js`), and modern VS Code Native Webview UI.

![SQLite Viewer](https://raw.githubusercontent.com/mirmakhamat/ext-sqlite-viewer/main/media/preview.png)

## ✨ Key Features

- **⚡ Fast SQLite Engine**: Opens databases read-only with VS Code's built-in `node:sqlite`, reading pages from disk, so multi-gigabyte files (over 2 GiB) open without loading them into memory. Falls back to `sql.js` (asm.js/Wasm, files under 2 GiB, no FTS5) when `node:sqlite` is unavailable.
- **🧩 Views & Virtual Tables**: Views and virtual tables (FTS5, FTS3/4, R-Tree) are shown read-only; their internal shadow tables (`docs_data`, `docs_idx`, ...) sit in a collapsed "Internal tables" group.
- **📂 Automatic File Associations**: Opens `.db`, `.sqlite`, `.sqlite3`, and `.db3` files directly on click or double-click in VS Code Explorer.
- **🔍 Multi-Column Live Search**: Search across all columns instantly with in-input spinner feedback.
- **⚡ Independent Column-Level Filtering**: Filter individual table columns with real-time text matching.
- **📊 Multi-Column Sorting**: Click headers to sort by single column or hold `Shift` + click for multi-column priority sorting.
- **↔️ Resizable Layouts**:
  - Resizable Left Sidebar with mouse drag support.
  - **Resizable Table Columns**: Drag column header borders to adjust individual column widths.
  - **Resizable Bottom SQL Console Drawer**: Drag top border to resize terminal height.
- **📋 Table Schema & DDL Viewer**: Tabbed modal displaying PRAGMA column info (PK, Nullable, Default, Type) and full `CREATE TABLE` DDL SQL statements with a 1-click **Copy SQL** button.
- **🖥️ VS Code Terminal Style SQL Console**:
  - Openable bottom drawer panel positioned underneath the table so you can inspect data and execute SQL queries simultaneously.
  - Supports `Ctrl + Enter` (or `Cmd + Enter`) execution.
  - Includes Quick Preset Chips (`SELECT 50`, `COUNT(*)`, `PRAGMA info`, `LIST TABLES`).
  - Detailed metrics (`Execution Time`, `Rows Returned`, `Affected Rows`) and error alerts.
- **📄 Row Details & Safe HTML Escaping**:
  - Custom right-click context menu (**View Row Details**, **Refresh Rows**, **Copy Row JSON**).
  - Row Details modal with un-truncated code block viewing.
  - XSS protection via automatic HTML escaping so `<script>` or HTML tags render as plain text.
- **📤 Multi-Format Export**:
  - Export active table data as **CSV (.csv)**, **JSON (.json)**, or **SQL Dump (.sql)**, streamed to disk so large tables export with low memory use.
  - Automatically defaults save location to active VS Code workspace folder.
- **🎨 Native VS Code Theme & Font Size Integration**: Automatically inherits current VS Code theme colors, font sizes, and UI variables.

---

## 📦 Requirements

- Visual Studio Code `1.125.0` or newer. Nothing else is required: no Node.js, SQLite or other runtime needs to be installed.
- Large files (over 2 GiB) and FTS5 tables need a VS Code build that includes `node:sqlite`. Without it the extension falls back to the bundled `sql.js` (files under 2 GiB, no FTS5).
- Databases open **read-only**; the viewer never modifies your file.

---

## 🚀 Usage

1. Open any `.db`, `.sqlite`, `.sqlite3`, or `.db3` file in VS Code.
2. Or press `Ctrl+Shift+P` / `Cmd+Shift+P` and type **`SQLite Viewer: Open Viewer`**.
3. Select a table from the sidebar to inspect records, filter columns, or execute SQL queries.

---

## 📋 Future Roadmap & TODOs

We are actively developing new capabilities to make SQLite Viewer the ultimate database extension for VS Code:

- [ ] **Inline Cell Editing**: Double-click any cell to edit its value directly and auto-save via `UPDATE` query.
- [ ] **Row Management UI (Add & Delete Row)**: Dedicated UI buttons in toolbar and context menu to insert new rows or delete selected rows without writing SQL.
- [ ] **Foreign Key Navigation**: Detect Foreign Keys (`PRAGMA foreign_key_list`) and convert FK cells into clickable links that jump to referenced rows in target tables.
- [x] **Large Database (>2 GiB) Support**: Done via the native `node:sqlite` engine (read-only, bounded counts and result sizes).
- [ ] **Writable Open Mode for Editing**: Editing must keep views, virtual tables, shadow tables and generated columns read-only, and account for `WITHOUT ROWID`, triggers and foreign keys.
- [ ] **SQL Query Auto-Completion**: Monaco / SQL syntax auto-completion inside the SQL Console editor.

---

## 📄 License

[MIT License](LICENSE)
