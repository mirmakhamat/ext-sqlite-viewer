import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { 
    openDatabase, 
    getTables, 
    getTableSchema, 
    getTableDDL, 
    getTableData, 
    executeCustomQuery, 
    exportTableToFile,
    setExtensionContext,
    Database
} from "./sqliteService";
export function activate(context: vscode.ExtensionContext) {
    setExtensionContext(context);
    const customEditorProvider: vscode.CustomReadonlyEditorProvider = {
        openCustomDocument(uri: vscode.Uri) {
            return { uri, dispose: () => {} };
        },
        async resolveCustomEditor(document: vscode.CustomDocument, webviewPanel: vscode.WebviewPanel) {
            setupWebview(context.extensionUri, webviewPanel, document.uri);
        }
    };

    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider("sqliteViewer.option", customEditorProvider, {
            webviewOptions: { retainContextWhenHidden: true }
        })
    );

    const commandDisposable = vscode.commands.registerCommand(
        "sqlite-viewer.openViewer",
        async (fileUri?: vscode.Uri) => {
            const panel = vscode.window.createWebviewPanel(
                "sqliteViewer",
                "SQLite Viewer",
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [
                        vscode.Uri.joinPath(context.extensionUri, 'src', 'webview')
                    ]
                }
            );

            await setupWebview(context.extensionUri, panel, fileUri);
        }
    );

    context.subscriptions.push(commandDisposable);
}

export function deactivate() {}

async function setupWebview(extensionUri: vscode.Uri, panel: vscode.WebviewPanel, fileUri?: vscode.Uri) {

    panel.webview.options = {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'src', 'webview')]
    };

    panel.webview.html = getWebviewContent(extensionUri, panel.webview);

    let activeDb: Database | null = null;
    let activeDbFilePath: string | null = null;

    if (fileUri && fileUri.fsPath && fs.existsSync(fileUri.fsPath)) {
        activeDbFilePath = fileUri.fsPath;
        activeDb = await loadDatabaseFile(fileUri.fsPath, panel);
    }

    panel.webview.onDidReceiveMessage(
        async message => {
            switch (message.type) {
                case 'openDatabase':
                    const result = await handleOpenDatabaseDialog(panel);
                    if (result) {
                        activeDb = result.db;
                        activeDbFilePath = result.filePath;
                    }
                    break;

                case 'refreshDatabase':
                    if (activeDbFilePath && panel) {
                        try {
                            if (activeDb) {
                                try { activeDb.close(); } catch (e) {}
                                activeDb = null;
                            }
                            activeDb = await openDatabase(activeDbFilePath);

                            const tables = getTables(activeDb);
                            const dbInfo = {
                                name: path.basename(activeDbFilePath),
                                path: activeDbFilePath,
                                status: activeDb.engine === 'sql.js' ? 'Connected (sql.js, no FTS5)' : 'Connected',
                                size: `${(fs.statSync(activeDbFilePath).size / (1024 * 1024)).toFixed(2)} MB`
                            };

                            panel.webview.postMessage({
                                type: 'dbOpened',
                                dbInfo,
                                tables
                            });
                        } catch (err: any) {
                            panel.webview.postMessage({ type: 'refreshFailed', error: err.message });
                        }
                    }
                    break;

                case 'selectTable':
                    if (activeDb) {
                        try {
                            const tableData = getTableData(activeDb, message.tableName, { page: 1, pageSize: 100 });
                            const schema = getTableSchema(activeDb, message.tableName);
                            const ddl = getTableDDL(activeDb, message.tableName);
                            panel.webview.postMessage({
                                type: 'tableDataLoaded',
                                tableName: message.tableName,
                                data: tableData,
                                schema,
                                ddl
                            });
                        } catch (err: any) {
                            vscode.window.showErrorMessage(`Cannot read table "${message.tableName}": ${err.message || String(err)}`);
                        }
                    }
                    break;

                case 'fetchData':
                    if (activeDb && message.tableName) {
                        try {
                            const tableData = getTableData(activeDb, message.tableName, {
                                searchQuery: message.searchQuery,
                                columnFilters: message.columnFilters,
                                sortState: message.sortState,
                                page: message.page,
                                pageSize: message.pageSize
                            });
                            panel.webview.postMessage({
                                type: 'tableDataLoaded',
                                tableName: message.tableName,
                                data: tableData
                            });
                        } catch (err: any) {
                            vscode.window.showErrorMessage(`Cannot read table "${message.tableName}": ${err.message || String(err)}`);
                        }
                    }
                    break;

                case 'executeSql':
                    if (activeDb && message.sql) {
                        const result = executeCustomQuery(activeDb, message.sql);
                        panel.webview.postMessage({
                            type: 'sqlExecuted',
                            result
                        });
                    } else {
                        vscode.window.showWarningMessage('No active database to execute SQL query.');
                    }
                    break;

                case 'exportData':
                    if (activeDb && message.table) {
                        const format = message.format || 'csv';
                        
                        let defaultUri: vscode.Uri | undefined = undefined;
                        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                            defaultUri = vscode.workspace.workspaceFolders[0].uri;
                        } else if (activeDbFilePath) {
                            defaultUri = vscode.Uri.file(path.dirname(activeDbFilePath));
                        }

                        const defaultSaveFileUri = defaultUri
                            ? vscode.Uri.joinPath(defaultUri, `${message.table}.${format}`)
                            : vscode.Uri.file(`${message.table}.${format}`);

                        const filterMap: Record<string, string[]> = {
                            csv: ['csv'],
                            json: ['json'],
                            sql: ['sql']
                        };

                        const saveUri = await vscode.window.showSaveDialog({
                            defaultUri: defaultSaveFileUri,
                            filters: {
                                [`${format.toUpperCase()} File`]: filterMap[format] || [format]
                            }
                        });

                        if (saveUri) {
                            const db = activeDb;
                            try {
                                await vscode.window.withProgress(
                                    { location: vscode.ProgressLocation.Notification, title: `Exporting "${message.table}"…` },
                                    () => exportTableToFile(db, message.table, format, saveUri.fsPath)
                                );
                                vscode.window.showInformationMessage(`Successfully exported table "${message.table}" to ${path.basename(saveUri.fsPath)}`);
                            } catch (err: any) {
                                vscode.window.showErrorMessage(`Export failed: ${err.message || String(err)}`);
                            }
                        }
                    }
                    break;
            }
        }
    );

    panel.onDidDispose(() => {
        if (activeDb) {
            try { activeDb.close(); } catch (e) {}
        }
    });
}

