import { chromium, FullConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Global Setup — runs ONCE before the entire test suite
 *
 * Logs in as admin and viewer, saves browser session state to:
 *   tests/auth/adminState.json
 *   tests/auth/viewerState.json
 *
 * All test specs load from these saved states instead of
 * logging in fresh on every beforeEach — saves ~3s per test.
 */
async function globalSetup(config: FullConfig) {
    const { baseURL } = config.projects[0].use;
    const authDir = path.join(__dirname, 'auth');

    // Create auth directory if it doesn't exist
    if (!fs.existsSync(authDir)) {
        fs.mkdirSync(authDir, { recursive: true });
    }

    const browser = await chromium.launch();

    // ── Save ADMIN session ─────────────────────────────────────
    const adminContext = await browser.newContext();
    const adminPage    = await adminContext.newPage();

    await adminPage.goto(`${baseURL}/login.html`);
    await adminPage.getByTestId('username-input').fill('admin');
    await adminPage.getByTestId('password-input').fill('admin123');
    await adminPage.getByTestId('login-button').click();
    await adminPage.waitForURL(/dashboard\.html/, { timeout: 10000 });

    await adminContext.storageState({
        path: path.join(authDir, 'adminState.json')
    });
    console.log('✅ Admin auth state saved');
    await adminContext.close();

    // ── Save VIEWER session ────────────────────────────────────
    const viewerContext = await browser.newContext();
    const viewerPage    = await viewerContext.newPage();

    await viewerPage.goto(`${baseURL}/login.html`);
    await viewerPage.getByTestId('username-input').fill('viewer');
    await viewerPage.getByTestId('password-input').fill('viewer123');
    await viewerPage.getByTestId('login-button').click();
    await viewerPage.waitForURL(/dashboard\.html/, { timeout: 10000 });

    await viewerContext.storageState({
        path: path.join(authDir, 'viewerState.json')
    });
    console.log('✅ Viewer auth state saved');
    await viewerContext.close();

    await browser.close();
}

export default globalSetup;
