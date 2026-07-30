import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    // ── Test directory ─────────────────────────────────────────
    testDir: './tests/specs',

    // ── Base URL — all page.goto('/login.html') resolves to this
    use: {
        baseURL: 'http://localhost:3000',

        // Collect trace on first retry — useful for debugging CI failures
        trace: 'on-first-retry',

        // Screenshot on failure
        screenshot: 'only-on-failure',

        // Video on first retry
        video: 'on-first-retry',
    },

    // ── Reporters ──────────────────────────────────────────────
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

        // Firefox — secondary (run locally only)
        // {
        //     name: 'firefox',
        //     use: { ...devices['Desktop Firefox'] },
        //     dependencies: ['setup'],
        // },

        // WebKit — secondary (run locally only)
        // {
        //     name: 'webkit',
        //     use: { ...devices['Desktop Safari'] },
        //     dependencies: ['setup'],
        // },
    ],

    // ── Web server — auto-starts server before tests ───────────
    webServer: {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,  // always reuse — avoids port conflicts
        timeout: 20000,
    },
});
