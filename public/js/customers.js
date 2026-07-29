const API = 'http://localhost:3000/api';

let currentPage = 1;
let currentSearch = '';
let limit = 10;

// Fetch and render customers
async function loadCustomers(page = 1, search = '') {
    try {
        const response = await fetch(`${API}/customers?page=${page}&limit=${limit}&search=${search}`);
        const data = await response.json();

        renderTable(data.data);
        renderPagination(data.total, page);

        document.getElementById('totalCount').textContent = `${data.total} customers found`;
        document.getElementById('pageInfo').textContent = `Page ${page} of ${Math.ceil(data.total / limit)}`;

    } catch (err) {
        console.error('Error loading customers:', err);
    }
}

// Render table rows
function renderTable(customers) {
    const tbody = document.getElementById('customersBody');
    tbody.innerHTML = '';

    if (customers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No customers found</td></tr>';
        return;
    }

    customers.forEach(customer => {
        const row = document.createElement('tr');
        row.setAttribute('data-testid', `customer-row-${customer.id}`);
        row.innerHTML = `
            <td>${customer.id}</td>
            <td>${customer.name}</td>
            <td>${customer.email}</td>
            <td>${customer.phone}</td>
            <td>${customer.city}</td>
            <td>${new Date(customer.created_at).toLocaleDateString()}</td>
        `;
        tbody.appendChild(row);
    });
}

// Render pagination buttons
function renderPagination(total, page) {
    const totalPages = Math.ceil(total / limit);
    const pagination = document.getElementById('pagination');
    pagination.innerHTML = '';

    // Previous button
    const prev = document.createElement('li');
    prev.className = `page-item ${page === 1 ? 'disabled' : ''}`;
    prev.innerHTML = `<a class="page-link" href="#" data-testid="prev-page">Previous</a>`;
    prev.addEventListener('click', (e) => {
        e.preventDefault();
        if (page > 1) changePage(page - 1);
    });
    pagination.appendChild(prev);

    // Page number buttons — show 5 pages around current
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

    // Next button
    const next = document.createElement('li');
    next.className = `page-item ${page === totalPages ? 'disabled' : ''}`;
    next.innerHTML = `<a class="page-link" href="#" data-testid="next-page">Next</a>`;
    next.addEventListener('click', (e) => {
        e.preventDefault();
        if (page < totalPages) changePage(page + 1);
    });
    pagination.appendChild(next);

    // Last button
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
    loadCustomers(currentPage, currentSearch);
}

// Search — debounce so it doesn't fire on every keystroke
let searchTimeout;
document.getElementById('searchInput').addEventListener('input', function () {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        currentSearch = this.value.trim();
        currentPage = 1;
        loadCustomers(currentPage, currentSearch);
    }, 400);
});

// Rows per page
document.getElementById('rowsPerPage').addEventListener('change', function () {
    limit = parseInt(this.value);
    currentPage = 1;
    loadCustomers(currentPage, currentSearch);
});

// Add Customer Modal
document.getElementById('addCustomerBtn').addEventListener('click', function () {
    const modal = new bootstrap.Modal(document.getElementById('addCustomerModal'));
    modal.show();
});

// Save Customer
document.getElementById('saveCustomerBtn').addEventListener('click', async function () {
    const name = document.getElementById('newName').value.trim();
    const email = document.getElementById('newEmail').value.trim();
    const phone = document.getElementById('newPhone').value.trim();
    const city = document.getElementById('newCity').value.trim();
    const errorDiv = document.getElementById('modalError');
    const successDiv = document.getElementById('modalSuccess');

    errorDiv.classList.add('d-none');
    successDiv.classList.add('d-none');

    if (!name || !email) {
        errorDiv.textContent = 'Name and email are required.';
        errorDiv.classList.remove('d-none');
        return;
    }

    try {
        const response = await fetch(`${API}/customers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, phone, city })
        });

        const data = await response.json();

        if (response.ok) {
            successDiv.textContent = `Customer ${data.name} created successfully.`;
            successDiv.classList.remove('d-none');
            setTimeout(() => {
                bootstrap.Modal.getInstance(document.getElementById('addCustomerModal')).hide();
                loadCustomers(currentPage, currentSearch);
            }, 1000);
        } else {
            errorDiv.textContent = data.error || 'Failed to create customer.';
            errorDiv.classList.remove('d-none');
        }
    } catch (err) {
        errorDiv.textContent = 'Server error. Please try again.';
        errorDiv.classList.remove('d-none');
    }
});

// Load on page start
document.addEventListener('DOMContentLoaded', function () {
    loadCustomers();
});