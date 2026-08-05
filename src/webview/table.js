/**
 * Data Table Component (With Safe HTML Escaping, Resizable Columns, Row Context Menu, and Row Detail / Refresh Triggers)
 */
const TableComponent = {
  render(container, columns, rows, filtersMap = {}, sortState = [], onSortChange, onFilterChange, onViewRowDetails, onRefreshRows) {
    if (!columns || columns.length === 0) {
      container.innerHTML = `<div class="empty-table-msg" style="padding: 32px; text-align: center; color: var(--text-muted);">No columns or table data available.</div>`;
      return;
    }

    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr class="header-row">
            ${columns.map(col => this.renderTh(col, sortState)).join('')}
          </tr>
          <tr class="filter-row" id="table-filter-row">
            ${columns.map(col => `
              <th data-col="${col.key}">
                <input 
                  type="text" 
                  class="table-filter-input col-filter-val" 
                  data-col="${col.key}" 
                  placeholder="Filter ${col.title}..." 
                  value="${this.escapeAttr(filtersMap[col.key] || '')}" 
                />
              </th>
            `).join('')}
          </tr>
        </thead>
        <tbody id="table-tbody">
          ${this.renderTbodyRows(columns, rows)}
        </tbody>
      </table>

      <!-- Custom Row Context Menu -->
      <div class="row-context-menu" id="row-context-menu" style="display: none;">
        <div class="context-menu-item" id="ctx-view-details">
          ${Icons.eye}
          <span>View Row Details</span>
        </div>
        <div class="context-menu-item" id="ctx-refresh-rows">
          ${Icons.refresh}
          <span>Refresh Rows</span>
        </div>
        <div class="context-menu-item" id="ctx-copy-json">
          ${Icons.copy}
          <span>Copy Row JSON</span>
        </div>
      </div>
    `;

    this.bindEvents(container, columns, onSortChange, onFilterChange, onViewRowDetails, onRefreshRows, rows);
  },

  updateTbody(container, columns, rows, onViewRowDetails, onRefreshRows) {
    const tbody = container.querySelector('#table-tbody');
    if (tbody) {
      tbody.innerHTML = this.renderTbodyRows(columns, rows);
      this.bindRowClickEvents(container, columns, rows, onViewRowDetails, onRefreshRows);
    }
  },

  updateHeaderSortIcons(container, columns, sortState) {
    columns.forEach(col => {
      const th = container.querySelector(`th[data-col="${col.key}"]`);
      if (!th) {
        return;
      }

      const sortIdx = sortState.findIndex(s => s.col === col.key);
      const sortRule = sortIdx >= 0 ? sortState[sortIdx] : null;

      const arrowsEl = th.querySelector('.sort-arrows');
      const priorityEl = th.querySelector('.sort-priority');

      if (arrowsEl) {
        arrowsEl.className = `sort-arrows ${sortRule ? sortRule.dir : 'none'}`;
      }

      if (priorityEl) {
        if (sortState.length > 1 && sortIdx >= 0) {
          priorityEl.textContent = String(sortIdx + 1);
          priorityEl.style.display = 'inline-flex';
        } else {
          priorityEl.style.display = 'none';
        }
      }
    });
  },

  renderTh(col, sortState) {
    const sortIdx = sortState.findIndex(s => s.col === col.key);
    const sortRule = sortIdx >= 0 ? sortState[sortIdx] : null;
    const sortDirClass = sortRule ? sortRule.dir : 'none';
    const isMultiSort = sortState.length > 1;

    return `
      <th data-col="${col.key}">
        <div class="th-content">
          <span title="${this.escapeAttr(col.title)}">${this.escapeHtml(col.title)}</span>
          <div class="sort-icon-wrapper">
            <svg class="sort-arrows ${sortDirClass}" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path class="arrow-up" d="M7 11l5-5 5 5"/>
              <path class="arrow-down" d="M7 13l5 5 5-5"/>
            </svg>
            <span class="sort-priority" style="${isMultiSort && sortIdx >= 0 ? '' : 'display: none;'}">${sortIdx + 1}</span>
          </div>
        </div>
        <div class="col-resizer"></div>
      </th>
    `;
  },

  renderTbodyRows(columns, rows) {
    if (!rows || rows.length === 0) {
      return `
        <tr>
          <td colspan="${columns.length}" style="text-align: center; color: var(--text-muted); padding: 32px;">
            No matching records found.
          </td>
        </tr>
      `;
    }

    return rows.map((row, rowIdx) => `
      <tr data-row-index="${rowIdx}">
        ${columns.map(col => {
          const val = row[col.key];
          let formattedVal = '';
          if (val === null || val === undefined) {
            formattedVal = `<span class="td-muted">NULL</span>`;
          } else {
            formattedVal = this.escapeHtml(String(val));
          }
          return `<td title="${this.escapeAttr(val !== null && val !== undefined ? String(val) : '')}">${formattedVal}</td>`;
        }).join('')}
      </tr>
    `).join('');
  },

  bindEvents(container, columns, onSortChange, onFilterChange, onViewRowDetails, onRefreshRows, rows) {
    const ths = container.querySelectorAll('.header-row th');
    ths.forEach(th => {
      const colKey = th.getAttribute('data-col');
      const thContent = th.querySelector('.th-content');
      if (thContent) {
        thContent.addEventListener('click', (e) => {
          if (onSortChange) {
            onSortChange(colKey, e.shiftKey);
          }
        });
      }
    });

    const filterInputs = container.querySelectorAll('.col-filter-val');
    let currentFilters = {};
    filterInputs.forEach(input => {
      currentFilters[input.getAttribute('data-col')] = input.value;
      input.addEventListener('input', (e) => {
        const colKey = e.target.getAttribute('data-col');
        currentFilters[colKey] = e.target.value;
        if (onFilterChange) {
          onFilterChange(currentFilters);
        }
      });
    });

    this.bindColumnResizers(container);
    this.bindRowClickEvents(container, columns, rows, onViewRowDetails, onRefreshRows);
  },

  bindColumnResizers(container) {
    const resizers = container.querySelectorAll('.col-resizer');
    resizers.forEach(resizer => {
      resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const th = resizer.parentElement;
        const colKey = th.getAttribute('data-col');
        const startX = e.clientX;
        const startWidth = th.offsetWidth;

        resizer.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        function onMouseMove(moveEvent) {
          const newWidth = Math.max(60, startWidth + (moveEvent.clientX - startX));
          th.style.width = `${newWidth}px`;
          th.style.minWidth = `${newWidth}px`;
          th.style.maxWidth = `${newWidth}px`;

          const filterTh = container.querySelector(`.filter-row th[data-col="${colKey}"]`);
          if (filterTh) {
            filterTh.style.width = `${newWidth}px`;
            filterTh.style.minWidth = `${newWidth}px`;
            filterTh.style.maxWidth = `${newWidth}px`;
          }
        }

        function onMouseUp() {
          resizer.classList.remove('resizing');
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });
    });
  },

  bindRowClickEvents(container, columns, rows, onViewRowDetails, onRefreshRows) {
    const trs = container.querySelectorAll('#table-tbody tr[data-row-index]');
    const ctxMenu = container.querySelector('#row-context-menu');
    let selectedRowData = null;

    trs.forEach(tr => {
      const idx = Number(tr.getAttribute('data-row-index'));
      const rowData = rows[idx];

      tr.addEventListener('dblclick', () => {
        if (onViewRowDetails && rowData) {
          onViewRowDetails(rowData);
        }
      });

      tr.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        selectedRowData = rowData;

        if (ctxMenu) {
          ctxMenu.style.display = 'block';
          ctxMenu.style.left = `${e.clientX}px`;
          ctxMenu.style.top = `${e.clientY}px`;
        }
      });
    });

    if (ctxMenu) {
      const viewDetailsBtn = ctxMenu.querySelector('#ctx-view-details');
      const refreshRowsBtn = ctxMenu.querySelector('#ctx-refresh-rows');
      const copyJsonBtn = ctxMenu.querySelector('#ctx-copy-json');

      if (viewDetailsBtn) {
        viewDetailsBtn.onclick = () => {
          ctxMenu.style.display = 'none';
          if (onViewRowDetails && selectedRowData) {
            onViewRowDetails(selectedRowData);
          }
        };
      }

      if (refreshRowsBtn) {
        refreshRowsBtn.onclick = () => {
          ctxMenu.style.display = 'none';
          if (onRefreshRows) {
            onRefreshRows();
          }
        };
      }

      if (copyJsonBtn) {
        copyJsonBtn.onclick = () => {
          ctxMenu.style.display = 'none';
          if (selectedRowData) {
            navigator.clipboard.writeText(JSON.stringify(selectedRowData, null, 2));
          }
        };
      }

      document.addEventListener('click', (e) => {
        if (!ctxMenu.contains(e.target)) {
          ctxMenu.style.display = 'none';
        }
      });
    }
  },

  escapeHtml(str) {
    if (str === null || str === undefined) {
      return '';
    }
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  escapeAttr(str) {
    if (str === null || str === undefined) {
      return '';
    }
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
};

if (typeof module !== 'undefined') {
  module.exports = TableComponent;
}
