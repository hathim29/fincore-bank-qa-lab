# Live Test Dashboard: How-To Guide

A live, browser-based dashboard for the FinCore Bank Playwright suite. You can watch tests run, triage failures, drill into any spec or test, see run history, and start, re-run or stop runs from the browser.

- **No extra dependencies.** It's plain Node.js plus a custom Playwright reporter.
- **It runs only on your own machine:** `http://localhost:9400` (127.0.0.1).
- **Code:** [`tests/reporters/live-dashboard/`](../tests/reporters/live-dashboard/)

---

## Contents

1. [Prerequisites](#1-prerequisites)
2. [Quick start](#2-quick-start)
3. [Two ways to use it](#3-two-ways-to-use-it)
4. [Run all tests](#4-run-all-tests)
5. [Run a single spec](#5-run-a-single-spec)
6. [Run a single test](#6-run-a-single-test)
7. [Re-run failed tests](#7-re-run-failed-tests)
8. [Stop a run](#8-stop-a-run)
9. [Browsers and headed mode](#9-browsers-and-headed-mode)
10. [Choose the environment (`BASE_URL`)](#10-choose-the-environment-base_url)
11. [Reading the dashboard](#11-reading-the-dashboard)
12. [Reports and run history](#12-reports-and-run-history)
13. [All options](#13-all-options)
14. [Troubleshooting](#14-troubleshooting)
15. [FAQ](#15-faq)

---

## 1. Prerequisites

You only need to do this once:

```bash
npm install
npx playwright install chromium        # Firefox / WebKit are optional — see section 9
```

You also need a `.env` file with `DATABASE_URL` (see the main [README](../README.md#3-set-up-environment-variables)). For local runs, Playwright starts the FinCore server (`npm run dev`) automatically if it isn't already running.

---

## 2. Quick start

```bash
npm run dashboard
```

1. The dashboard opens at **http://localhost:9400** and starts a **full run** straight away.
2. Watch the progress ring, counters, per-spec progress and live feed.
3. When the run finishes, click a failure, any spec or any test to see the details.
4. Use **▶ Run…** or **↻ Re-run failed** to go again. You don't need the terminal.
5. Press **Ctrl+C** in the terminal to close the dashboard.

To open the dashboard **without** starting a run, for example to review history:

```bash
npm run dashboard -- --no-run
```

---

## 3. Two ways to use it

| Command | What it is | Best for |
|---|---|---|
| `npm run dashboard` | **Permanent dashboard.** It stays open and starts, re-runs and stops test runs from the browser. | Day-to-day use and demos |
| `npm run test:dashboard` | **One-off run.** It runs tests once from the command line and shows them live on the dashboard. | Quick runs from the terminal, scripts |

Both modes produce the same dashboard, the same shareable report and the same run history. Run controls (Run / Re-run failed / Stop) are only available with `npm run dashboard`.

> `npm run test:dashboard` keeps the dashboard open after the run so you can explore it. Press **Ctrl+C** to quit.

---

## 4. Run all tests

**From the dashboard:**
- `npm run dashboard` starts a full run automatically.
- Or click **▶ Run…**, choose **All tests**, then **▶ Start run**.

**From the command line:**
```bash
npm run test:dashboard
```

---

## 5. Run a single spec

**From the dashboard:**
- Click **▶ Run…**, choose **One spec**, pick it from the dropdown (e.g. `loans (23)`), then **▶ Start run**.
- **Or** click a spec in the **Spec files** panel to open it, then click **▶ Run this spec**.

**From the command line:** put the spec path after `--`.
```bash
npm run test:dashboard -- tests/specs/login.spec.ts
```

Several specs at once:
```bash
npm run test:dashboard -- tests/specs/loans.spec.ts tests/specs/known-bugs.spec.ts
```

---

## 6. Run a single test

**From the dashboard:**
- Click **▶ Run…**, choose **One test**, type part of the test name in the search box, pick it from the results, then **▶ Start run**.
- **Or** open any test's detail window and click **↻ Re-run this test**.

**From the command line**, by file and line number:
```bash
npm run test:dashboard -- tests/specs/login.spec.ts:28
```

…or by name, which matches any test whose title contains the text:
```bash
npm run test:dashboard -- -g "should login successfully as admin"
```

---

## 7. Re-run failed tests

After a run with failures or flaky tests, the header shows **↻ Re-run failed (N)**. One click re-runs exactly those tests, in the same browsers.

You can also pick **Failed & flaky from last run** in the **▶ Run…** panel.

From the command line, Playwright's own option does the same thing:
```bash
npm run test:dashboard -- --last-failed
```

---

## 8. Stop a run

While a run is in progress, the header shows **■ Stop run**. Clicking it ends the run cleanly. The run is marked **Stopped**, and the results so far are kept in the report and history.

In `test:dashboard` mode, press **Ctrl+C** in the terminal instead.

---

## 9. Browsers and headed mode

In the **▶ Run…** panel:
- **Browsers:** tick Chromium, Firefox and/or WebKit (Safari).
  - A browser that isn't installed is shown with its install command:
    ```bash
    npx playwright install firefox webkit
    ```
  - Ticking more than one browser shows a run-time warning. Browsers run one after another, so 3 browsers take about 3× as long.
- **Headed:** shows the browser window while the tests run, which is good for demos and debugging.

From the command line, the extra browsers are switched on with `FINCORE_BROWSERS`:
```bash
FINCORE_BROWSERS=firefox npm run test:dashboard -- --project=chromium --project=firefox    # macOS / Linux / Git Bash
```
```powershell
$env:FINCORE_BROWSERS="firefox"; npm run test:dashboard -- --project=chromium --project=firefox   # PowerShell
```
Headed from the command line:
```bash
npm run test:dashboard -- --headed
```

> **Workers:** runs always use 1 worker. The tests share one database, so running them in parallel would make them interfere with each other.
>
> **CI:** CI is unaffected. It stays Chromium-only and doesn't use the dashboard.

---

## 10. Choose the environment (`BASE_URL`)

Runs target **Local** (`http://localhost:3000`) by default. To point the same suite at another environment, set `BASE_URL` before starting the dashboard (or a CLI run):

| Environment | `BASE_URL` |
|---|---|
| **Local** (default) | *(not set)* or `http://localhost:3000` |
| **SIT** | `https://fincore-qalab.com` |
| **DEV** | `https://dev.fincore-qalab.com` |
| A developer's own environment | its URL, e.g. `http://192.168.1.20:3000` |

**macOS / Linux / Git Bash:**
```bash
BASE_URL=https://fincore-qalab.com npm run dashboard
BASE_URL=https://fincore-qalab.com npm run test:dashboard -- tests/specs/login.spec.ts
```

**Windows PowerShell:**
```powershell
$env:BASE_URL="https://fincore-qalab.com"; npm run dashboard

# Back to Local afterwards (the variable stays set in this PowerShell window):
Remove-Item Env:BASE_URL
```

**Windows Command Prompt (cmd):**
```cmd
set "BASE_URL=https://fincore-qalab.com" && npm run dashboard
```

What changes when `BASE_URL` is set:
- Every page visit and API call in the tests goes to that address.
- The local FinCore server is **not** started. It's only needed for Local.
- The environment is shown in the header (**Env: SIT · fincore-qalab.com**), in the run label and in **Recent runs**, so every result is tagged with where it ran.

> ⚠️ The suite creates and changes data: it adds customers, freezes accounts and pays EMIs. Only point it at an environment where that's acceptable.

---

## 11. Reading the dashboard

**Header:** run controls, elapsed time and ETA, workers and retries, environment, and run status.

**Progress:** the ring and bar are coloured by result, alongside the test running right now.

**Spec files:** progress for each spec. **Click a spec** to open its tests, grouped by `describe` or sorted *slowest first*. Each test shows its result, duration, attempts and a history strip.

**Failures & triage:** every failure is classified after retries. Use the filter chips to focus on one type. **Click a failure** to open its detail window.

| Type | How it's decided | Reliable? |
|---|---|---|
| **Flaky** | Failed, then passed on retry | ✅ Exact (reported by Playwright) |
| **Known bug** | Test has a `known-bug` annotation and is declared with `test.fail()` | ✅ Exact (set by the QA engineer) |
| **Likely app bug** | An `expect()` assertion failed | ⚠️ First-pass guess |
| **Likely test / env issue** | Timeout, locator, overlay or network problem with no failed assertion | ⚠️ First-pass guess |
| **Needs triage** | Anything else | ⚠️ Needs a human look |

**Test detail window** (passed or failed):
- **Why it's classified** the way it is
- **Run history:** a duration bar for each run, coloured by result, plus counts of passed / failed / flaky, average time, and the latest run compared with the average
- **Each attempt:** the error and code snippet, and the steps with the failed one highlighted
- **Failed attempts only:** the screenshot, video and trace. **⬇ Download trace**, then open it with `npx playwright show-trace <file>` or on [trace.playwright.dev](https://trace.playwright.dev).

**Live feed:** the latest results. Click any of them for its details.

**Recent runs:** the last 20 runs, showing what ran, the browsers, the environment, the result mix and the duration.

---

## 12. Reports and run history

| Output | Location | Notes |
|---|---|---|
| **Shareable report** | `live-dashboard-report/index.html` | A static copy of the latest run with screenshots, videos and traces. Open it in any browser or share the folder. |
| **Run history** | `live-dashboard-history/*.json` | One small file per run. The last 20 are kept and older ones are deleted. |
| **Raw Playwright output** | `test-results/` | Playwright's own artifacts, cleared at the start of each run |

All three are git-ignored. History is per machine, so each person builds up their own.

---

## 13. All options

**`npm run dashboard` flags:**

| Flag | Effect |
|---|---|
| `--no-run` | Open the dashboard without starting a run |
| `--port 9500` | Use another port (default 9400) |

Example: `npm run dashboard -- --no-run --port 9500`

**Environment variables:**

| Variable | Default | Effect |
|---|---|---|
| `BASE_URL` | `http://localhost:3000` | Environment the tests run against (section 10) |
| `LIVE_DASHBOARD_PORT` | `9400` | Dashboard port. `test:dashboard` tries the next free port if it's busy. |
| `LIVE_DASHBOARD_OPEN` | `1` | Set `0` to stop the dashboard opening in your browser automatically |
| `LIVE_DASHBOARD_EXIT` | `0` | `test:dashboard` only: set `1` to exit as soon as the run ends |
| `FINCORE_BROWSERS` | *(empty)* | Comma list (`firefox,webkit`) to add those browser projects. The dashboard sets this for you. |
| `CI` | — | On CI the dashboard never opens a browser or blocks |

---

## 14. Troubleshooting

**"Live dashboard could not start … EADDRINUSE" or the port is busy**
Another dashboard is already using port 9400. `npm run dashboard` simply opens the existing one, and `test:dashboard` moves to the next free port (9401…). To free the port on Windows:
```powershell
Stop-Process -Id (Get-NetTCPConnection -LocalPort 9400).OwningProcess
```

**`Cannot find module 'list ./tests/reporters/…'` (PowerShell)**
PowerShell splits on the comma in `--reporter=list,./…`. Use the npm scripts (`npm run test:dashboard -- …`), or quote it:
```powershell
npx playwright test --reporter="list,./tests/reporters/live-dashboard/reporter.ts"
```

**"Firefox is not installed" or "WebKit is not installed"**
Run `npx playwright install firefox webkit`, then reopen the Run panel.

**The history strips say "no history yet"**
History builds up from your first run on this machine. Run the suite a few times.

**Every test fails with a timeout or "expected dashboard.html"**
Usually the app server or database isn't reachable. Check that `npm run dev` works and that `DATABASE_URL` in `.env` is correct. For non-local runs, check that `BASE_URL` is correct and reachable.

**A new spec doesn't appear in the "One spec" dropdown**
The test list refreshes after each run. Run anything once, or restart `npm run dashboard`.

---

## 15. FAQ

**Where do the tests actually run?**
On your machine, in a real browser, against `BASE_URL` (Local by default). The data comes from the database your FinCore server uses.

**Does CI use the dashboard?**
No. CI runs `npx playwright test --reporter=list` as before, Chromium-only. The dashboard is a local tool.

**Why "likely" app bug?**
Failure types other than *Flaky* and *Known bug* are automatic first-pass guesses. They speed up triage, but a QA engineer confirms them before a defect is raised.

**What are the known-bug tests?**
`tests/specs/known-bugs.spec.ts` contains regression tests for open defects (Known Bug 1 and 2). Each one asserts the *correct* behaviour and is declared with `test.fail()`, so CI stays green while the bug is open. When the bug is fixed, the test passes, Playwright flags it, and `test.fail()` should be removed.
