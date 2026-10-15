import { test, expect } from '@playwright/test';
import { DashboardPage } from '../pages/DashboardPage';

/**
 * Dashboard Page Tests
 * Covers: page load, 12 stat cards (and their accuracy), navigation, recent transactions, RBAC
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

// ── Stat card accuracy (regression for BUG-FC-103) ─────────────
// Each card must match an independent source: the filtered total from that
// entity's own list API, not the dashboard API that feeds the card.
// BUG-FC-103: four cards showed 0 because the stats API never sent their
// fields and the page fell back to "|| 0". The old tests only checked that the
// cards were not blank, so a believable wrong number passed.
test.describe('Dashboard stat cards — accuracy', () => {

    const cards = [
        { card: 'stat-customers',       source: '/api/customers?limit=1' },
        { card: 'stat-accounts',        source: '/api/accounts?status=active&limit=1' },
        { card: 'stat-frozen',          source: '/api/accounts?status=frozen&limit=1' },
        { card: 'stat-closed-accounts', source: '/api/accounts?status=closed&limit=1' },
        { card: 'stat-loans',           source: '/api/loans?status=active&limit=1' },
        { card: 'stat-overdue',         source: '/api/loans?status=overdue&limit=1' },
        { card: 'stat-closed-loans',    source: '/api/loans?status=closed&limit=1' },
        { card: 'stat-cards',           source: '/api/credit-cards?limit=1' },
        { card: 'stat-active-cards',    source: '/api/credit-cards?status=active&limit=1' },
        { card: 'stat-blocked-cards',   source: '/api/credit-cards?status=blocked&limit=1' },
    ];

    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            sessionStorage.setItem('fincore_user', JSON.stringify({ username: 'admin', role: 'admin' }));
        });
    });

    for (const { card, source } of cards) {
        test(`${card} matches ${source.split('?')[0]} total`, async ({ page, request }) => {
            const dashboard = new DashboardPage(page);
            // Other specs create data in parallel, so re-read both sides until they agree
            await expect(async () => {
                await dashboard.goto();
                await expect(page.getByTestId(card).locator('.stat-value')).not.toHaveText('—');
                const shown = await dashboard.getStatValue(card);
                const res = await request.get(source);
                expect(res.ok()).toBeTruthy();
                const { total } = await res.json();
                expect(shown, `${card} on the dashboard`).toBe(Number(total));
            }).toPass({ timeout: 20_000 });
        });
    }

    test('stats API returns every field the dashboard displays', async ({ request }) => {
        const res = await request.get('/api/dashboard/stats');
        expect(res.status()).toBe(200);
        const stats = await res.json();
        for (const key of [
            'total_customers', 'active_accounts', 'frozen_accounts', 'closed_accounts',
            'transactions_today', 'active_loans', 'overdue_loans', 'closed_loans',
            'total_cards', 'active_cards', 'blocked_cards', 'cards_due_soon',
        ]) {
            expect(stats, `stats.${key}`).toHaveProperty(key);
            expect(typeof stats[key], `stats.${key} type`).toBe('number');
        }
    });
});
