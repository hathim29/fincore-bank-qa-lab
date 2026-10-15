import { defineConfig, devices } from '@playwright/test';

const extraBrowsers = (process.env.FINCORE_BROWSERS || '').split(',');

// Target environment — Local by default. Point the suite at another environment with
// BASE_URL, e.g.  BASE_URL=https://fincore-qalab.com npm run dashboard
const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const IS_LOCAL = /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE_URL);

export default defineConfig({
    // ── Test directory ─────────────────────────────────────────
    testDir: './tests/specs',

    // ── Base URL — all page.goto('/login.html') resolves to this
    use: {
        baseURL: BASE_URL,

        // Keep trace, screenshot and video for every failed attempt —
        // the live dashboard (npm run test:dashboard) shows them per failure
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },

    // ── Reporters ──────────────────────────────────────────────
    // Live dashboard: npm run test:dashboard
    // (adds ./tests/reporters/live-dashboard/reporter.ts from the command line)
    reporter: [
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
        ['list'],
    ],

    // ── Global test settings ───────────────────────────────────
    timeout: 30000,          // 30s per test
    expect: {
        timeout: 8000,       // 8s for assertions
    },
    fullyParallel: false,    // Run sequentially — shared DB state
    retries: 1,              // Retry once on CI
    workers: 1,              // Single worker — avoids race conditions on shared data

    // ── Browser matrix ─────────────────────────────────────────
    projects: [
        // Setup project — creates auth state files
        {
            name: 'setup',
            testMatch: /global-setup\.ts/,
        },

        // Chromium — primary
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
            },
            dependencies: ['setup'],
        },

        // Firefox / WebKit — added only when requested, e.g. from the dashboard's
        // Run panel (FINCORE_BROWSERS=firefox,webkit). CI and plain runs stay Chromium-only.
        ...(extraBrowsers.includes('firefox') ? [{
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
            dependencies: ['setup'],
        }] : []),
        ...(extraBrowsers.includes('webkit') ? [{
            name: 'webkit',
            use: { ...devices['Desktop Safari'] },
            dependencies: ['setup'],
        }] : []),
    ],

    // ── Web server — auto-starts the local app (Local runs only) ─
    webServer: IS_LOCAL ? {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,  // always reuse — avoids port conflicts
        timeout: 20000,
    } : undefined,
});
