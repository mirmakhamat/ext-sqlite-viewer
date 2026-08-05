/**
 * Toolbar & Header Component (Open Database removed from App Header)
 */
const Toolbar = {
  renderHeader(container, dbInfo) {
    const hasActiveDb = dbInfo && dbInfo.path && dbInfo.path !== 'No file selected';

    container.innerHTML = `
      <div class="header-left">
        <div class="app-logo-badge">
          ${Icons.database}
        </div>
        <span class="app-title">SQLite Viewer</span>
      </div>

      <div class="header-center">
        ${hasActiveDb ? `
          <div class="db-path-pill">
            ${Icons.database}
            <span>${dbInfo.path}</span>
            <span class="status-dot" title="${dbInfo.status}"></span>
          </div>
        ` : ''}
      </div>

      <div class="header-right"></div>
    `;
  },

  renderTableToolbar(container, tableConfig, handlers, hasActiveFilters = false, dbInfo = null) {
    const dbFileName = (dbInfo && dbInfo.name && dbInfo.name !== 'No Database Loaded') ? dbInfo.name : '';

    container.innerHTML = `
      <div class="table-title-header">
        ${dbFileName ? `
          <div class="db-name-pill" title="${dbInfo.path || dbFileName}">
            ${Icons.database}
            <span>${dbFileName}</span>
            <span class="status-dot" title="${dbInfo.status || 'Connected'}"></span>
          </div>
          <span class="title-separator">/</span>
        ` : ''}
        <div class="table-title">
          ${Icons.table}
          <span>${tableConfig.name}</span>
        </div>
        <span class="table-row-count-badge">${tableConfig.rowCountDisplay}</span>
      </div>

      <div class="toolbar-section">
        <div class="toolbar-top">
          <div class="global-search-wrapper" id="global-search-wrapper">
            ${Icons.search}
            <input type="text" class="global-search-input" id="global-search-input" placeholder="Search in all columns..." />
            <div class="input-spinner" id="global-search-spinner" style="display: none;"></div>
          </div>

          <div class="toolbar-actions">
            <button class="btn-action" id="btn-table-refresh" title="Reload current table rows from database">
              ${Icons.refresh}
              <span>Refresh Rows</span>
            </button>

            <button class="btn-action" id="btn-filters-clear" style="${hasActiveFilters ? '' : 'display: none;'}">
              ${Icons.clear}
              <span>Clear</span>
            </button>

            <button class="btn-action" id="btn-table-schema">
              ${Icons.schema}
              <span>Schema</span>
            </button>

            <!-- Export Dropdown -->
            <div class="export-dropdown-wrapper" id="export-dropdown-wrapper">
              <button class="btn-action btn-primary" id="btn-export-dropdown">
                ${Icons.export}
                <span>Export</span>
                ${Icons.chevronDown}
              </button>
              <div class="export-dropdown-menu" id="export-dropdown-menu" style="display: none;">
                <div class="export-dropdown-item" data-format="csv">
                  ${Icons.fileText}
                  <span>Export as CSV (.csv)</span>
                </div>
                <div class="export-dropdown-item" data-format="json">
                  ${Icons.fileCode}
                  <span>Export as JSON (.json)</span>
                </div>
                <div class="export-dropdown-item" data-format="sql">
                  ${Icons.database}
                  <span>Export as SQL Dump (.sql)</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    `;

    this.bindToolbarEvents(container, handlers);
  },

  bindToolbarEvents(container, handlers) {
    const searchInput = container.querySelector('#global-search-input');
    const clearBtn = container.querySelector('#btn-filters-clear');
    const refreshTableBtn = container.querySelector('#btn-table-refresh');
    const schemaBtn = container.querySelector('#btn-table-schema');
    const exportBtn = container.querySelector('#btn-export-dropdown');
    const exportMenu = container.querySelector('#export-dropdown-menu');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        if (handlers && handlers.onSearch) {
          handlers.onSearch(e.target.value);
        }
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (handlers && handlers.onClearFilters) {
          handlers.onClearFilters();
        }
      });
    }

    if (refreshTableBtn) {
      refreshTableBtn.addEventListener('click', () => {
        const svg = refreshTableBtn.querySelector('svg');
        if (svg) {
          svg.style.transition = 'transform 0.4s ease';
          svg.style.transform = 'rotate(360deg)';
          setTimeout(() => {
            svg.style.transform = '';
          }, 400);
        }
        if (handlers && handlers.onRefreshTable) {
          handlers.onRefreshTable();
        }
      });
    }

    if (schemaBtn) {
      schemaBtn.addEventListener('click', () => {
        if (handlers && handlers.onOpenSchema) {
          handlers.onOpenSchema();
        }
      });
    }

    if (exportBtn && exportMenu) {
      exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = exportMenu.style.display === 'flex';
        exportMenu.style.display = isOpen ? 'none' : 'flex';
      });

      const exportItems = exportMenu.querySelectorAll('.export-dropdown-item');
      exportItems.forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const format = item.getAttribute('data-format') || 'csv';
          exportMenu.style.display = 'none';
          if (handlers && handlers.onExport) {
            handlers.onExport(format);
          }
        });
      });

      document.addEventListener('click', (e) => {
        if (!container.querySelector('#export-dropdown-wrapper')?.contains(e.target)) {
          exportMenu.style.display = 'none';
        }
      });
    }
  }
};

if (typeof module !== 'undefined') {
  module.exports = Toolbar;
}
