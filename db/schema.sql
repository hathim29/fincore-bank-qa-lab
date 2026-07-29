-- FinCore Bank — Complete Database Schema
-- Run this file to create all tables fresh
-- psql -U postgres -d fincore_bank -f schema.sql

-- Drop existing tables in correct order (foreign key dependencies)
DROP TABLE IF EXISTS loan_score CASCADE;
DROP TABLE IF EXISTS loan_repayments CASCADE;
DROP TABLE IF EXISTS credit_card_transactions CASCADE;
DROP TABLE IF EXISTS credit_cards CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS accounts CASCADE;
DROP TABLE IF EXISTS loans CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============================================================
-- USERS (for login — admin and viewer roles)
-- ============================================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- CUSTOMERS
-- ============================================================
CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(15) NOT NULL,
    city VARCHAR(50),
    kyc_status VARCHAR(20) DEFAULT 'pending' CHECK (kyc_status IN ('verified', 'pending', 'rejected')),
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- ACCOUNTS
-- ============================================================
CREATE TABLE accounts (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
    account_number VARCHAR(20) UNIQUE NOT NULL,
    account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('savings', 'current', 'salary')),
    balance NUMERIC(15, 2) DEFAULT 0.00,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'frozen', 'closed')),
    opened_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- TRANSACTIONS (general banking transactions)
-- ============================================================
CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
    customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('deposit', 'withdrawal', 'transfer')),
    channel VARCHAR(30) NOT NULL CHECK (channel IN ('cash', 'ATM', 'NEFT', 'RTGS', 'IMPS', 'UPI-GPay', 'UPI-PhonePe', 'UPI-Paytm', 'UPI-Other', 'cheque', 'branch')),
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    balance_after NUMERIC(15, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'success' CHECK (status IN ('success', 'failed', 'pending')),
    reference_number VARCHAR(30) UNIQUE NOT NULL,
    description TEXT,
    linked_loan_id INTEGER REFERENCES loans(id) ON DELETE SET NULL,
    linked_card_id INTEGER REFERENCES credit_cards(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- LOANS
-- ============================================================
CREATE TABLE loans (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
    account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    loan_type VARCHAR(30) NOT NULL CHECK (loan_type IN ('personal', 'home', 'auto', 'education', 'business')),
    principal_amount NUMERIC(15, 2) NOT NULL,
    interest_rate NUMERIC(5, 2) NOT NULL,
    tenure_months INTEGER NOT NULL,
    emi_amount NUMERIC(15, 2) NOT NULL,
    outstanding_balance NUMERIC(15, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'closed', 'foreclosed', 'overdue')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    applied_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- LOAN REPAYMENTS
-- ============================================================
CREATE TABLE loan_repayments (
    id SERIAL PRIMARY KEY,
    loan_id INTEGER REFERENCES loans(id) ON DELETE CASCADE,
    customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
    emi_number INTEGER NOT NULL,
    emi_amount NUMERIC(15, 2) NOT NULL,
    due_date DATE NOT NULL,
    paid_date DATE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('paid', 'pending', 'overdue')),
    payment_channel VARCHAR(30) CHECK (payment_channel IN ('cash', 'NEFT', 'RTGS', 'IMPS', 'UPI-GPay', 'UPI-PhonePe', 'UPI-Paytm', 'auto-debit', 'cheque')),
    reference_number VARCHAR(30),
    days_delayed INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- LOAN SCORE
-- ============================================================
CREATE TABLE loan_score (
    id SERIAL PRIMARY KEY,
    loan_id INTEGER UNIQUE REFERENCES loans(id) ON DELETE CASCADE,
    customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
    score INTEGER NOT NULL CHECK (score BETWEEN 300 AND 900),
    on_time_payments INTEGER DEFAULT 0,
    delayed_payments INTEGER DEFAULT 0,
    missed_payments INTEGER DEFAULT 0,
    last_calculated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- CREDIT CARDS
-- ============================================================
CREATE TABLE credit_cards (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
    card_number VARCHAR(20) NOT NULL,
    card_number_masked VARCHAR(20) NOT NULL,
    card_type VARCHAR(20) NOT NULL CHECK (card_type IN ('Visa', 'Mastercard', 'RuPay')),
    credit_limit NUMERIC(15, 2) NOT NULL,
    outstanding_balance NUMERIC(15, 2) DEFAULT 0.00,
    minimum_due NUMERIC(15, 2) DEFAULT 0.00,
    due_date DATE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'blocked', 'expired')),
    issued_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- CREDIT CARD TRANSACTIONS
-- ============================================================
CREATE TABLE credit_card_transactions (
    id SERIAL PRIMARY KEY,
    card_id INTEGER REFERENCES credit_cards(id) ON DELETE CASCADE,
    customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('purchase', 'refund', 'cashback', 'payment')),
    merchant_name VARCHAR(100),
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    status VARCHAR(20) DEFAULT 'success' CHECK (status IN ('success', 'failed', 'pending')),
    reference_number VARCHAR(30) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- INDEXES for performance
-- ============================================================
CREATE INDEX idx_accounts_customer ON accounts(customer_id);
CREATE INDEX idx_transactions_account ON transactions(account_id);
CREATE INDEX idx_transactions_customer ON transactions(customer_id);
CREATE INDEX idx_transactions_type ON transactions(transaction_type);
CREATE INDEX idx_transactions_date ON transactions(created_at);
CREATE INDEX idx_loans_customer ON loans(customer_id);
CREATE INDEX idx_loan_repayments_loan ON loan_repayments(loan_id);
CREATE INDEX idx_credit_cards_customer ON credit_cards(customer_id);
CREATE INDEX idx_cc_transactions_card ON credit_card_transactions(card_id);

-- ============================================================
-- DEFAULT USERS
-- ============================================================
INSERT INTO users (username, password, role) VALUES
('admin', 'admin123', 'admin'),
('viewer', 'viewer123', 'viewer');