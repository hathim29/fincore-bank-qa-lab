const API = 'http://localhost:3000/api';

// Fetch summary stats and populate cards
async function loadStats() {
    try {
        // Total customers
        const customers = await fetch(`${API}/customers?limit=1`);
        const customersData = await customers.json();
        document.getElementById('totalCustomers').textContent = customersData.total;

        // Total loans
        const loans = await fetch(`${API}/loans?limit=1`);
        const loansData = await loans.json();
        document.getElementById('totalLoans').textContent = loansData.total;

        // Pending loans
        const pending = await fetch(`${API}/loans?status=pending&limit=1`);
        const pendingData = await pending.json();
        document.getElementById('pendingLoans').textContent = pendingData.total;

        // Total transactions
        const transactions = await fetch(`${API}/transactions?limit=1`);
        const transactionsData = await transactions.json();
        document.getElementById('totalTransactions').textContent = transactionsData.total;

    } catch (err) {
        console.error('Error loading stats:', err);
    }
}

// Fetch recent loans and populate table
async function loadRecentLoans() {
    try {
        const response = await fetch(`${API}/loans?limit=5`);
        const data = await response.json();

        const tbody = document.getElementById('recentLoansBody');
        tbody.innerHTML = '';

        data.data.forEach(loan => {
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

    } catch (err) {
        console.error('Error loading recent loans:', err);
    }
}

// Run on page load
document.addEventListener('DOMContentLoaded', function () {
    loadStats();
    loadRecentLoans();
});