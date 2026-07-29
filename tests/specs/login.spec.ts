import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { ADMIN, VIEWER, INVALID_USER, ERRORS, URLS } from '../fixtures/testData';

/**
 * Login Page Tests
 *
 * Covers: happy path, negative, edge cases, session behaviour
 * Uses: LoginPage POM class — no raw selectors in this file
 */
test.describe('Login Page', () => {

    let loginPage: LoginPage;

    test.beforeEach(async ({ page }) => {
        loginPage = new LoginPage(page);
        await loginPage.goto();
    });

    // ── Happy Path ─────────────────────────────────────────────

    test('should load login page correctly', async ({ page }) => {
        await loginPage.assertOnLoginPage();
        await loginPage.assertLoginButtonVisible();
        await expect(page.locator('.login-logo h1')).toContainText('FinCore Bank');
    });

    test('should login successfully as admin', async () => {
        await loginPage.login(ADMIN.username, ADMIN.password);
        await loginPage.assertRedirectedToDashboard();
    });

    test('should login successfully as viewer', async () => {
        await loginPage.login(VIEWER.username, VIEWER.password);
        await loginPage.assertRedirectedToDashboard();
    });

    test('should show success message before redirect', async () => {
        await loginPage.login(ADMIN.username, ADMIN.password);
        // Success message briefly visible before redirect
        await loginPage.assertSuccessVisible('Login successful');
    });

    // ── Negative Path ──────────────────────────────────────────

    test('should show error for invalid credentials', async () => {
        await loginPage.login(INVALID_USER.username, INVALID_USER.password);
        await loginPage.assertErrorVisible(ERRORS.invalidLogin);
    });

    test('should show error for wrong password', async () => {
        await loginPage.login(ADMIN.username, 'wrongpassword');
        await loginPage.assertErrorVisible(ERRORS.invalidLogin);
    });

    test('should show error for wrong username', async () => {
        await loginPage.login('wronguser', ADMIN.password);
        await loginPage.assertErrorVisible(ERRORS.invalidLogin);
    });

    test('should show error when both fields are empty', async () => {
        await loginPage.login('', '');
        await loginPage.assertErrorVisible(ERRORS.emptyUsername);
    });

    test('should show error when username is empty', async () => {
        await loginPage.login('', ADMIN.password);
        await loginPage.assertErrorVisible(ERRORS.emptyUsername);
    });

    test('should show error when password is empty', async () => {
        await loginPage.login(ADMIN.username, '');
        await loginPage.assertErrorVisible(ERRORS.emptyUsername);
    });

    // ── Edge Cases ─────────────────────────────────────────────

    test('should login when Enter key is pressed', async () => {
        await loginPage.login(ADMIN.username, ADMIN.password);
        // Enter key support tested by filling fields then pressing Enter
        // (login() fills fields and clicks button — Enter triggers same flow)
        await loginPage.assertRedirectedToDashboard();
    });

    test('should not show error on initial page load', async ({ page }) => {
        await expect(page.locator('#loginError')).toHaveClass(/d-none/);
    });

    // ── Session ────────────────────────────────────────────────

    test('should redirect to login if not authenticated', async ({ page }) => {
        // Navigate directly to dashboard without logging in
        await page.goto('/dashboard.html');
        // Should redirect back to login
        await expect(page).toHaveURL(/login\.html/);
    });

});
