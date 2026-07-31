import { Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * DashboardPage — Page Object for /dashboard.html
 */
export class DashboardPage extends BasePage {

    // ── Stat card locators ─────────────────────────────────────
    private get statCustomers()       { return this.page.getByTestId('stat-customers'); }
    private get statAccounts()        { return this.page.getByTestId('stat-accounts'); }
    private get statLoans()           { return this.page.getByTestId('stat-loans'); }
    private get statCards()           { return this.page.getByTestId('stat-cards'); }
    private get statOverdue()         { return this.page.getByTestId('stat-overdue'); }
    private get statTxnToday()        { return this.page.getByTestId('stat-txn-today'); }

    // ── Recent transactions widget ─────────────────────────────
    private get recentTxnTable()      { return this.page.getByTestId('recent-txn-table'); }
    private get recentTxnBody()       { return this.page.getByTestId('recent-txn-body'); }

    // ── Alert widgets ──────────────────────────────────────────
    private get overdueAlertsWidget() { return this.page.getByTestId('overdue-alerts'); }
    private get cardsDueWidget()      { return this.page.getByTestId('cards-due-alerts'); }

    // ── Page elements ──────────────────────────────────────────
    private get pageTitle()           { return this.page.locator('.page-title'); }
    private get sidebarToggle()       { return this.page.getByTestId('sidebar-toggle'); }
    private get navDashboard()        { return this.page.getByTestId('nav-dashboard'); }

    // ── Navigation ─────────────────────────────────────────────
    async goto() {
        await super.goto('/dashboard.html');
    }

    // ── Page assertions ────────────────────────────────────────
    async assertPageTitle() {
        await expect(this.pageTitle).toContainText('Dashboard');
    }

    async assertOnDashboard() {
        await expect(this.page).toHaveURL(/dashboard\.html/);
    }

    // ── Stat cards ─────────────────────────────────────────────
    async assertStatCardsLoaded() {
        await expect(this.statCustomers).not.toHaveText('—');
        await expect(this.statAccounts).not.toHaveText('—');
        await expect(this.statLoans).not.toHaveText('—');
        await expect(this.statCards).not.toHaveText('—');
    }

    async assertStatCardsVisible() {
        await expect(this.statCustomers).toBeVisible();
        await expect(this.statAccounts).toBeVisible();
        await expect(this.statLoans).toBeVisible();
        await expect(this.statCards).toBeVisible();
    }

    async getTotalCustomers() {
        return parseInt(await this.statCustomers.textContent() || '0');
    }

    async getActiveAccounts() {
        return parseInt(await this.statAccounts.textContent() || '0');
    }

    // ── Recent transactions ────────────────────────────────────
    async assertRecentTransactionsVisible() {
        await expect(this.recentTxnTable).toBeVisible();
    }

    async assertRecentTransactionsHasRows() {
        const rows = this.page.locator('[data-testid="recent-txn-body"] tr');
        const count = await rows.count();
        expect(count).toBeGreaterThan(0);
    }

    // ── Sidebar navigation ─────────────────────────────────────
    async assertSidebarVisible() {
        await expect(this.page.getByTestId('sidebar')).toBeVisible();
    }

    async assertNavLinksVisible() {
        await expect(this.page.getByTestId('nav-dashboard')).toBeVisible();
        await expect(this.page.getByTestId('nav-customers')).toBeVisible();
        await expect(this.page.getByTestId('nav-accounts')).toBeVisible();
        await expect(this.page.getByTestId('nav-loans')).toBeVisible();
        await expect(this.page.getByTestId('nav-credit-cards')).toBeVisible();
    }

    async navigateToCustomers() {
        await Promise.all([
            this.page.waitForURL(/customers\.html/),
            this.page.getByTestId('nav-customers').click(),
        ]);
    }

    async navigateToAccounts() {
        await Promise.all([
            this.page.waitForURL(/accounts\.html/),
            this.page.getByTestId('nav-accounts').click(),
        ]);
    }

    async navigateToLoans() {
        await Promise.all([
            this.page.waitForURL(/loans\.html/),
            this.page.getByTestId('nav-loans').click(),
        ]);
    }

    async navigateToCreditCards() {
        await Promise.all([
            this.page.waitForURL(/credit-cards\.html/),
            this.page.getByTestId('nav-credit-cards').click(),
        ]);
    }
}
