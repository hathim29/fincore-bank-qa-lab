import { Page, expect } from '@playwright/test';

/**
 * BasePage — base class for all Page Object Model classes
 *
 * Contains shared methods used across every page:
 * - Navigation
 * - API response waiting
 * - Sidebar navigation
 * - Logout
 * - Common assertions
 *
 * All page classes extend this:
 *   class CustomersPage extends BasePage { ... }
 */
export class BasePage {
    constructor(protected page: Page) {}

    // ── Navigation ─────────────────────────────────────────────
    async goto(path: string) {
        await this.page.goto(path);
        await this.page.waitForLoadState('networkidle');
    }

    // ── Wait for specific API response ─────────────────────────
    async waitForAPI(urlPattern: string, method = 'GET') {
        await this.page.waitForResponse(
            resp => resp.url().includes(urlPattern) &&
                    resp.request().method() === method
        );
    }

    // ── Wait for POST API response ──────────────────────────────
    async waitForPOST(urlPattern: string) {
        return this.waitForAPI(urlPattern, 'POST');
    }

    // ── Wait for PUT API response ───────────────────────────────
    async waitForPUT(urlPattern: string) {
        return this.waitForAPI(urlPattern, 'PUT');
    }

    // ── Sidebar navigation ─────────────────────────────────────
    async navigateTo(page: 'dashboard' | 'customers' | 'accounts' | 'transactions' | 'loans' | 'credit-cards') {
        await this.page.getByTestId(`nav-${page}`).click();
        await this.page.waitForLoadState('networkidle');
    }

    // ── Logout ─────────────────────────────────────────────────
    async logout() {
        await this.page.getByTestId('logout-button').click();
        await this.page.waitForURL(/login\.html/);
    }

    // ── Modal helpers ──────────────────────────────────────────
    async closeModalByOverlay(modalTestId: string) {
        const overlay = this.page.locator(`[data-testid="${modalTestId}"]`);
        await overlay.click({ position: { x: 10, y: 10 } });
    }

    // ── Assert success alert ───────────────────────────────────
    async assertSuccess(locator: string, text?: string) {
        await expect(this.page.locator(locator)).toBeVisible();
        if (text) {
            await expect(this.page.locator(locator)).toContainText(text);
        }
    }

    // ── Assert error alert ─────────────────────────────────────
    async assertError(locator: string, text?: string) {
        await expect(this.page.locator(locator)).toBeVisible();
        if (text) {
            await expect(this.page.locator(locator)).toContainText(text);
        }
    }

    // ── Assert current page URL ────────────────────────────────
    async assertURL(pattern: RegExp | string) {
        await expect(this.page).toHaveURL(pattern);
    }

    // ── Assert page title ──────────────────────────────────────
    async assertTitle(text: string) {
        await expect(this.page.locator('.page-title')).toContainText(text);
    }

    // ── Pagination helpers ─────────────────────────────────────
    async goToNextPage() {
        await Promise.all([
            this.page.waitForResponse(r => r.url().includes('/api/')),
            this.page.getByTestId('next-page').click(),
        ]);
    }

    async goToLastPage() {
        await Promise.all([
            this.page.waitForResponse(r => r.url().includes('/api/')),
            this.page.getByTestId('last-page').click(),
        ]);
    }

    async getCurrentPageInfo(): Promise<{ current: number; total: number }> {
        const text = await this.page.getByTestId('page-info').textContent();
        const match = text?.match(/Page (\d+) of (\d+)/);
        return {
            current: parseInt(match?.[1] || '1'),
            total:   parseInt(match?.[2] || '1'),
        };
    }

    async assertOnLastPage() {
        const { current, total } = await this.getCurrentPageInfo();
        expect(current).toBe(total);
    }

    // ── Filter helpers ─────────────────────────────────────────
    async selectFilter(testId: string, value: string) {
        await this.page.getByTestId(testId).selectOption(value);
        await this.page.waitForLoadState('networkidle');
    }

    async assertTotalCount(text: string) {
        await expect(this.page.getByTestId('total-count')).toContainText(text);
    }
}
