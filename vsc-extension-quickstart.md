# SQLite Viewer Extension Quickstart Guide

This guide helps you develop, debug, test, and package the **SQLite Viewer** VS Code Extension.

---

## 📁 Project Structure

- `package.json` - Manifest declaring extension activation events, custom editor file associations (`*.db`, `*.sqlite`, `*.sqlite3`), commands (`sqlite-viewer.openViewer`), scripts, and dependencies.
- `src/extension.ts` - Main Extension Host entry point. Registers custom editor provider, panel management, and Webview message handlers.
- `src/sqliteService.ts` - High-performance SQLite engine service using `sql.js` (asm.js/Wasm) for database reading, querying, schema inspection, custom SQL execution, and export formatting.
- `src/webview/` - Modern VS Code Native Webview UI component files:
  - `index.html` - App Webview shell structure.
  - `styles.css` - Native VS Code theme variable integration, resizable layouts, animations, and modals.
  - `icons.js` - SVG icons module.
  - `sidebar.js` - Resizable left sidebar table list.
  - `toolbar.js` - Global search, schema button, row refresh, and export format dropdown.
  - `table.js` - Data table component with HTML escaping, resizable column headers, multi-sort, column filter inputs, and row context menu.
  - `pagination.js` - Footer controls and per-page selector.
  - `app.js` - Main Webview orchestrator handling state and bottom SQL Console drawer.
- `src/test/` - Unit and integration test suite (`sqliteService.test.ts` & `extension.test.ts`).

---

## ⚙️ Quick Start Development Workflow

1. **Install Dependencies**:
   ```bash
   pnpm install
   ```

2. **Compile Extension**:
   ```bash
   pnpm run compile
   ```

3. **Launch & Debug Extension**:
   - Press `F5` in VS Code to launch a new **Extension Development Host** window.
   - Open any `.db` or `.sqlite` file, or open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and select **`SQLite Viewer: Open Viewer`**.

4. **Run Linter**:
   ```bash
   pnpm run lint
   ```

5. **Run Automated Test Suite**:
   ```bash
   pnpm run test
   ```

6. **Package Extension (.vsix)**:
   ```bash
   pnpm run package
   ```
