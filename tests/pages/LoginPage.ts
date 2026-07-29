import { Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * LoginPage — Page Object for /login.html
 *
 * Encapsulates all selectors and actions for the login page.
 * Test specs call these methods — never reference raw selectors directly.
 */
export class LoginPage extends BasePage {

    // ── Locators ───────────────────────────────────────────────
    private get usernameInput() { return this.page.getByTestId('username-input'); }
    private get passwordInput() { return this.page.getByTestId('password-input'); }
    private get loginButton()   { return this.page.getByTestId('login-button'); }
    private get errorAlert()    { return this.page.locator('#loginError'); }
    private get successAlert()  { return this.page.locator('#loginSuccess'); }

    // ── Actions ────────────────────────────────────────────────

    async goto() {
        await super.goto('/login.html');
    }

    async login(username: string, password: string) {
        await this.usernameInput.fill(username);
        await this.passwordInput.fill(password);
        await this.loginButton.click();
    }

    async loginAsAdmin() {
        await this.login('admin', 'admin123');
        await this.page.waitForURL(/dashboard\.html/, { timeout: 10000 });
    }

    async loginAsViewer() {
        await this.login('viewer', 'viewer123');
        await this.page.waitForURL(/dashboard\.html/, { timeout: 10000 });
    }

    async pressEnterToLogin() {
        await this.page.keyboard.press('Enter');
    }

    // ── Assertions ─────────────────────────────────────────────

    async assertErrorVisible(text?: string) {
        await expect(this.errorAlert).toBeVisible();
        if (text) await expect(this.errorAlert).toContainText(text);
    }

    async assertSuccessVisible(text?: string) {
        await expect(this.successAlert).toBeVisible();
        if (text) await expect(this.successAlert).toContainText(text);
    }

    async assertRedirectedToDashboard() {
        await expect(this.page).toHaveURL(/dashboard\.html/);
    }

    async assertOnLoginPage() {
        await expect(this.page).toHaveURL(/login\.html/);
    }

    async assertLoginButtonVisible() {
        await expect(this.loginButton).toBeVisible();
    }
}