async function handleOpenDatabaseDialog(panel: vscode.WebviewPanel): Promise<{ db: Database; filePath: string } | null> {
    const fileUris = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: 'Open SQLite Database',
        filters: {
            'SQLite Database (*.db, *.sqlite, *.sqlite3)': ['db', 'sqlite', 'sqlite3', 'db3'],
            'All Files': ['*']
        }
    });

    if (fileUris && fileUris.length > 0) {
        const filePath = fileUris[0].fsPath;
        const db = await loadDatabaseFile(filePath, panel);
        if (db) {
            return { db, filePath };
        }
    }
    panel.webview.postMessage({ type: 'openCancelled' });
    return null;
}

async function loadDatabaseFile(filePath: string, panel: vscode.WebviewPanel): Promise<Database | null> {
    try {
        const db = await openDatabase(filePath);
        const tables = getTables(db);
        const dbFileName = path.basename(filePath);

        panel.title = `SQLite: ${dbFileName}`;

        const dbInfo = {
            name: dbFileName,
            path: filePath,
            status: db.engine === 'sql.js' ? 'Connected (sql.js, no FTS5)' : 'Connected',
            size: `${(fs.statSync(filePath).size / (1024 * 1024)).toFixed(2)} MB`
        };

        panel.webview.postMessage({
            type: 'dbOpened',
            dbInfo,
            tables
        });

        if (tables.length > 0) {
            const firstTable = tables[0].name;
            try {
                const data = getTableData(db, firstTable, { page: 1, pageSize: 100 });
                const schema = getTableSchema(db, firstTable);
                const ddl = getTableDDL(db, firstTable);

                panel.webview.postMessage({
                    type: 'tableDataLoaded',
                    tableName: firstTable,
                    data,
                    schema,
                    ddl
                });
            } catch (err: any) {
                // e.g. virtual table whose module (fts5) the engine lacks: keep the DB open.
                vscode.window.showWarningMessage(`SQLite Viewer: cannot read table "${firstTable}": ${err.message || String(err)}`);
            }
        }

        vscode.window.showInformationMessage(`SQLite Viewer: Opened ${dbFileName} (${tables.length} tables)`);
        return db;
    } catch (err: any) {
        console.error('DEBUG STACK:', err && err.stack ? err.stack : err);
        vscode.window.showErrorMessage(`Failed to open SQLite database: ${err.message || String(err)}`);
        panel.webview.postMessage({ type: 'openCancelled' });
        return null;
    }
}

function getWebviewContent(extensionUri: vscode.Uri, webview: vscode.Webview): string {
    const webviewDir = vscode.Uri.joinPath(extensionUri, 'src', 'webview');
    const indexPath = path.join(webviewDir.fsPath, 'index.html');

    let html = fs.readFileSync(indexPath, 'utf8');

    const files = ['styles.css', 'icons.js', 'sidebar.js', 'toolbar.js', 'table.js', 'pagination.js', 'app.js'];
    files.forEach(file => {
        const fileUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewDir, file));
        html = html.replace(`href="${file}"`, `href="${fileUri}"`);
        html = html.replace(`src="${file}"`, `src="${fileUri}"`);
    });

    return html;
}