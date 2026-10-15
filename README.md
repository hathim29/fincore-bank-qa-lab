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

# Live test dashboard: opens http://localhost:9400 and starts a full run
npm run dashboard
```

### Live Test Dashboard

📘 **Full how-to guide:** [docs/LIVE_DASHBOARD.md](docs/LIVE_DASHBOARD.md). It covers running all tests, a single spec or a single test, re-runs, browsers and environments (`BASE_URL`), plus troubleshooting.

A custom Playwright reporter plus a small local server (`tests/reporters/live-dashboard/`). It has no extra dependencies and works offline.

```bash
npm run dashboard                 # open the dashboard and start a full run
npm run dashboard -- --no-run     # open it without starting a run (e.g. to review history)
npm run test:dashboard            # one-off run that hosts its own dashboard
npm run test:dashboard -- tests/specs/login.spec.ts    # one-off run of a single spec
```

**Watch a run live**
- Progress ring and bar, elapsed time and ETA, and the test running right now
- Per-spec progress and a live feed of results

**Drill into anything**
- Click a **spec** to see all its tests, grouped by `describe` or sorted slowest first
- Click any **test**, passed or failed, to open its detail window:
  - every attempt, with the error and code snippet
  - the steps, with the failed step highlighted
  - the screenshot, video and trace (these are kept for failed attempts only)

**Run history**
- The last 20 runs are saved to `live-dashboard-history/` (git-ignored)
- Every test shows a pass/fail strip, and its detail window shows a duration trend plus stats: passed / failed / flaky counts, average time, and the latest run compared with the average
- A **Recent runs** list sits on the main page

**Run controls** (`npm run dashboard` only)
- **▶ Run…** picks what to run: all tests, failed & flaky from the last run, one spec, or one test (searchable)
- It can also choose browsers (Chromium · Firefox · WebKit) and headed mode. Firefox and WebKit need a one-time `npx playwright install firefox webkit`. Picking several browsers shows a run-time warning, because each browser runs one after another.
- **↻ Re-run failed** is a one-click re-run of the last run's failures. **■ Stop** ends a run in progress.
- Runs always use 1 worker: the tests share one database, so running them in parallel would make them interfere with each other.

**Failure triage:** every failure is classified after retries:

| Type | How it's decided |
|---|---|
| **Flaky** | Failed, then passed on retry (reported by Playwright) |
| **Known bug** | Test is tagged with a `known-bug` annotation and declared with `test.fail()` |
| **Likely app bug** | An `expect()` assertion failed |
| **Likely test / env issue** | Timeout, locator, overlay or network problem with no failed assertion |
| **Needs triage** | Anything else |

*Flaky* and *Known bug* are exact. The other three are first-pass guesses for a QA engineer to confirm.

**Shareable report:** a static copy of every run, history included, is saved to `live-dashboard-report/index.html`.

**Environments:** runs target **Local** (`http://localhost:3000`) by default, and Playwright starts the local server for you. To run the same suite against another environment, set `BASE_URL`. The local server isn't started for non-local runs, and every run is tagged with its environment in the header, run label and history.

```bash
BASE_URL=https://fincore-qalab.com npm run dashboard          # macOS / Linux / Git Bash
$env:BASE_URL="https://fincore-qalab.com"; npm run dashboard  # Windows PowerShell
```

> **Windows / PowerShell:** to pass the reporter on the command line yourself, quote it: `--reporter="list,./tests/reporters/live-dashboard/reporter.ts"`. The npm scripts above avoid this.

Options: `LIVE_DASHBOARD_PORT` (default 9400), `LIVE_DASHBOARD_OPEN=0` (don't open the browser), `LIVE_DASHBOARD_EXIT=1` (`test:dashboard` only: don't keep serving after the run). On CI it never opens a browser or blocks, and CI stays Chromium-only.

### Known bugs as tests

`tests/specs/known-bugs.spec.ts` holds regression tests for open defects. Each asserts the *correct* behaviour and is declared with `test.fail()`, so CI stays green while the bug is open. When the bug is fixed, the test passes, Playwright flags it, and `test.fail()` should be removed.

| Tag | Defect |
|---|---|
| Known Bug 1 | EMI due dates returned as UTC timestamps, shifting by one day in non-UTC time zones |
| Known Bug 2 | EMI schedule mixes two date sources: duplicate or out-of-order due dates and an inflated overdue count |

**Fixed:** BUG-FC-103, dashboard cards showing 0. The stats API never sent `total_cards`, `blocked_cards`, `frozen_accounts`, `closed_accounts` or `closed_loans`, and the page's `|| 0` fallback turned each missing field into a believable zero (Total Cards 0 instead of 17). The API now returns every field, the page shows "—" instead of 0 if a field is ever missing, and `dashboard.spec.ts` checks each card against the matching list API total.

---

## Automation Test Coverage

| Module | Spec File | Tests | Status |
|---|---|---|---|
| Login | login.spec.ts | 13 | ✅ Passing |
| Dashboard | dashboard.spec.ts | 33 | ✅ Passing |
| Customers | customers.spec.ts | 20 | ✅ Passing |
| Accounts | accounts.spec.ts | 23 | ✅ Passing |
| Transactions | transactions.spec.ts | 21 | ✅ Passing |
| Loans | loans.spec.ts | 23 | ✅ Passing |
| Credit Cards | credit-cards.spec.ts | 27 | ✅ Passing |
| Security | security.spec.ts | 9 | ✅ Passing |
| Onboarding | onboarding.spec.ts | 13 | ✅ Passing |
| Known Bugs | known-bugs.spec.ts | 2 | 🐞 Expected to fail (open defects) |
| **Total** | | **184** | |

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

GitHub Actions runs the full 184-test Playwright suite on every push to main.

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
