/**
 * Sidebar Component (With Dedicated Sidebar Loading Indicator)
 */
const Sidebar = {
  render(container, tablesMap, activeTableName, onTableSelect, onOpenSqlConsole, onRefreshTables) {
    const tablesList = Object.values(tablesMap || {});

    container.innerHTML = `
      <div class="sidebar-resizer" id="sidebar-resizer"></div>
      <div class="sidebar-main">
        <div class="sidebar-section">
          <div class="sidebar-section-header">
            <span>Tables (${tablesList.filter(t => !t.shadowOf).length})</span>
            <button class="icon-btn btn-sm" id="refresh-tables-btn" title="Refresh Tables">
              ${Icons.refresh}
            </button>
          </div>

          <div class="search-input-wrapper">
            ${Icons.search}
            <input type="text" class="search-input" id="sidebar-table-search" placeholder="Search tables..." />
          </div>

          <div class="nav-list" id="sidebar-tables-list">
            ${this.renderTablesList(tablesList, activeTableName)}
          </div>
        </div>
      </div>

      <div class="sidebar-footer">
        <button class="sql-console-btn" id="btn-open-sql-console">
          ${Icons.terminal}
          <span>SQL Console</span>
        </button>
      </div>
    `;

    this.bindEvents(container, tablesList, activeTableName, onTableSelect, onOpenSqlConsole, onRefreshTables);
  },

  showLoading(container) {
    const refreshBtn = container.querySelector('#refresh-tables-btn');
    if (refreshBtn) {
      const svg = refreshBtn.querySelector('svg');
      if (svg) {
        svg.style.animation = 'spin 0.75s linear infinite';
      }
    }
  },

  hideLoading(container) {
    const refreshBtn = container.querySelector('#refresh-tables-btn');
    if (refreshBtn) {
      const svg = refreshBtn.querySelector('svg');
      if (svg) {
        svg.style.animation = '';
        svg.style.transform = '';
      }
    }
  },

  // Internal (shadow) tables live in a collapsed group; they are read-only.
  shadowOpen: false,

  renderItem(t, activeTableName) {
    const isActive = t.name === activeTableName;
    return `
        <div class="nav-item ${isActive ? 'active' : ''}" data-table-name="${this.escapeAttr(t.name)}">
          <div class="nav-item-content">
            ${Icons.table}
            <span title="${this.escapeAttr(t.name)}">${this.escapeHtml(t.name)}</span>
            ${t.kind === 'view' ? '<span class="nav-kind">view</span>' : ''}
          </div>
          <span class="badge">${t.badgeCount || t.rowCountDisplay || '0'}</span>
        </div>
      `;
  },

  renderTablesList(tablesList, activeTableName, forceOpen = false) {
    if (!tablesList || tablesList.length === 0) {
      return `<div style="padding: 12px; font-size: calc(var(--font-size-base) - 1px); color: var(--text-muted); text-align: center;">No tables found.</div>`;
    }

    const main = tablesList.filter(t => !t.shadowOf);
    const shadow = tablesList.filter(t => t.shadowOf);
    const open = this.shadowOpen || forceOpen;

    let html = main.map(t => this.renderItem(t, activeTableName)).join('');
    if (shadow.length > 0) {
      html += `
        <div class="nav-group-header" id="shadow-group-toggle" title="Internal tables of virtual tables (read-only)">
          <span>${open ? '▾' : '▸'} Internal tables (${shadow.length}) · read-only</span>
        </div>
        ${open ? shadow.map(t => this.renderItem(t, activeTableName)).join('') : ''}
      `;
    }
    return html;
  },

  bindEvents(container, tablesList, activeTableName, onTableSelect, onOpenSqlConsole, onRefreshTables) {
    const searchInput = container.querySelector('#sidebar-table-search');
    const tablesListContainer = container.querySelector('#sidebar-tables-list');
    const refreshBtn = container.querySelector('#refresh-tables-btn');
    const sqlConsoleBtn = container.querySelector('#btn-open-sql-console');

    // Sidebar search filtering; an active query expands the internal group.
    let query = '';
    const redraw = () => {
      const filtered = tablesList.filter(t => t.name.toLowerCase().includes(query));
      tablesListContainer.innerHTML = this.renderTablesList(filtered, activeTableName, query !== '');
      this.bindTableClickEvents(tablesListContainer, onTableSelect);
      const toggle = tablesListContainer.querySelector('#shadow-group-toggle');
      if (toggle) {
        toggle.addEventListener('click', () => {
          this.shadowOpen = !this.shadowOpen;
          redraw();
        });
      }
    };

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        query = e.target.value.toLowerCase().trim();
        redraw();
      });
    }

    // Refresh Tables button click handler
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        this.showLoading(container);
        if (onRefreshTables) {onRefreshTables();}
      });
    }

    if (sqlConsoleBtn) {
      sqlConsoleBtn.addEventListener('click', () => {
        if (onOpenSqlConsole) {onOpenSqlConsole();}
      });
    }

    redraw();
  },

  bindTableClickEvents(container, onTableSelect) {
    container.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const tableName = item.getAttribute('data-table-name');
        if (tableName && onTableSelect) {
          onTableSelect(tableName);
        }
      });
    });
  },

  escapeHtml(str) {
    if (!str) {return '';}
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  escapeAttr(str) {
    if (!str) {return '';}
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
};

if (typeof module !== 'undefined') {
  module.exports = Sidebar;
}
