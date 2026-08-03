import { test, expect } from '@playwright/test';
import { DashboardPage } from '../pages/DashboardPage';

/**
 * Dashboard Page Tests
 * Covers: page load, 12 stat cards, navigation, recent transactions, RBAC
 */

// ── Admin tests ────────────────────────────────────────────────
test.describe('Dashboard Page — Admin', () => {

    let dashboardPage: DashboardPage;

    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            sessionStorage.setItem('fincore_user', JSON.stringify({ username: 'admin', role: 'admin' }));
        });
        dashboardPage = new DashboardPage(page);
        await dashboardPage.goto();
    });

    // ── Happy Path ─────────────────────────────────────────────

    test('should load dashboard page', async () => {
        await dashboardPage.assertOnDashboard();
    });

    test('should show page title', async ({ page }) => {
        await expect(page.locator('.page-title')).toBeVisible();
    });

    test('should show all stat cards', async () => {
        await dashboardPage.assertStatCardsVisible();
    });

    test('should load stat cards with data', async () => {
        await dashboardPage.assertStatCardsLoaded();
    });

    test('should show total customers above zero', async () => {
        const total = await dashboardPage.getTotalCustomers();
        expect(total).toBeGreaterThan(0);
    });

    test('should show active accounts above zero', async () => {
        const total = await dashboardPage.getActiveAccounts();
        expect(total).toBeGreaterThan(0);
    });

    test('should show recent transactions table', async () => {
        await dashboardPage.assertRecentTransactionsVisible();
    });

    test('should show recent transactions with rows', async () => {
        await dashboardPage.assertRecentTransactionsHasRows();
    });

    // ── Stat card navigation ────────────────────────────────────

    test('clicking customers stat card navigates to customers page', async () => {
        await dashboardPage.clickStatCustomers();
        await expect(dashboardPage['page']).toHaveURL(/customers\.html/);
    });

    test('clicking accounts stat card navigates to accounts page', async () => {
        await dashboardPage.clickStatAccounts();
        await expect(dashboardPage['page']).toHaveURL(/accounts\.html/);
    });

    test('clicking active loans stat card navigates to loans page', async () => {
        await dashboardPage.clickStatLoans();
        await expect(dashboardPage['page']).toHaveURL(/loans\.html/);
    });

    test('clicking overdue loans stat card navigates to loans page with filter', async () => {
        await dashboardPage.clickStatOverdue();
        await expect(dashboardPage['page']).toHaveURL(/loans\.html/);
    });

    test('clicking transactions today navigates to transactions page', async () => {
        await dashboardPage.clickStatTxnToday();
        await expect(dashboardPage['page']).toHaveURL(/transactions\.html/);
    });

    // ── Sidebar navigation ─────────────────────────────────────

    test('should show sidebar with all nav links', async () => {
        await dashboardPage.assertSidebarVisible();
        await dashboardPage.assertNavLinksVisible();
    });

    test('should navigate to customers via sidebar', async () => {
        await dashboardPage.navigateToCustomers();
        await expect(dashboardPage['page']).toHaveURL(/customers\.html/);
    });

    test('should navigate to accounts via sidebar', async () => {
        await dashboardPage.navigateToAccounts();
        await expect(dashboardPage['page']).toHaveURL(/accounts\.html/);
    });

    test('should navigate to loans via sidebar', async () => {
        await dashboardPage.navigateToLoans();
        await expect(dashboardPage['page']).toHaveURL(/loans\.html/);
    });

    test('should navigate to credit cards via sidebar', async () => {
        await dashboardPage.navigateToCreditCards();
        await expect(dashboardPage['page']).toHaveURL(/credit-cards\.html/);
    });

    // ── Logout ─────────────────────────────────────────────────

    test('should logout successfully', async () => {
        await dashboardPage.logout();
        await dashboardPage.assertURL(/login\.html/);
    });

});

// ── Viewer tests ───────────────────────────────────────────────
test.describe('Dashboard Page — Viewer', () => {

    let dashboardPage: DashboardPage;

    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            sessionStorage.setItem('fincore_user', JSON.stringify({ username: 'viewer', role: 'viewer' }));
        });
        dashboardPage = new DashboardPage(page);
        await dashboardPage.goto();
    });

    test('viewer should load dashboard', async () => {
        await dashboardPage.assertOnDashboard();
    });

    test('viewer should see stat cards', async () => {
        await dashboardPage.assertStatCardsVisible();
    });

    test('viewer should see sidebar nav links', async () => {
        await dashboardPage.assertNavLinksVisible();
    });

});
