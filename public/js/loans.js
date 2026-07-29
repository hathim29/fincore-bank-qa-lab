const API = 'http://localhost:3000/api';

let currentPage = 1;
let currentStatus = '';
let currentLoanType = '';
let limit = 10;

// Fetch and render loans
async function loadLoans(page = 1, status = '', loanType = '') {
    try {
        const response = await fetch(
            `${API}/loans?page=${page}&limit=${limit}&status=${status}&loan_type=${loanType}`
        );
        const data = await response.json();

        renderTable(data.data);
        renderPagination(data.total, page);

        document.getElementById('totalCount').textContent = `${data.total} loans found`;
        document.getElementById('pageInfo').textContent = `Page ${page} of ${Math.ceil(data.total / limit)}`;

    } catch (err) {
        console.error('Error loading loans:', err);
    }
}

// Render table rows
function renderTable(loans) {
    const tbody = document.getElementById('loansBody');
    tbody.innerHTML = '';

    if (loans.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No loans found</td></tr>';
        return;
    }

    loans.forEach(loan => {
        const row = document.createElement('tr');
        row.setAttribute('data-testid', `loan-row-${loan.id}`);
        row.innerHTML = `
            <td>${loan.id}</td>
            <td>${loan.customer_name}</td>
            <td>$${parseFloat(loan.amount).toLocaleString()}</td>
            <td>${loan.loan_type}</td>
            <td><span class="badge-${loan.status}">${loan.status}</span></td>
            <td>${new Date(loan.applied_at).toLocaleDateString()}</td>
        `;
        tbody.appendChild(row);
    });
}

// Render pagination
function renderPagination(total, page) {
    const totalPages = Math.ceil(total / limit);
    const pagination = document.getElementById('pagination');
    pagination.innerHTML = '';

    // Previous
    const prev = document.createElement('li');
    prev.className = `page-item ${page === 1 ? 'disabled' : ''}`;
    prev.innerHTML = `<a class="page-link" href="#" data-testid="prev-page">Previous</a>`;
    prev.addEventListener('click', (e) => {
        e.preventDefault();
        if (page > 1) changePage(page - 1);
    });
    pagination.appendChild(prev);

    // Page numbers
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, page + 2);
    for (let i = start; i <= end; i++) {
        const li = document.createElement('li');
        li.className = `page-item ${i === page ? 'active' : ''}`;
        li.innerHTML = `<a class="page-link" href="#" data-testid="page-${i}">${i}</a>`;
        li.addEventListener('click', (e) => {
            e.preventDefault();
            changePage(i);
        });
        pagination.appendChild(li);
    }

    // Next
    const next = document.createElement('li');
    next.className = `page-item ${page === totalPages ? 'disabled' : ''}`;
    next.innerHTML = `<a class="page-link" href="#" data-testid="next-page">Next</a>`;
    next.addEventListener('click', (e) => {
        e.preventDefault();
        if (page < totalPages) changePage(page + 1);
    });
    pagination.appendChild(next);

    // Last
    const last = document.createElement('li');
    last.className = `page-item ${page === totalPages ? 'disabled' : ''}`;
    last.innerHTML = `<a class="page-link" href="#" data-testid="last-page">Last</a>`;
    last.addEventListener('click', (e) => {
        e.preventDefault();
        if (page < totalPages) changePage(totalPages);
    });
    pagination.appendChild(last);
}

// Change page
function changePage(page) {
    currentPage = page;
    loadLoans(currentPage, currentStatus, currentLoanType);
}

// Status filter
document.getElementById('statusFilter').addEventListener('change', function () {
    currentStatus = this.value;
    currentPage = 1;
    loadLoans(currentPage, currentStatus, currentLoanType);
});

// Loan type filter
document.getElementById('loanTypeFilter').addEventListener('change', function () {
    currentLoanType = this.value;
    currentPage = 1;
    loadLoans(currentPage, currentStatus, currentLoanType);
});

// Rows per page
document.getElementById('rowsPerPage').addEventListener('change', function () {
    limit = parseInt(this.value);
    currentPage = 1;
    loadLoans(currentPage, currentStatus, currentLoanType);
});

// Add Loan Modal
document.getElementById('addLoanBtn').addEventListener('click', function () {
    const modal = new bootstrap.Modal(document.getElementById('addLoanModal'));
    modal.show();
});

// Save Loan
document.getElementById('saveLoanBtn').addEventListener('click', async function () {
    const customer_id = document.getElementById('newCustomerId').value.trim();
    const amount = document.getElementById('newAmount').value.trim();
    const loan_type = document.getElementById('newLoanType').value;
    const status = document.getElementById('newStatus').value;
    const errorDiv = document.getElementById('modalError');
    const successDiv = document.getElementById('modalSuccess');

    errorDiv.classList.add('d-none');
    successDiv.classList.add('d-none');

    if (!customer_id || !amount || !loan_type) {
        errorDiv.textContent = 'Customer ID, amount and loan type are required.';
        errorDiv.classList.remove('d-none');
        return;
    }

    try {
        const response = await fetch(`${API}/loans`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customer_id, amount, loan_type, status })
        });

        const data = await response.json();

        if (response.ok) {
            successDiv.textContent = `Loan #${data.id} created successfully.`;
            successDiv.classList.remove('d-none');
            setTimeout(() => {
                bootstrap.Modal.getInstance(document.getElementById('addLoanModal')).hide();
                loadLoans(currentPage, currentStatus, currentLoanType);
            }, 1000);
        } else {
            errorDiv.textContent = data.error || 'Failed to create loan.';
            errorDiv.classList.remove('d-none');
        }
    } catch (err) {
        errorDiv.textContent = 'Server error. Please try again.';
        errorDiv.classList.remove('d-none');
    }
});

// Load on page start
document.addEventListener('DOMContentLoaded', function () {
    loadLoans();
});