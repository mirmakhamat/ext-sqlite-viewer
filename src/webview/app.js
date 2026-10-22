/**
 * Main Webview Application Orchestrator with Bottom SQL Console Panel
 */
(function() {
  let vscode = null;
  if (typeof acquireVsCodeApi === 'function') {
    vscode = acquireVsCodeApi();
  }

  const state = {
    isDbOpen: false,
    activeTableName: '',
    searchQuery: '',
    columnFilters: {},
    sortState: [],
    currentPage: 1,
    pageSize: 100,
    isModalOpen: false,
    isSqlPanelOpen: false,
    dbInfo: {
      name: 'No Database Loaded',
      path: 'No file selected',
      status: 'Disconnected'
    },
    tablesMap: {}
  };

  function init() {
    renderAppSidebar();
    renderAppContent();
    initSidebarResizer();
    bindGlobalKeyListeners();
    bindHostMessageListener();
  }

  function hasActiveFilters() {
    const hasSearch = state.searchQuery && state.searchQuery.trim() !== '';
    const hasColFilter = Object.values(state.columnFilters).some(v => v && String(v).trim() !== '');
    const hasSort = state.sortState && state.sortState.length > 0;
    return !!(hasSearch || hasColFilter || hasSort);
  }

  function updateClearButtonVisibility() {
    const clearBtn = document.getElementById('btn-filters-clear');
    if (clearBtn) {
      clearBtn.style.display = hasActiveFilters() ? 'inline-flex' : 'none';
    }
  }

  function showLoading(title = 'Loading Database...', subtext = 'Reading tables and database schema...') {
    const loadingContainer = document.getElementById('loading-container');
    if (!loadingContainer) {
      return;
    }

    loadingContainer.innerHTML = `
      <div class="loading-overlay">
        <div class="loading-spinner-wrapper">
          <div class="loading-spinner"></div>
        </div>
        <div class="loading-text-group">
          <div class="loading-text">${title}</div>
          <div class="loading-subtext">${subtext}</div>
        </div>
      </div>
    `;
  }

  function hideLoading() {
    const loadingContainer = document.getElementById('loading-container');
    if (loadingContainer) {
      loadingContainer.innerHTML = '';
    }
  }

  function showTableLoading(text = 'Refreshing table rows...') {
    const searchSpinner = document.getElementById('global-search-spinner');
    if (searchSpinner) {
      searchSpinner.style.display = 'block';
    }

    const tableContainer = document.getElementById('table-container');
    if (tableContainer && !tableContainer.querySelector('.table-loading-overlay')) {
      const overlay = document.createElement('div');
      overlay.className = 'table-loading-overlay';
      overlay.id = 'table-inline-loading';
      overlay.innerHTML = `
        <div class="table-loading-badge">
          <div class="table-loading-spinner"></div>
          <span>${text}</span>
        </div>
      `;
      tableContainer.appendChild(overlay);
    }
  }

  function hideTableLoading() {
    const searchSpinner = document.getElementById('global-search-spinner');
    if (searchSpinner) {
      searchSpinner.style.display = 'none';
    }

    const inlineLoading = document.getElementById('table-inline-loading');
    if (inlineLoading) {
      inlineLoading.remove();
    }
  }

  function renderAppSidebar() {
    const sidebarContainer = document.getElementById('sidebar-container');
    Sidebar.render(
      sidebarContainer,
      state.tablesMap,
      state.activeTableName,
      (tableName) => handleTableSelect(tableName),
      () => toggleSqlConsolePanel(),
      () => handleRefreshTables()
    );

    const consoleBtn = sidebarContainer.querySelector('#btn-open-sql-console');
    if (consoleBtn) {
      if (state.isSqlPanelOpen) {
        consoleBtn.classList.add('active');
      } else {
        consoleBtn.classList.remove('active');
      }
    }

    initSidebarResizer();
  }

  function handleRefreshTables() {
    if (!state.isDbOpen) {
      return;
    }
    const sidebarContainer = document.getElementById('sidebar-container');
    if (sidebarContainer) {
      Sidebar.showLoading(sidebarContainer);
    }
    sendMessage('refreshDatabase');
  }

  let isSidebarResizing = false;

  function initSidebarResizer() {
    const sidebar = document.getElementById('sidebar-container');
    const resizer = document.getElementById('sidebar-resizer');
    if (!sidebar || !resizer) {
      return;
    }

    resizer.onmousedown = (e) => {
      e.preventDefault();
      isSidebarResizing = true;
      resizer.classList.add('resizing');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    };

    if (!window._sidebarResizerBound) {
      window._sidebarResizerBound = true;

      document.addEventListener('mousemove', (e) => {
        if (!isSidebarResizing) {
          return;
        }
        const currentSidebar = document.getElementById('sidebar-container');
        if (!currentSidebar || !currentSidebar.parentElement) {
          return;
        }
        const containerRect = currentSidebar.parentElement.getBoundingClientRect();
        let newWidth = e.clientX - containerRect.left;
        if (newWidth < 160) {
          newWidth = 160;
        }
        if (newWidth > 600) {
          newWidth = 600;
        }
        currentSidebar.style.width = newWidth + 'px';
      });

      document.addEventListener('mouseup', () => {
        if (isSidebarResizing) {
          isSidebarResizing = false;
          const currentResizer = document.getElementById('sidebar-resizer');
          if (currentResizer) {
            currentResizer.classList.remove('resizing');
          }
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
        }
      });
    }
  }

  function renderAppContent() {
    if (!state.isDbOpen || !state.activeTableName) {
      renderEmptyState();
      return;
    }

    const tableConfig = state.tablesMap[state.activeTableName] || {
      name: state.activeTableName,
      rowCountDisplay: '0 rows',
      totalRows: 0,
      columns: [],
      rows: []
    };

    const toolbarContainer = document.getElementById('toolbar-container');
    Toolbar.renderTableToolbar(
      toolbarContainer,
      tableConfig,
      {
        onSearch: (q) => handleSearch(q),
        onClearFilters: () => handleClearFilters(),
        onRefreshTable: () => handleRefreshTable(),
        onOpenSchema: () => showSchemaModal(),
        onExport: (format) => sendMessage('exportData', { table: state.activeTableName, format })
      },
      hasActiveFilters(),
      state.dbInfo
    );

    const searchInput = toolbarContainer.querySelector('#global-search-input');
    if (searchInput && state.searchQuery) {
      searchInput.value = state.searchQuery;
    }

    const tableContainer = document.getElementById('table-container');
    if (tableContainer) {
      tableContainer.classList.remove('empty-state-wrapper');
      TableComponent.render(
        tableContainer,
        tableConfig.columns,
        tableConfig.rows,
        state.columnFilters,
        state.sortState,
        (colKey, isShift) => handleSort(colKey, isShift),
        (filters) => handleColumnFilter(filters),
        (rowData) => showRowDetailsModal(rowData),
        () => handleRefreshTable()
      );
    }

    renderPaginationFooter(tableConfig.totalRows || tableConfig.rows.length);
  }

  function renderEmptyState() {
    const toolbarContainer = document.getElementById('toolbar-container');
    if (toolbarContainer) {
      toolbarContainer.innerHTML = '';
    }

    const tableContainer = document.getElementById('table-container');
    if (tableContainer) {
      tableContainer.classList.add('empty-state-wrapper');
      tableContainer.innerHTML = `
        <div class="empty-state-card">
          <div class="empty-state-icon">
            ${Icons.database}
          </div>
          <h2>No Database Loaded</h2>
          <p>Select or double-click a SQLite database file (.db, .sqlite, .sqlite3) to view tables, inspect schemas, and query data.</p>
          <button class="btn-action btn-primary btn-lg" id="btn-empty-open-db">
            ${Icons.folder}
            <span>Open Database File</span>
          </button>
        </div>
      `;

      const openBtn = tableContainer.querySelector('#btn-empty-open-db');
      if (openBtn) {
        openBtn.addEventListener('click', () => {
          showLoading('Opening Database File...', 'Please wait while SQLite reads database headers...');
          sendMessage('openDatabase');
        });
      }
    }

    const paginationContainer = document.getElementById('pagination-container');
    if (paginationContainer) {
      paginationContainer.innerHTML = '';
    }

    const sqlConsoleContainer = document.getElementById('sql-console-container');
    if (sqlConsoleContainer) {
      sqlConsoleContainer.innerHTML = '';
    }
  }

  function renderPaginationFooter(totalFilteredRows) {
    const paginationContainer = document.getElementById('pagination-container');
    Pagination.render(
      paginationContainer,
      state.currentPage,
      totalFilteredRows,
      state.pageSize,
      (page) => handlePageChange(page),
      (pageSize) => handlePageSizeChange(pageSize)
    );
  }

  function toggleSqlConsolePanel() {
    const consoleContainer = document.getElementById('sql-console-container');
    if (!consoleContainer) {
      return;
    }

    const existingPanel = document.getElementById('sql-console-panel');
    if (existingPanel) {
      if (state.isSqlPanelOpen) {
        existingPanel.style.display = 'none';
        state.isSqlPanelOpen = false;
      } else {
        existingPanel.style.display = 'flex';
        state.isSqlPanelOpen = true;
        const textarea = document.getElementById('sql-editor-input');
        if (textarea) {
          textarea.focus();
        }
      }
      renderAppSidebar();
      return;
    }

    state.isSqlPanelOpen = true;
    const defaultTable = state.activeTableName || (Object.keys(state.tablesMap)[0] || 'users');
    const initialSql = defaultTable ? `SELECT * FROM "${defaultTable}" LIMIT 50;` : `SELECT name FROM sqlite_master WHERE type='table';`;

    consoleContainer.innerHTML = `
      <div class="sql-console-panel" id="sql-console-panel">
        <div class="sql-panel-resizer" id="sql-panel-resizer"></div>
        <div class="sql-panel-header">
          <div class="sql-panel-tabs">
            <button class="sql-tab-btn active" id="sql-tab-btn-query">
              ${Icons.terminal}
              <span>Query</span>
            </button>
            <button class="sql-tab-btn" id="sql-tab-btn-results">
              ${Icons.table}
              <span>Results</span>
              <span class="badge" id="sql-results-badge" style="display: none;">0</span>
            </button>
          </div>
          <div class="sql-panel-actions">
            <button class="modal-close-btn" id="btn-minimize-sql-panel" title="Close Console">&times;</button>
          </div>
        </div>

        <div class="sql-panel-content">
          <!-- TAB 1: QUERY PANE -->
          <div class="sql-tab-pane" id="sql-pane-query">
            <div class="sql-preset-chips">
              <span class="preset-label">Quick Presets:</span>
              <button class="preset-chip" data-sql="SELECT * FROM &quot;${defaultTable}&quot; LIMIT 50;">SELECT 50</button>
              <button class="preset-chip" data-sql="SELECT COUNT(*) AS total_count FROM &quot;${defaultTable}&quot;;">COUNT(*)</button>
              <button class="preset-chip" data-sql="PRAGMA table_info(&quot;${defaultTable}&quot;);">PRAGMA info</button>
              <button class="preset-chip" data-sql="SELECT name FROM sqlite_master WHERE type='table';">LIST TABLES</button>
              <button class="preset-chip btn-clear-sql" id="btn-clear-sql-input">Clear</button>
            </div>

            <div class="sql-editor-wrapper">
              <textarea id="sql-editor-input" class="sql-editor-textarea" placeholder="Enter SQL query here... Press Ctrl+Enter to execute" spellcheck="false">${initialSql}</textarea>
              <div class="sql-editor-footer">
                <span class="sql-hint">Press <kbd>Ctrl</kbd> + <kbd>Enter</kbd> to run query</span>
                <button class="btn-action btn-primary" id="btn-run-sql">
                  ${Icons.terminal}
                  <span id="run-sql-btn-text">Run Query</span>
                </button>
              </div>
            </div>
          </div>

          <!-- TAB 2: RESULTS PANE -->
          <div class="sql-tab-pane" id="sql-pane-results" style="display: none;">
            <div class="sql-results-section" id="sql-results-section" style="display: flex;">
              <div class="sql-results-header">
                <div class="sql-metrics" id="sql-metrics">
                  <span class="td-muted">No query executed yet. Run a query in the Query tab.</span>
                </div>
              </div>
              <div class="sql-results-body" id="sql-results-body"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    const panel = consoleContainer.querySelector('#sql-console-panel');
    const textarea = consoleContainer.querySelector('#sql-editor-input');
    const runBtn = consoleContainer.querySelector('#btn-run-sql');
    const clearBtn = consoleContainer.querySelector('#btn-clear-sql-input');
    const closeBtn = consoleContainer.querySelector('#btn-minimize-sql-panel');
    const tabQueryBtn = consoleContainer.querySelector('#sql-tab-btn-query');
    const tabResultsBtn = consoleContainer.querySelector('#sql-tab-btn-results');

    if (tabQueryBtn) {
      tabQueryBtn.addEventListener('click', () => switchSqlConsoleTab('query'));
    }
    if (tabResultsBtn) {
      tabResultsBtn.addEventListener('click', () => switchSqlConsoleTab('results'));
    }

    if (textarea) {
      textarea.focus();
      textarea.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          executeConsoleSql();
        }
      });
    }

    if (runBtn) {
      runBtn.addEventListener('click', executeConsoleSql);
    }

    if (clearBtn && textarea) {
      clearBtn.addEventListener('click', () => {
        textarea.value = '';
        textarea.focus();
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        panel.style.display = 'none';
        state.isSqlPanelOpen = false;
        renderAppSidebar();
      });
    }

    const chips = consoleContainer.querySelectorAll('.preset-chip[data-sql]');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        const sql = chip.getAttribute('data-sql');
        if (sql && textarea) {
          textarea.value = sql;
          textarea.focus();
        }
      });
    });

    initSqlPanelResizer(panel);
    renderAppSidebar();
  }

  function switchSqlConsoleTab(tabName) {
    const queryBtn = document.getElementById('sql-tab-btn-query');
    const resultsBtn = document.getElementById('sql-tab-btn-results');
    const queryPane = document.getElementById('sql-pane-query');
    const resultsPane = document.getElementById('sql-pane-results');

    if (!queryBtn || !resultsBtn || !queryPane || !resultsPane) {
      return;
    }

    if (tabName === 'results') {
      queryBtn.classList.remove('active');
      resultsBtn.classList.add('active');
      queryPane.style.display = 'none';
      resultsPane.style.display = 'flex';
    } else {
      resultsBtn.classList.remove('active');
      queryBtn.classList.add('active');
      resultsPane.style.display = 'none';
      queryPane.style.display = 'flex';
      const textarea = document.getElementById('sql-editor-input');
      if (textarea) {
        textarea.focus();
      }
    }
  }

  function initSqlPanelResizer(panel) {
    const resizer = panel.querySelector('#sql-panel-resizer');
    if (!resizer) {
      return;
    }

    let isResizing = false;

    resizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isResizing = true;
      resizer.classList.add('resizing');
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) {
        return;
      }
      const panelRect = panel.getBoundingClientRect();
      let newHeight = panelRect.bottom - e.clientY;
      if (newHeight < 120) {
        newHeight = 120;
      }
      if (newHeight > window.innerHeight * 0.7) {
        newHeight = window.innerHeight * 0.7;
      }
      panel.style.height = newHeight + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        resizer.classList.remove('resizing');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }

  function executeConsoleSql() {
    const textarea = document.getElementById('sql-editor-input');
    const runBtnText = document.getElementById('run-sql-btn-text');
    if (!textarea || !textarea.value.trim()) {
      return;
    }

    const sql = textarea.value.trim();
    if (runBtnText) {
      runBtnText.textContent = 'Running...';
    }

    switchSqlConsoleTab('results');

    const metricsEl = document.getElementById('sql-metrics');
    if (metricsEl) {
      metricsEl.innerHTML = `<span class="sql-metric-badge">Executing query...</span>`;
    }

    sendMessage('executeSql', { sql });
  }

  function renderSqlConsoleResults(result) {
    const runBtnText = document.getElementById('run-sql-btn-text');
    if (runBtnText) {
      runBtnText.textContent = 'Run Query';
    }

    const badgeEl = document.getElementById('sql-results-badge');
    if (badgeEl) {
      badgeEl.style.display = 'inline-block';
      if (result.error) {
        badgeEl.textContent = '!';
        badgeEl.style.backgroundColor = '#ef4444';
      } else {
        const rowCount = result.rows ? result.rows.length : (result.affectedRows || 0);
        badgeEl.textContent = rowCount.toString();
        badgeEl.style.backgroundColor = '';
      }
    }

    const resultsSection = document.getElementById('sql-results-section');
    const metricsEl = document.getElementById('sql-metrics');
    const bodyEl = document.getElementById('sql-results-body');

    if (!resultsSection || !metricsEl || !bodyEl) {
      return;
    }

    resultsSection.style.display = 'flex';

    if (result.error) {
      metricsEl.innerHTML = `
        <span class="sql-metric-badge error-badge">SQL Execution Failed</span>
        <span>Time: ${result.executionTimeMs}ms</span>
      `;
      bodyEl.innerHTML = `<div class="sql-error-alert">${escapeHtml(result.error)}</div>`;
      return;
    }

    const timeMs = result.executionTimeMs || 0;
    const rowCount = result.rows ? result.rows.length : (result.affectedRows || 0);

    metricsEl.innerHTML = `
      <span class="sql-metric-badge">✓ Query Executed</span>
      <span>${rowCount.toLocaleString()}${result.truncated ? '+ (first rows only)' : ''} row(s)</span>
      <span>•</span>
      <span>Time: ${timeMs}ms</span>
    `;

    if (!result.columns || result.columns.length === 0) {
      bodyEl.innerHTML = `
        <div class="sql-success-alert">
          ${Icons.check}
          <span>Statement executed successfully in ${timeMs}ms. ${result.affectedRows || 0} row(s) affected.</span>
        </div>
      `;
      return;
    }

    const cols = result.columns;
    const rows = result.rows || [];

    bodyEl.innerHTML = `
      <div class="schema-table-scroll-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              ${cols.map(c => `<th>${escapeHtml(c)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rows.length === 0 ? `
              <tr><td colspan="${cols.length}" style="text-align: center; color: var(--text-muted); padding: 24px;">No rows returned</td></tr>
            ` : rows.map(r => `
              <tr>
                ${cols.map(c => {
                  const val = r[c];
                  let displayVal = '';
                  if (val === null || val === undefined) {
                    displayVal = '<span class="td-muted">NULL</span>';
                  } else {
                    displayVal = escapeHtml(String(val));
                  }
                  return `<td>${displayVal}</td>`;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function showSchemaModal() {
    state.isModalOpen = true;
    const tableConfig = state.tablesMap[state.activeTableName] || {};
    const schemaFields = tableConfig.schema || [];
    const ddlText = tableConfig.ddl || `-- DDL unavailable for ${state.activeTableName}`;
    const modalContainer = document.getElementById('modal-container');
    
    if (!modalContainer) {
      return;
    }

    modalContainer.innerHTML = `
      <div class="modal-overlay" id="schema-modal-overlay">
        <div class="modal-card">
          <div class="modal-header">
            <div class="modal-title">
              ${Icons.schema}
              <span>Table Schema: <strong>${state.activeTableName}</strong></span>
            </div>
            <button class="modal-close-btn" id="modal-close-x-btn" title="Close">&times;</button>
          </div>

          <div class="modal-tabs-bar">
            <button class="modal-tab-btn active" id="tab-btn-schema">
              ${Icons.table}
              <span>Table Structure</span>
              <span class="badge">${schemaFields.length}</span>
            </button>
            <button class="modal-tab-btn" id="tab-btn-ddl">
              ${Icons.terminal}
              <span>SQL Statement</span>
            </button>
          </div>

          <div class="modal-body">
            <div class="modal-tab-content" id="tab-content-schema">
              <div class="schema-table-scroll-wrapper">
                <table class="schema-table">
                  <thead>
                    <tr>
                      <th>Column Name</th>
                      <th>Data Type</th>
                      <th>Key</th>
                      <th>Nullable</th>
                      <th>Default Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${schemaFields.map(f => `
                      <tr>
                        <td style="font-weight: 600;">${escapeHtml(f.name || f.field)}</td>
                        <td><span class="type-pill">${escapeHtml(f.type)}</span></td>
                        <td>${f.pk ? '<span class="pk-badge">PK</span>' : '<span class="td-muted">-</span>'}</td>
                        <td>${f.notnull === false || f.nullable ? '<span class="nullable-badge">YES</span>' : '<span class="not-null-badge">NOT NULL</span>'}</td>
                        <td style="font-family: var(--font-mono); color: var(--text-secondary);">${escapeHtml(f.dflt_value || f.defaultVal || 'NULL')}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>

            <div class="modal-tab-content" id="tab-content-ddl" style="display: none;">
              <div class="ddl-header-actions">
                <label>CREATE TABLE STATEMENT</label>
                <button class="btn-action btn-sm" id="btn-copy-sql">
                  ${Icons.copy}
                  <span id="copy-sql-text">Copy SQL</span>
                </button>
              </div>
              <pre class="sql-code-block" id="ddl-code-block">${escapeHtml(ddlText)}</pre>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn-action" id="modal-close-btn">Close</button>
          </div>
        </div>
      </div>
    `;

    const tabBtnSchema = modalContainer.querySelector('#tab-btn-schema');
    const tabBtnDdl = modalContainer.querySelector('#tab-btn-ddl');
    const tabContentSchema = modalContainer.querySelector('#tab-content-schema');
    const tabContentDdl = modalContainer.querySelector('#tab-content-ddl');

    if (tabBtnSchema && tabBtnDdl) {
      tabBtnSchema.addEventListener('click', () => {
        tabBtnSchema.classList.add('active');
        tabBtnDdl.classList.remove('active');
        tabContentSchema.style.display = 'flex';
        tabContentDdl.style.display = 'none';
      });

      tabBtnDdl.addEventListener('click', () => {
        tabBtnDdl.classList.add('active');
        tabBtnSchema.classList.remove('active');
        tabContentDdl.style.display = 'flex';
        tabContentSchema.style.display = 'none';
      });
    }

    const copyBtn = modalContainer.querySelector('#btn-copy-sql');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        copyToClipboard(ddlText);
        copyBtn.innerHTML = `${Icons.check} <span id="copy-sql-text">Copied!</span>`;
        copyBtn.classList.add('btn-primary');
        setTimeout(() => {
          copyBtn.innerHTML = `${Icons.copy} <span id="copy-sql-text">Copy SQL</span>`;
          copyBtn.classList.remove('btn-primary');
        }, 2000);
      });
    }

    const closeXBtn = modalContainer.querySelector('#modal-close-x-btn');
    const closeFooterBtn = modalContainer.querySelector('#modal-close-btn');
    const overlay = modalContainer.querySelector('#schema-modal-overlay');

    if (closeXBtn) {
      closeXBtn.addEventListener('click', hideModal);
    }
    if (closeFooterBtn) {
      closeFooterBtn.addEventListener('click', hideModal);
    }
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          hideModal();
        }
      });
    }
  }

  function showRowDetailsModal(rowData) {
    state.isModalOpen = true;
    const modalContainer = document.getElementById('modal-container');
    if (!modalContainer) {
      return;
    }

    const rowKeys = Object.keys(rowData || {});

    modalContainer.innerHTML = `
      <div class="modal-overlay" id="row-details-modal-overlay">
        <div class="modal-card modal-card-lg">
          <div class="modal-header">
            <div class="modal-title">
              ${Icons.eye}
              <span>Row Record Details: <strong>${state.activeTableName}</strong></span>
            </div>
            <button class="modal-close-btn" id="row-modal-close-x-btn" title="Close">&times;</button>
          </div>

          <div class="modal-body">
            <div class="row-details-table-wrapper">
              <table class="row-details-table">
                <thead>
                  <tr>
                    <th>Column Field</th>
                    <th>Full Record Value</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowKeys.map(key => {
                    const val = rowData[key];
                    let displayVal = '';
                    if (val === null || val === undefined) {
                      displayVal = 'NULL';
                    } else if (typeof val === 'object') {
                      displayVal = JSON.stringify(val, null, 2);
                    } else {
                      displayVal = String(val);
                    }
                    return `
                      <tr>
                        <td class="field-name-td">${escapeHtml(key)}</td>
                        <td><pre class="cell-detail-pre">${escapeHtml(displayVal)}</pre></td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn-action" id="btn-copy-row-json">
              ${Icons.copy}
              <span>Copy Row JSON</span>
            </button>
            <button class="btn-action btn-primary" id="row-modal-close-btn">Close</button>
          </div>
        </div>
      </div>
    `;

    const copyJsonBtn = modalContainer.querySelector('#btn-copy-row-json');
    if (copyJsonBtn) {
      copyJsonBtn.addEventListener('click', () => {
        copyToClipboard(JSON.stringify(rowData, null, 2));
        copyJsonBtn.innerHTML = `${Icons.check} <span>Copied JSON!</span>`;
        copyJsonBtn.classList.add('btn-primary');
        setTimeout(() => {
          copyJsonBtn.innerHTML = `${Icons.copy} <span>Copy Row JSON</span>`;
          copyJsonBtn.classList.remove('btn-primary');
        }, 2000);
      });
    }

    const closeXBtn = modalContainer.querySelector('#row-modal-close-x-btn');
    const closeFooterBtn = modalContainer.querySelector('#row-modal-close-btn');
    const overlay = modalContainer.querySelector('#row-details-modal-overlay');

    if (closeXBtn) {
      closeXBtn.addEventListener('click', hideModal);
    }
    if (closeFooterBtn) {
      closeFooterBtn.addEventListener('click', hideModal);
    }
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          hideModal();
        }
      });
    }
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) {
      return '';
    }
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function hideModal() {
    state.isModalOpen = false;
    const modalContainer = document.getElementById('modal-container');
    if (modalContainer) {
      modalContainer.innerHTML = '';
    }
  }

  function bindGlobalKeyListeners() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.isModalOpen) {
        hideModal();
      }
    });
  }

  function bindHostMessageListener() {
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg) {
        return;
      }

      switch (msg.type) {
        case 'openCancelled':
        case 'dbOpenFailed':
          hideLoading();
          hideTableLoading();
          break;

        case 'dbOpened':
          hideLoading();
          hideTableLoading();
          const sidebarContainer = document.getElementById('sidebar-container');
          if (sidebarContainer) {
            Sidebar.hideLoading(sidebarContainer);
          }

          state.isDbOpen = true;
          state.dbInfo = msg.dbInfo;
          
          state.tablesMap = {};
          msg.tables.forEach(t => {
            state.tablesMap[t.name] = {
              name: t.name,
              rowCountDisplay: `${t.rowCount.toLocaleString()}${t.rowCountCapped ? '+' : ''} rows`,
              totalRows: t.rowCount,
              kind: t.kind,
              shadowOf: t.shadowOf,
              readOnly: !!t.readOnly,
              badgeCount: t.badgeCount,
              columns: [],
              rows: [],
              schema: [],
              ddl: ''
            };
          });

          renderAppSidebar();

          if (msg.tables.length === 0) {
            renderAppContent();
          } else if (state.activeTableName && state.tablesMap[state.activeTableName]) {
            fetchRealDbData();
          }
          break;

        case 'tableDataLoaded':
          hideLoading();
          hideTableLoading();
          const sContainer = document.getElementById('sidebar-container');
          if (sContainer) {
            Sidebar.hideLoading(sContainer);
          }

          state.isDbOpen = true;
          const tableConfig = state.tablesMap[msg.tableName] || {};
          tableConfig.name = msg.tableName;
          tableConfig.columns = msg.data.columns;
          tableConfig.rows = msg.data.rows;
          tableConfig.totalRows = msg.data.totalRows;
          tableConfig.totalCapped = !!msg.data.totalCapped;
          tableConfig.rowCountDisplay = `${msg.data.totalRows.toLocaleString()}${tableConfig.totalCapped ? '+' : ''} rows`;
          
          if (msg.schema) {
            tableConfig.schema = msg.schema;
          }
          if (msg.ddl) {
            tableConfig.ddl = msg.ddl;
          }

          state.tablesMap[msg.tableName] = tableConfig;
          state.activeTableName = msg.tableName;

          const activeEl = document.activeElement;
          const isTyping = activeEl && (
            activeEl.id === 'global-search-input' || 
            activeEl.classList.contains('col-filter-val') || 
            activeEl.classList.contains('table-filter-input') ||
            activeEl.id === 'sql-editor-input'
          );

          updateClearButtonVisibility();

          if (isTyping) {
            const cursorStart = activeEl.selectionStart;
            const cursorEnd = activeEl.selectionEnd;

            const tableContainer = document.getElementById('table-container');
            TableComponent.updateHeaderSortIcons(tableContainer, tableConfig.columns, state.sortState);
            TableComponent.updateTbody(tableContainer, tableConfig.columns, tableConfig.rows, (rowData) => showRowDetailsModal(rowData), () => handleRefreshTable());
            renderPaginationFooter(tableConfig.totalRows || tableConfig.rows.length);

            activeEl.focus();
            if (typeof cursorStart === 'number' && typeof cursorEnd === 'number') {
              try {
                activeEl.setSelectionRange(cursorStart, cursorEnd);
              } catch (e) {}
            }
          } else {
            renderAppSidebar();
            renderAppContent();
          }
          break;

        case 'sqlExecuted':
          if (msg.result) {
            renderSqlConsoleResults(msg.result);
          }
          break;

        case 'refreshFailed':
          hideLoading();
          hideTableLoading();
          const sbContainer = document.getElementById('sidebar-container');
          if (sbContainer) {
            Sidebar.hideLoading(sbContainer);
          }
          break;
      }
    });
  }

  function handleTableSelect(tableName) {
    showLoading(`Loading Table: ${tableName}`, 'Fetching rows and column metadata...');
    state.activeTableName = tableName;
    state.currentPage = 1;
    state.searchQuery = '';
    state.columnFilters = {};
    state.sortState = [];

    if (state.isDbOpen) {
      sendMessage('selectTable', { tableName });
    }
  }

  function handleSearch(query) {
    showTableLoading('Searching across columns...');
    state.searchQuery = query;
    state.currentPage = 1;
    updateClearButtonVisibility();
    fetchRealDbData();
  }

  function handleColumnFilter(filters) {
    showTableLoading('Filtering columns...');
    state.columnFilters = filters || {};
    state.currentPage = 1;
    updateClearButtonVisibility();
    fetchRealDbData();
  }

  function handleClearFilters() {
    showTableLoading('Clearing filters...');
    state.searchQuery = '';
    state.columnFilters = {};
    state.sortState = [];

    const tableContainer = document.getElementById('table-container');
    if (tableContainer) {
      tableContainer.querySelectorAll('.col-filter-val, .table-filter-input').forEach(i => i.value = '');
    }

    const globalSearchInput = document.getElementById('global-search-input');
    if (globalSearchInput) {
      globalSearchInput.value = '';
    }

    updateClearButtonVisibility();
    fetchRealDbData();
  }

  function handleRefreshTable() {
    showTableLoading('Refreshing table rows...');
    if (state.activeTableName) {
      fetchRealDbData();
    }
  }

  function handleSort(colKey, isShift) {
    showTableLoading('Sorting data...');
    const existingIdx = state.sortState.findIndex(r => r.col === colKey);

    if (!isShift) {
      if (existingIdx >= 0) {
        const currentDir = state.sortState[existingIdx].dir;
        if (currentDir === 'asc') {
          state.sortState = [{ col: colKey, dir: 'desc' }];
        } else {
          state.sortState = [];
        }
      } else {
        state.sortState = [{ col: colKey, dir: 'asc' }];
      }
    } else {
      if (existingIdx >= 0) {
        const currentDir = state.sortState[existingIdx].dir;
        if (currentDir === 'asc') {
          state.sortState[existingIdx].dir = 'desc';
        } else {
          state.sortState.splice(existingIdx, 1);
        }
      } else {
        state.sortState.push({ col: colKey, dir: 'asc' });
      }
    }

    updateClearButtonVisibility();
    fetchRealDbData();
  }

  function handlePageChange(page) {
    showTableLoading(`Loading page ${page}...`);
    state.currentPage = page;
    fetchRealDbData();
  }

  function handlePageSizeChange(pageSize) {
    showTableLoading(`Changing page size to ${pageSize}...`);
    state.pageSize = pageSize;
    state.currentPage = 1;
    fetchRealDbData();
  }

  function fetchRealDbData() {
    if (!state.isDbOpen || !state.activeTableName) {
      hideLoading();
      hideTableLoading();
      return;
    }

    sendMessage('fetchData', {
      tableName: state.activeTableName,
      searchQuery: state.searchQuery,
      columnFilters: state.columnFilters,
      sortState: state.sortState,
      page: state.currentPage,
      pageSize: state.pageSize
    });
  }

  function sendMessage(type, payload = {}) {
    if (vscode) {
      vscode.postMessage({ type, ...payload });
    } else {
      console.log('PostMessage [Mock]:', type, payload);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
