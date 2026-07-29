/**
 * testData.ts — Central test data constants
 *
 * All static values used in test specs live here.
 * Dynamic values (unique emails etc.) are generated inline with Date.now().
 */

// ── Auth credentials ───────────────────────────────────────────
export const ADMIN = {
    username: 'admin',
    password: 'admin123',
    role:     'admin',
};

export const VIEWER = {
    username: 'viewer',
    password: 'viewer123',
    role:     'viewer',
};

export const INVALID_USER = {
    username: 'wronguser',
    password: 'wrongpassword',
};

// ── Auth state file paths ──────────────────────────────────────
export const AUTH_STATE = {
    admin:  './tests/auth/adminState.json',
    viewer: './tests/auth/viewerState.json',
};

// ── Seed data — customers (from db/seed.js) ────────────────────
export const SEED_CUSTOMERS = {
    firstName:  'Arjun',            // exists in seed — use for search
    lastName:   'Sharma',
    fullName:   'Arjun Sharma',
    email:      'arjun.sharma@gmail.com',
    city:       'Chennai',
    invalidSearch: 'zzzz2f2qa2',    // guaranteed no match
};

// ── New customer test data ─────────────────────────────────────
export function newCustomer() {
    const ts = Date.now();
    return {
        name:  'Test Customer Playwright',
        email: `playwright.test+${ts}@gmail.com`,   // unique per run
        phone: '9876543210',
        city:  'Chennai',
        kyc:   'pending',
    };
}

// ── New loan test data ─────────────────────────────────────────
export const NEW_LOAN = {
    loanType:        'personal',
    principalAmount: '100000',
    interestRate:    '10.5',
    tenureMonths:    '12',
};

// ── New credit card test data ──────────────────────────────────
export const NEW_CARD = {
    cardType:    'Visa',
    creditLimit: '100000',
};

// ── Account types ──────────────────────────────────────────────
export const ACCOUNT_TYPES = ['savings', 'current', 'salary'] as const;

// ── Loan types ─────────────────────────────────────────────────
export const LOAN_TYPES = ['personal', 'home', 'auto', 'education', 'business'] as const;

// ── Transaction channels ───────────────────────────────────────
export const TXN_CHANNELS = [
    'cash', 'ATM', 'NEFT', 'RTGS', 'IMPS',
    'UPI-GPay', 'UPI-PhonePe', 'UPI-Paytm', 'UPI-Other',
    'cheque', 'branch'
] as const;

// ── Expected error messages ────────────────────────────────────
export const ERRORS = {
    nameRequired:     'required',
    emailRequired:    'required',
    invalidLogin:     'Invalid username or password',
    emptyUsername:    'Username and password are required',
    reasonRequired:   '',   // confirm button stays disabled
};

// ── Expected success messages ──────────────────────────────────
export const SUCCESS = {
    customerCreated: 'created successfully',
    paymentSuccess:  'Payment successful',
    loanCreated:     'created successfully',
};

// ── Pagination ─────────────────────────────────────────────────
export const PAGINATION = {
    defaultLimit: 10,
    pageSizes:    [10, 25, 50],
};

// ── URLs ───────────────────────────────────────────────────────
export const URLS = {
    login:       '/login.html',
    dashboard:   '/dashboard.html',
    customers:   '/customers.html',
    accounts:    '/accounts.html',
    transactions:'/transactions.html',
    loans:       '/loans.html',
    creditCards: '/credit-cards.html',
};

// ── API endpoints ──────────────────────────────────────────────
export const API = {
    customers:      '/api/customers',
    accounts:       '/api/accounts',
    loans:          '/api/loans',
    loanRepayments: '/api/loan-repayments',
    creditCards:    '/api/credit-cards',
    transactions:   '/api/transactions',
    dashboard:      '/api/dashboard',
};
