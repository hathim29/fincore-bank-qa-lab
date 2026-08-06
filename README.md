# FinCore Bank — QA Practice Lab

[![Playwright Tests](https://github.com/hathim29/fincore-bank-qa-lab/actions/workflows/playwright.yml/badge.svg)](https://github.com/hathim29/fincore-bank-qa-lab/actions/workflows/playwright.yml)

🌐 **Live Demo:** [https://fincore-qalab.com](https://fincore-qalab.com)

A full-stack banking application built as a QA automation practice target. Designed to demonstrate real-world quality engineering skills across the complete banking domain — customer onboarding, accounts, transactions, loans, credit cards, and role-based access control.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5 / CSS3 / Vanilla JS / Bootstrap 5 |
| Backend | Node.js + Express.js |
| Database | PostgreSQL (hosted on Supabase) |
| Testing — UI | Playwright + TypeScript (Page Object Model) |
| Testing — API | Postman + Newman |
| API Docs | Swagger UI (OpenAPI 3.0) |
| CI/CD | GitHub Actions |
| Icons | Tabler Icons |

---

## Features

- **Dashboard** — 12 clickable stat widgets, each navigating to the relevant filtered page
- **Customer Onboarding** — 4-step flow with PAN/Aadhaar KYC validation, processing animation, account creation
- **Customers** — Customer list with search, KYC management
- **Accounts** — Account number autocomplete search, freeze/unfreeze/close with mandatory reason and audit trail
- **Transactions** — Deposits, withdrawals, transfers across all banking channels (ATM, UPI-GPay, NEFT, RTGS etc.)
- **Loans** — Full lifecycle — creation, EMI repayment schedule, loan score, foreclosure, closure
- **Credit Cards** — Issuance, transaction history, full/minimum/custom payment, block/unblock
- **Role-based access** — Admin (full CRUD) and viewer (read-only) roles
- **API Documentation** — Swagger UI at `/api-docs`
- **Test Utilities** — `POST /api/test/reset` to reseed database for CI

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

```bash
cp .env.example .env
```

Edit `.env`:

```
DATABASE_URL=postgresql://username:password@host:5432/database
PORT=3000
```

### 4. Set up the database

Run `db/schema.sql` in your Supabase SQL Editor.

### 5. Seed the database

```bash
node db/seed.js
```

Generates: 20 customers, ~34 accounts, ~16 loans, ~15 credit cards, 500+ transactions.

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

### 8. View API docs

Navigate to `http://localhost:3000/api-docs`

---

## Running Playwright Tests

```bash
# Install browsers (first time only)
npx playwright install

# Run all tests
npx playwright test

# Run a specific spec
npx playwright test tests/specs/login.spec.ts

# Run in headed mode
npx playwright test --headed

# View HTML report
npx playwright show-report
```

---

## Automation Test Coverage

| Module | Spec File | Tests | Status |
|---|---|---|---|
| Login | login.spec.ts | 13 | ✅ Passing |
| Dashboard | dashboard.spec.ts | 21 | ✅ Passing |
| Customers | customers.spec.ts | 20 | ✅ Passing |
| Accounts | accounts.spec.ts | 23 | ✅ Passing |
| Transactions | transactions.spec.ts | 21 | ✅ Passing |
| Loans | loans.spec.ts | 23 | ✅ Passing |
| Credit Cards | credit-cards.spec.ts | 27 | ✅ Passing |
| Security | security.spec.ts | 9 | ✅ Passing |
| Onboarding | onboarding.spec.ts | 14 | ✅ Passing |
| **Total** | | **171** | **✅ All Passing** |

Full Page Object Model (POM) architecture — every page has a dedicated Page Object class. Tests use `data-testid` selectors throughout.

---

## API Testing — Postman

A complete Postman collection covering all 7 API modules — 37 requests, 215+ tests.

### Import into Postman

1. Open Postman → **Import**
2. Select `FinCore_Bank_API_Tests.postman_collection.json`
3. Also import `FinCore_Bank_Local.postman_environment.json`
4. Select **FinCore Bank — Local** environment
5. Click **Run collection**

### Coverage

| Folder | Requests | Tests |
|---|---|---|
| Dashboard | 3 | 9 |
| Customers | 6 | 18 |
| Accounts | 7 | 16 |
| Loans | 6 | 14 |
| Loan Repayments | 5 | 12 |
| Credit Cards | 9 | 22 |
| Transactions | 7 | 18 |
| **Total** | **37** | **109+** |

---

## API Documentation

Swagger UI is available at:
 **Local:** : `http://localhost:3000/api-docs`
 **Live:** : [https://fincore-qalab.com/api-docs](https://fincore-qalab.com/api-docs)

---

## Test Utilities

| Endpoint | Description |
|---|---|
| `GET /api/test/status` | Check availability |
| `POST /api/test/reset` | Truncate all tables and reseed (async — ~60s) |
| `POST /api/test/seed` | Seed without clearing |

> ⚠️ Test utilities are blocked in production (`NODE_ENV=production`).

---

## CI/CD

GitHub Actions runs the full 171-test Playwright suite on every push to main.

**Pipeline:** Checkout → Node 20 → Install → Playwright browsers → Create .env → Seed DB → Run tests → Upload report

The `DATABASE_URL` is stored as a GitHub Actions secret — never committed to the repository.

---

## Project Structure

```
fincore-bank-qa-lab/
├── db/
│   ├── connection.js        PostgreSQL connection pool
│   ├── schema.sql           Full database schema
│   └── seed.js              Seed script
├── public/
│   ├── css/style.css        Shared design system
│   ├── js/sidebar.js        Expandable sidebar
│   ├── images/              Logo assets
│   ├── login.html
│   ├── dashboard.html
│   ├── onboarding.html      Customer onboarding — 4-step flow
│   ├── customers.html
│   ├── accounts.html
│   ├── transactions.html
│   ├── loans.html
│   └── credit-cards.html
├── routes/
│   ├── customers.js
│   ├── accounts.js          Includes /search endpoint
│   ├── loans.js
│   ├── loanRepayments.js
│   ├── creditCards.js
│   ├── transactions.js
│   ├── dashboard.js
│   └── test.js              Test utility endpoints
├── tests/
│   ├── auth/                Saved auth state (gitignored)
│   ├── fixtures/testData.ts All test constants
│   ├── pages/               Page Object Model classes
│   │   ├── BasePage.ts
│   │   ├── LoginPage.ts
│   │   ├── DashboardPage.ts
│   │   ├── CustomersPage.ts
│   │   ├── AccountsPage.ts
│   │   ├── TransactionsPage.ts
│   │   ├── LoansPage.ts
│   │   └── CreditCardsPage.ts
│   └── specs/
│       ├── login.spec.ts
│       ├── dashboard.spec.ts
│       ├── customers.spec.ts
│       ├── accounts.spec.ts
│       ├── transactions.spec.ts
│       ├── loans.spec.ts
│       ├── credit-cards.spec.ts
│       ├── security.spec.ts
│       └── onboarding.spec.ts
├── .github/workflows/
│   └── playwright.yml       GitHub Actions CI
├── swagger.js               OpenAPI 3.0 specification
├── FinCore_Bank_API_Tests.postman_collection.json
├── FinCore_Bank_Local.postman_environment.json
├── CHALLENGES.md            QA challenge list — 20 scenarios
├── .env.example
└── server.js
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | /api/customers | Paginated customer list with search |
| POST | /api/customers | Create new customer |
| PUT | /api/customers/:id | Update customer |
| GET | /api/accounts | Paginated accounts with filters |
| GET | /api/accounts/search | Autocomplete search by account number |
| GET | /api/accounts/:id/audit | Account audit trail |
| PUT | /api/accounts/:id | Freeze/unfreeze/close account |
| GET | /api/loans | Paginated loans with filters |
| GET | /api/loans/:id | Loan detail with full EMI schedule |
| POST | /api/loans | Create new loan |
| PUT | /api/loans/:id | Foreclose or close loan |
| POST | /api/loan-repayments | Record EMI payment |
| GET | /api/loan-repayments | Repayment history for a loan |
| GET | /api/credit-cards | Paginated credit cards |
| POST | /api/credit-cards | Issue new credit card |
| POST | /api/credit-cards/:id/payment | Pay full/minimum/custom |
| PUT | /api/credit-cards/:id/status | Block or unblock card |
| GET | /api/transactions | Paginated transactions with filters |
| POST | /api/transactions | Create new transaction |
| GET | /api/dashboard/stats | All dashboard statistics (12 fields) |
| GET | /api/dashboard/alerts | Overdue loans and cards due soon |
| POST | /api/test/reset | Reset and reseed database |

---

## QA Challenges

See **[CHALLENGES.md](CHALLENGES.md)** for 20 QA scenarios across 5 levels — from beginner UI validation checks to advanced API security and automation challenges.

---

## Known Limitations

| Limitation | Reason |
|---|---|
| Authentication is client-side only | Intentional — creates role-based UI test scenarios |
| Passwords stored as plain text | Intentional lab simplification |
| Transaction balances not mathematically accurate | Seed data generates approximate values |
| Transfer type has no recipient account | For filter/display testing only |
| Credit card due date static | Generate Statement feature planned |
| Loan IDs are numeric | FNCB+type+initial+4digit format planned |

---

## Author

**Hathim Al Ghifari J**
Senior QA Engineer & Certified ScrumMaster
[LinkedIn](https://linkedin.com/in/hathimjk3)
[Live Demo](https://fincore-qalab.com) 
[GitHub](https://github.com/hathim29/fincore-bank-qa-lab)
