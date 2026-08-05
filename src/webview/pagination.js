/**
 * Pagination Component (Unified Button & Select Styling)
 */
const Pagination = {
  render(container, currentPage, totalRows, pageSize, onPageChange, onPageSizeChange) {
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    const startRow = totalRows > 0 ? ((currentPage - 1) * pageSize + 1).toLocaleString() : 0;
    const endRow = (Math.min(currentPage * pageSize, totalRows)).toLocaleString();
    const formattedTotal = totalRows.toLocaleString();

    container.innerHTML = `
      <div class="rows-per-page-group">
        <span>Rows per page:</span>
        <div class="per-page-select-wrapper">
          <select class="rows-per-page-select" id="rows-per-page-select">
            <option value="10" ${pageSize === 10 ? 'selected' : ''}>10</option>
            <option value="50" ${pageSize === 50 ? 'selected' : ''}>50</option>
            <option value="100" ${pageSize === 100 ? 'selected' : ''}>100</option>
            <option value="500" ${pageSize === 500 ? 'selected' : ''}>500</option>
          </select>
        </div>
      </div>

      <div class="pagination-controls">
        <button class="page-btn ${currentPage <= 1 ? 'disabled' : ''}" id="btn-prev-page">
          ${Icons.chevronLeft}
          <span>Prev</span>
        </button>

        ${this.renderPageNumbers(currentPage, totalPages)}

        <button class="page-btn ${currentPage >= totalPages ? 'disabled' : ''}" id="btn-next-page">
          <span>Next</span>
          ${Icons.chevronRight}
        </button>
      </div>

      <div class="pagination-info">
        Showing ${startRow} – ${endRow} of ${formattedTotal}
      </div>
    `;

    this.bindEvents(container, currentPage, totalPages, onPageChange, onPageSizeChange);
  },

  renderPageNumbers(currentPage, totalPages) {
    if (totalPages <= 7) {
      let pages = '';
      for (let i = 1; i <= totalPages; i++) {
        pages += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
      }
      return pages;
    }

    return `
      <button class="page-btn ${currentPage === 1 ? 'active' : ''}" data-page="1">1</button>
      <span class="page-dots">...</span>
      ${currentPage > 2 ? `<button class="page-btn" data-page="${currentPage - 1}">${currentPage - 1}</button>` : ''}
      <button class="page-btn active" data-page="${currentPage}">${currentPage}</button>
      ${currentPage < totalPages - 1 ? `<button class="page-btn" data-page="${currentPage + 1}">${currentPage + 1}</button>` : ''}
      <span class="page-dots">...</span>
      <button class="page-btn ${currentPage === totalPages ? 'active' : ''}" data-page="${totalPages}">${totalPages.toLocaleString()}</button>
    `;
  },

  bindEvents(container, currentPage, totalPages, onPageChange, onPageSizeChange) {
    const select = container.querySelector('#rows-per-page-select');
    if (select) {
      select.addEventListener('change', (e) => {
        const newSize = parseInt(e.target.value, 10);
        if (onPageSizeChange) {onPageSizeChange(newSize);}
      });
    }

    container.querySelectorAll('.page-btn[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        const page = parseInt(btn.getAttribute('data-page'), 10);
        if (onPageChange && page !== currentPage) {onPageChange(page);}
      });
    });

    const prevBtn = container.querySelector('#btn-prev-page');
    const nextBtn = container.querySelector('#btn-next-page');

    if (prevBtn && !prevBtn.classList.contains('disabled')) {
      prevBtn.addEventListener('click', () => {
        if (currentPage > 1 && onPageChange) {onPageChange(currentPage - 1);}
      });
    }

    if (nextBtn && !nextBtn.classList.contains('disabled')) {
      nextBtn.addEventListener('click', () => {
        if (currentPage < totalPages && onPageChange) {onPageChange(currentPage + 1);}
      });
    }
  }
};

if (typeof module !== 'undefined') {
  module.exports = Pagination;
}
