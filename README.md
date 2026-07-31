[![FinCore Bank — Playwright Tests](https://github.com/hathim29/fincore-bank-qa-lab/actions/workflows/playwright.yml/badge.svg)](https://github.com/hathim29/fincore-bank-qa-lab/actions/workflows/playwright.yml)

# FinCore Bank — QA Practice Lab

A full-stack banking application built as a QA automation practice target. Designed to demonstrate real-world quality engineering skills across the complete banking domain — customers, accounts, transactions, loans, credit cards, and role-based access control.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5 / CSS3 / Vanilla JS / Bootstrap 5 |
| Backend | Node.js + Express.js |
| Database | PostgreSQL (hosted on Supabase) |
| Testing | Playwright + TypeScript (POM) |
| Icons | Tabler Icons |

---

## Features

- **Dashboard** — live stats, recent transactions, overdue loans and cards due soon
- **Customers** — CRUD, KYC management, account creation per customer
- **Accounts** — freeze / unfreeze / close with mandatory reason and full audit trail
- **Transactions** — deposits, withdrawals, transfers across all banking channels (ATM, UPI-GPay, NEFT, RTGS etc.)
- **Loans** — full lifecycle — creation, EMI repayment schedule, loan score, foreclosure, closure
- **Credit Cards** — issuance, transaction history, full / minimum / custom payment, block / unblock
- **Role-based access** — admin (full CRUD) and viewer (read-only) roles

---

## Quick Start

### Prerequisites

- Node.js 18+
- A PostgreSQL database (Supabase free tier works perfectly)
- npm

### 1. Clone the repo

```bash
git clone https://github.com/hathim29/fincore-bank-qa-lab.git
cd fincore-bank-qa-lab
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Copy the example file and fill in your database details:

```bash
cp .env.example .env
```

Edit `.env`:

```
DATABASE_URL=postgresql://username:password@host:5432/database
PORT=3000
```

### 4. Set up the database

Run the schema in your PostgreSQL database. If using Supabase:

1. Go to your Supabase project → SQL Editor
2. Open `db/schema.sql`, copy the contents, paste and run
3. You should see "Success. No rows returned"

### 5. Seed the database

```bash
node db/seed.js
```

This generates:
- 20 customers with realistic Indian names and cities
- ~34 accounts (savings / current / salary)
- ~16 loans with full EMI schedules and repayment history
- ~15 credit cards with transactions
- 500+ general banking transactions across all channels

### 6. Start the server

```bash
npm run dev
```

Server runs at `http://localhost:3000`

### 7. Open the app

Navigate to `http://localhost:3000/login.html`

**Demo credentials:**

| Role | Username | Password |
|---|---|---|
| Admin | admin | admin123 |
| Viewer | viewer | viewer123 |

---

## Running Tests

### Install Playwright browsers (first time only)

```bash
npx playwright install
```

### Run all tests

```bash
npx playwright test
```

### Run a specific spec

```bash
npx playwright test tests/customers.spec.ts
```

### View HTML report

```bash
npx playwright show-report
```

---

## Project Structure

```
fincore-bank-qa-lab/
├── db/
│   ├── connection.js        PostgreSQL connection pool
│   ├── schema.sql           Full database schema — run this first
│   └── seed.js              Seed script — run: node db/seed.js
├── public/
│   ├── css/
│   │   └── style.css        Shared design system — dark sidebar layout
│   ├── js/
│   │   └── sidebar.js       Expandable sidebar toggle (shared across all pages)
│   ├── login.html
│   ├── dashboard.html
│   ├── customers.html
│   ├── accounts.html
│   ├── transactions.html
│   ├── loans.html
│   └── credit-cards.html
├── routes/
│   ├── customers.js
│   ├── accounts.js
│   ├── loans.js
│   ├── loanRepayments.js
│   ├── creditCards.js
│   ├── transactions.js
│   └── dashboard.js
├── tests/
│   └── customers.spec.ts    9 test cases — all passing
├── .env.example             Environment variable template
├── .gitignore
├── package.json
├── playwright.config.ts
└── server.js                Entry point
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | /api/customers | Paginated customer list with search |
| POST | /api/customers | Create new customer |
| PUT | /api/customers/:id | Update customer |
| GET | /api/accounts | Paginated accounts with filters |
| GET | /api/accounts/:id/audit | Account audit trail |
| PUT | /api/accounts/:id | Update account status (freeze/unfreeze/close) |
| GET | /api/loans | Paginated loans with filters |
| GET | /api/loans/:id | Full loan detail with EMI schedule |
| POST | /api/loans | Create new loan |
| PUT | /api/loans/:id | Update loan status (foreclose/close) |
| POST | /api/loan-repayments | Record EMI payment |
| GET | /api/credit-cards | Paginated credit cards |
| POST | /api/credit-cards | Issue new credit card |
| POST | /api/credit-cards/:id/payment | Make payment (full/minimum/custom) |
| PUT | /api/credit-cards/:id/status | Block or unblock card |
| GET | /api/transactions | Paginated transactions with filters |
| POST | /api/transactions | Create new transaction (admin only) |
| GET | /api/dashboard/stats | Dashboard summary counts |
| GET | /api/dashboard/alerts | Overdue loans and cards due soon |

---

## Known Limitations

These are intentional simplifications for a QA practice lab — not production bugs:

| Limitation | Reason |
|---|---|
| Authentication is client-side only | Intentional — purpose is to create role-based UI test scenarios, not secure real data |
| Passwords stored as plain text | Intentional for lab simplicity — not a production pattern |
| Transaction balance figures not mathematically accurate | Seed data generates approximate values for display testing |
| Transfer type has no recipient account | Transfer is a transaction type for filter/display testing only |
| Credit card due date does not advance on billing cycle | Static field — Generate Statement feature planned |
| Loan IDs are numeric | FNCB+type+initial+4digit format planned for next iteration |

---

## Automation Test Coverage (In Progress)

| Module | Spec File | Status |
|---|---|---|
| Login | login.spec.ts | Planned |
| Dashboard | dashboard.spec.ts | Planned |
| Customers | customers.spec.ts | ✅ 9 tests passing |
| Accounts | accounts.spec.ts | Planned |
| Transactions | transactions.spec.ts | Planned |
| Loans | loans.spec.ts | Planned |
| Credit Cards | credit-cards.spec.ts | Planned |

Full Page Object Model (POM) implementation in progress.

---

## Author

**Hathim Al Ghifari J**
Senior QA Engineer & Certified ScrumMaster
[LinkedIn](https://linkedin.com/in/hathimjk3)
