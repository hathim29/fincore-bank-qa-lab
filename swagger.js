/**
 * swagger.js — OpenAPI 3.0 specification for FinCore Bank API
 * Served at http://localhost:3000/api-docs
 *
 * Install: npm install swagger-ui-express swagger-jsdoc
 * Then add to server.js:
 *   const { swaggerUi, swaggerSpec } = require('./swagger');
 *   app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
 */

const swaggerUi   = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title:       'FinCore Bank API',
            version:     '1.0.0',
            description: 'REST API for FinCore Bank — QA Practice Lab. All endpoints documented for Postman, Playwright API tests, and manual exploration.',
            contact: {
                name:  'Hathim Al Ghifari J',
                url:   'https://github.com/hathim29/fincore-bank-qa-lab',
            },
        },
        servers: [
            { url: 'http://localhost:3000', description: 'Local development' },
        ],
        tags: [
            { name: 'Dashboard',       description: 'Summary stats and alerts' },
            { name: 'Customers',       description: 'Customer management — CRUD, KYC' },
            { name: 'Accounts',        description: 'Bank accounts — lifecycle management' },
            { name: 'Transactions',    description: 'Banking transactions' },
            { name: 'Loans',           description: 'Loan management and EMI repayments' },
            { name: 'Loan Repayments', description: 'EMI payment recording' },
            { name: 'Credit Cards',    description: 'Credit card management and payments' },
            { name: 'Test Utilities',  description: 'Test data management — reset and seed' },
        ],
        components: {
            schemas: {
                Customer: {
                    type: 'object',
                    properties: {
                        id:          { type: 'integer', example: 1 },
                        name:        { type: 'string',  example: 'Arjun Sharma' },
                        email:       { type: 'string',  example: 'arjun.sharma@gmail.com' },
                        phone:       { type: 'string',  example: '9876543210' },
                        city:        { type: 'string',  example: 'Chennai' },
                        kyc_status:  { type: 'string',  enum: ['verified', 'pending', 'rejected'] },
                        created_at:  { type: 'string',  format: 'date-time' },
                    }
                },
                Account: {
                    type: 'object',
                    properties: {
                        id:             { type: 'integer', example: 1 },
                        account_number: { type: 'string',  example: 'FNC001001' },
                        account_type:   { type: 'string',  enum: ['savings', 'current', 'salary'] },
                        balance:        { type: 'number',  example: 50000.00 },
                        status:         { type: 'string',  enum: ['active', 'frozen', 'closed'] },
                        customer_id:    { type: 'integer', example: 1 },
                    }
                },
                Loan: {
                    type: 'object',
                    properties: {
                        id:                 { type: 'integer', example: 1 },
                        customer_id:        { type: 'integer', example: 1 },
                        loan_type:          { type: 'string',  enum: ['personal', 'home', 'auto', 'education', 'business'] },
                        principal_amount:   { type: 'number',  example: 100000 },
                        interest_rate:      { type: 'number',  example: 10.5 },
                        tenure_months:      { type: 'integer', example: 12 },
                        emi_amount:         { type: 'number',  example: 8791.59 },
                        status:             { type: 'string',  enum: ['active', 'overdue', 'closed', 'foreclosed'] },
                    }
                },
                CreditCard: {
                    type: 'object',
                    properties: {
                        id:                  { type: 'integer', example: 1 },
                        card_number_masked:  { type: 'string',  example: '**** **** **** 1001' },
                        card_type:           { type: 'string',  enum: ['Visa', 'Mastercard', 'RuPay'] },
                        credit_limit:        { type: 'number',  example: 100000 },
                        outstanding_balance: { type: 'number',  example: 15000 },
                        minimum_due:         { type: 'number',  example: 750 },
                        status:              { type: 'string',  enum: ['active', 'blocked', 'expired'] },
                    }
                },
                Transaction: {
                    type: 'object',
                    properties: {
                        id:               { type: 'integer', example: 1 },
                        account_id:       { type: 'integer', example: 1 },
                        transaction_type: { type: 'string',  enum: ['deposit', 'withdrawal', 'transfer'] },
                        amount:           { type: 'number',  example: 5000 },
                        channel:          { type: 'string',  example: 'UPI-GPay' },
                        status:           { type: 'string',  enum: ['success', 'failed', 'pending'] },
                        reference_number: { type: 'string',  example: 'REF1234567890' },
                    }
                },
                Error: {
                    type: 'object',
                    properties: {
                        error: { type: 'string', example: 'Customer not found' }
                    }
                },
                PaginatedResponse: {
                    type: 'object',
                    properties: {
                        data:  { type: 'array', items: {} },
                        total: { type: 'integer', example: 20 },
                        page:  { type: 'integer', example: 1 },
                        limit: { type: 'integer', example: 10 },
                    }
                }
            }
        },
        paths: {
            // ── DASHBOARD ──────────────────────────────────────
            '/api/dashboard/stats': {
                get: {
                    tags: ['Dashboard'],
                    summary: 'Get dashboard summary statistics',
                    description: 'Returns counts for all entities — customers, accounts (by status), loans (by status), cards (by status), and today\'s transaction count.',
                    responses: {
                        200: {
                            description: 'Dashboard statistics',
                            content: { 'application/json': { schema: {
                                type: 'object',
                                properties: {
                                    total_customers:    { type: 'integer' },
                                    active_accounts:    { type: 'integer' },
                                    frozen_accounts:    { type: 'integer' },
                                    closed_accounts:    { type: 'integer' },
                                    active_loans:       { type: 'integer' },
                                    overdue_loans:      { type: 'integer' },
                                    closed_loans:       { type: 'integer' },
                                    foreclosed_loans:   { type: 'integer' },
                                    total_cards:        { type: 'integer' },
                                    active_cards:       { type: 'integer' },
                                    blocked_cards:      { type: 'integer' },
                                    transactions_today: { type: 'integer' },
                                    cards_due_soon:     { type: 'integer' },
                                }
                            }}}
                        }
                    }
                }
            },
            '/api/dashboard/recent-transactions': {
                get: {
                    tags: ['Dashboard'],
                    summary: 'Get recent transactions for dashboard widget',
                    responses: { 200: { description: 'Array of recent transactions' } }
                }
            },
            '/api/dashboard/alerts': {
                get: {
                    tags: ['Dashboard'],
                    summary: 'Get overdue loans and cards due soon alerts',
                    responses: { 200: { description: 'Alert arrays for dashboard widgets' } }
                }
            },

            // ── CUSTOMERS ──────────────────────────────────────
            '/api/customers': {
                get: {
                    tags: ['Customers'],
                    summary: 'Get paginated customer list',
                    parameters: [
                        { name: 'page',       in: 'query', schema: { type: 'integer', default: 1 } },
                        { name: 'limit',      in: 'query', schema: { type: 'integer', default: 10 } },
                        { name: 'search',     in: 'query', schema: { type: 'string' }, description: 'Search by name, email or city' },
                        { name: 'kyc_status', in: 'query', schema: { type: 'string', enum: ['verified', 'pending', 'rejected'] } },
                    ],
                    responses: {
                        200: { description: 'Paginated customer list' }
                    }
                },
                post: {
                    tags: ['Customers'],
                    summary: 'Create a new customer',
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: {
                            type: 'object',
                            required: ['name', 'email'],
                            properties: {
                                name:       { type: 'string', example: 'Priya Menon' },
                                email:      { type: 'string', example: 'priya.menon@gmail.com' },
                                phone:      { type: 'string', example: '9876543210' },
                                city:       { type: 'string', example: 'Chennai' },
                                kyc_status: { type: 'string', enum: ['verified', 'pending', 'rejected'], default: 'pending' },
                            }
                        }}}
                    },
                    responses: {
                        201: { description: 'Customer created successfully' },
                        400: { description: 'Validation error', content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } } }
                    }
                }
            },
            '/api/customers/{id}': {
                get: {
                    tags: ['Customers'],
                    summary: 'Get customer by ID with accounts, loans and credit cards',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                    responses: {
                        200: { description: 'Customer detail with related data' },
                        404: { description: 'Customer not found' }
                    }
                },
                put: {
                    tags: ['Customers'],
                    summary: 'Update customer details',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                    requestBody: {
                        content: { 'application/json': { schema: { '$ref': '#/components/schemas/Customer' } } }
                    },
                    responses: { 200: { description: 'Customer updated' }, 404: { description: 'Not found' } }
                }
            },

            // ── ACCOUNTS ───────────────────────────────────────
            '/api/accounts': {
                get: {
                    tags: ['Accounts'],
                    summary: 'Get paginated accounts list',
                    parameters: [
                        { name: 'page',         in: 'query', schema: { type: 'integer', default: 1 } },
                        { name: 'limit',        in: 'query', schema: { type: 'integer', default: 10 } },
                        { name: 'account_type', in: 'query', schema: { type: 'string', enum: ['savings', 'current', 'salary'] } },
                        { name: 'status',       in: 'query', schema: { type: 'string', enum: ['active', 'frozen', 'closed'] } },
                    ],
                    responses: { 200: { description: 'Paginated accounts list' } }
                },
                post: {
                    tags: ['Accounts'],
                    summary: 'Create a new bank account',
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: {
                            type: 'object',
                            required: ['customer_id', 'account_type'],
                            properties: {
                                customer_id:  { type: 'integer', example: 1 },
                                account_type: { type: 'string', enum: ['savings', 'current', 'salary'] },
                                balance:      { type: 'number', example: 1000 },
                            }
                        }}}
                    },
                    responses: { 201: { description: 'Account created' }, 400: { description: 'Validation error' } }
                }
            },
            '/api/accounts/search': {
                get: {
                    tags: ['Accounts'],
                    summary: 'Search accounts by partial account number (autocomplete)',
                    parameters: [
                        { name: 'q', in: 'query', required: true, schema: { type: 'string', minLength: 2 }, description: 'Partial account number — minimum 2 characters' }
                    ],
                    responses: {
                        200: {
                            description: 'Matching accounts with customer details',
                            content: { 'application/json': { schema: {
                                type: 'object',
                                properties: {
                                    results: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                id:             { type: 'integer' },
                                                account_number: { type: 'string' },
                                                account_type:   { type: 'string' },
                                                status:         { type: 'string' },
                                                balance:        { type: 'number' },
                                                customer_name:  { type: 'string' },
                                                customer_email: { type: 'string' },
                                            }
                                        }
                                    }
                                }
                            }}}
                        }
                    }
                }
            },
            '/api/accounts/{id}': {
                get: {
                    tags: ['Accounts'],
                    summary: 'Get account by ID with recent transactions',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                    responses: { 200: { description: 'Account detail' }, 404: { description: 'Not found' } }
                },
                put: {
                    tags: ['Accounts'],
                    summary: 'Update account status — freeze, unfreeze, or close',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: {
                            type: 'object',
                            required: ['status', 'reason', 'performed_by'],
                            properties: {
                                status:       { type: 'string', enum: ['active', 'frozen', 'closed'] },
                                reason:       { type: 'string', example: 'Customer request' },
                                performed_by: { type: 'string', example: 'admin' },
                            }
                        }}}
                    },
                    responses: { 200: { description: 'Account status updated' } }
                }
            },
            '/api/accounts/{id}/audit': {
                get: {
                    tags: ['Accounts'],
                    summary: 'Get audit trail for an account',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                    responses: { 200: { description: 'Audit log entries array' } }
                }
            },

            // ── TRANSACTIONS ───────────────────────────────────
            '/api/transactions': {
                get: {
                    tags: ['Transactions'],
                    summary: 'Get paginated transactions with filters',
                    parameters: [
                        { name: 'page',             in: 'query', schema: { type: 'integer', default: 1 } },
                        { name: 'limit',            in: 'query', schema: { type: 'integer', default: 10 } },
                        { name: 'transaction_type', in: 'query', schema: { type: 'string', enum: ['deposit', 'withdrawal', 'transfer'] } },
                        { name: 'channel',          in: 'query', schema: { type: 'string' } },
                        { name: 'status',           in: 'query', schema: { type: 'string', enum: ['success', 'failed', 'pending'] } },
                        { name: 'date',             in: 'query', schema: { type: 'string', format: 'date' }, description: 'Filter by date (YYYY-MM-DD). Use today for current date' },
                    ],
                    responses: { 200: { description: 'Paginated transactions' } }
                },
                post: {
                    tags: ['Transactions'],
                    summary: 'Create a new transaction',
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: {
                            type: 'object',
                            required: ['account_id', 'transaction_type', 'amount'],
                            properties: {
                                account_id:       { type: 'integer', example: 1 },
                                transaction_type: { type: 'string', enum: ['deposit', 'withdrawal', 'transfer'] },
                                channel:          { type: 'string', example: 'UPI-GPay' },
                                amount:           { type: 'number', example: 5000 },
                                description:      { type: 'string', example: 'Salary credit' },
                            }
                        }}}
                    },
                    responses: {
                        201: { description: 'Transaction created' },
                        400: { description: 'Insufficient funds or invalid account' }
                    }
                }
            },
            '/api/transactions/{id}': {
                get: {
                    tags: ['Transactions'],
                    summary: 'Get transaction by ID with customer and account history',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                    responses: { 200: { description: 'Transaction detail' }, 404: { description: 'Not found' } }
                }
            },

            // ── LOANS ──────────────────────────────────────────
            '/api/loans': {
                get: {
                    tags: ['Loans'],
                    summary: 'Get paginated loans with filters',
                    parameters: [
                        { name: 'page',      in: 'query', schema: { type: 'integer', default: 1 } },
                        { name: 'limit',     in: 'query', schema: { type: 'integer', default: 10 } },
                        { name: 'status',    in: 'query', schema: { type: 'string', enum: ['active', 'overdue', 'closed', 'foreclosed'] } },
                        { name: 'loan_type', in: 'query', schema: { type: 'string', enum: ['personal', 'home', 'auto', 'education', 'business'] } },
                    ],
                    responses: { 200: { description: 'Paginated loans' } }
                },
                post: {
                    tags: ['Loans'],
                    summary: 'Create a new loan',
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: {
                            type: 'object',
                            required: ['customer_id', 'loan_type', 'principal_amount', 'interest_rate', 'tenure_months'],
                            properties: {
                                customer_id:      { type: 'integer', example: 1 },
                                loan_type:        { type: 'string', enum: ['personal', 'home', 'auto', 'education', 'business'] },
                                principal_amount: { type: 'number', example: 100000 },
                                interest_rate:    { type: 'number', example: 10.5 },
                                tenure_months:    { type: 'integer', example: 12 },
                            }
                        }}}
                    },
                    responses: { 201: { description: 'Loan created with EMI schedule' }, 400: { description: 'Validation error' } }
                }
            },
            '/api/loans/{id}': {
                get: {
                    tags: ['Loans'],
                    summary: 'Get loan by ID with full EMI schedule and loan score',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                    responses: { 200: { description: 'Loan detail with repayment history' }, 404: { description: 'Not found' } }
                },
                put: {
                    tags: ['Loans'],
                    summary: 'Update loan status — foreclose or close',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                    requestBody: {
                        content: { 'application/json': { schema: {
                            type: 'object',
                            properties: { status: { type: 'string', enum: ['foreclosed', 'closed'] } }
                        }}}
                    },
                    responses: { 200: { description: 'Loan status updated' } }
                }
            },

            // ── LOAN REPAYMENTS ────────────────────────────────
            '/api/loan-repayments': {
                get: {
                    tags: ['Loan Repayments'],
                    summary: 'Get repayment history for a loan',
                    parameters: [
                        { name: 'loan_id', in: 'query', required: true, schema: { type: 'integer' }, description: 'Loan ID to fetch repayment history for' }
                    ],
                    responses: { 200: { description: 'EMI repayment history' }, 400: { description: 'loan_id is required' } }
                },
                post: {
                    tags: ['Loan Repayments'],
                    summary: 'Record an EMI payment',
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: {
                            type: 'object',
                            required: ['loan_id', 'emi_number', 'payment_channel'],
                            properties: {
                                loan_id:         { type: 'integer', example: 1 },
                                emi_number:      { type: 'integer', example: 1 },
                                payment_channel: { type: 'string', example: 'UPI-GPay' },
                            }
                        }}}
                    },
                    responses: {
                        200: { description: 'EMI payment recorded with reference number' },
                        400: { description: 'EMI already paid or invalid' }
                    }
                }
            },

            // ── CREDIT CARDS ───────────────────────────────────
            '/api/credit-cards': {
                get: {
                    tags: ['Credit Cards'],
                    summary: 'Get paginated credit cards',
                    parameters: [
                        { name: 'page',      in: 'query', schema: { type: 'integer', default: 1 } },
                        { name: 'limit',     in: 'query', schema: { type: 'integer', default: 10 } },
                        { name: 'status',    in: 'query', schema: { type: 'string', enum: ['active', 'blocked', 'expired'] } },
                        { name: 'card_type', in: 'query', schema: { type: 'string', enum: ['Visa', 'Mastercard', 'RuPay'] } },
                    ],
                    responses: { 200: { description: 'Paginated credit cards' } }
                },
                post: {
                    tags: ['Credit Cards'],
                    summary: 'Issue a new credit card',
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: {
                            type: 'object',
                            required: ['customer_id', 'card_type', 'credit_limit'],
                            properties: {
                                customer_id:  { type: 'integer', example: 1 },
                                card_type:    { type: 'string', enum: ['Visa', 'Mastercard', 'RuPay'] },
                                credit_limit: { type: 'number', example: 100000 },
                            }
                        }}}
                    },
                    responses: { 201: { description: 'Card issued successfully' }, 400: { description: 'Validation error' } }
                }
            },
            '/api/credit-cards/{id}': {
                get: {
                    tags: ['Credit Cards'],
                    summary: 'Get card by ID with transaction history',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                    responses: { 200: { description: 'Card detail with transactions' }, 404: { description: 'Not found' } }
                }
            },
            '/api/credit-cards/{id}/payment': {
                post: {
                    tags: ['Credit Cards'],
                    summary: 'Make a credit card payment',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: {
                            type: 'object',
                            required: ['payment_type'],
                            properties: {
                                payment_type: { type: 'string', enum: ['full', 'minimum', 'custom'] },
                                amount:       { type: 'number', description: 'Required only for custom payment type' },
                            }
                        }}}
                    },
                    responses: { 200: { description: 'Payment processed with reference number' }, 400: { description: 'Invalid payment amount or card blocked' } }
                }
            },
            '/api/credit-cards/{id}/status': {
                put: {
                    tags: ['Credit Cards'],
                    summary: 'Block or unblock a credit card',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: {
                            type: 'object',
                            properties: { status: { type: 'string', enum: ['active', 'blocked'] } }
                        }}}
                    },
                    responses: { 200: { description: 'Card status updated' } }
                }
            },

            // ── TEST UTILITIES ─────────────────────────────────
            '/api/test/reset': {
                post: {
                    tags: ['Test Utilities'],
                    summary: 'Reset and reseed the database',
                    description: '⚠️ DESTRUCTIVE — deletes all data and reseeds with fresh test data. Only available when NODE_ENV is not production.',
                    responses: {
                        200: { description: 'Database reset and reseeded successfully' },
                        403: { description: 'Not available in production' }
                    }
                }
            },
            '/api/test/seed': {
                post: {
                    tags: ['Test Utilities'],
                    summary: 'Seed database without clearing existing data',
                    responses: { 200: { description: 'Seed completed' }, 403: { description: 'Not available in production' } }
                }
            }
        }
    },
    apis: [],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = { swaggerUi, swaggerSpec };
