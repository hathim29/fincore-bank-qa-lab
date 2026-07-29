import {test, expect} from '@playwright/test';

test.describe('Authentication', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/login.html');
    });

    //Happy path - valid login
    test('Login with valid credentials', async ({ page }) => {
        await page.getByTestId('username-input').fill('admin');
        await page.getByTestId('password-input').fill('admin123');
        await page.getByTestId('login-button').click();

        await expect(page).toHaveURL(/dashboard.html/);
        await expect(page.getByTestId('nav-dashboard')).toBeVisible();
        
    });

    //Negative path - wrong password
    test('Login with wrong password', async ({ page }) => {
        await page.getByTestId('username-input').fill('admin');
        await page.getByTestId('password-input').fill('wrongpassword');
        await page.getByTestId('login-button').click();

        await expect(page.locator('#errorAlert')).toBeVisible();
        await expect(page.locator('#errorAlert')).toContainText('Invalid');
    });

    //Negative path - empty username
    test('Login with empty username', async ({ page }) => {
        await page.getByTestId('password-input').fill('admin123');
        await page.getByTestId('login-button').click();

        // Should stay on login page
        await expect(page).toHaveURL(/login.html/);
    });

    // Negative path - empty password
    test('Login with empty password', async ({ page }) => {
        await page.getByTestId('username-input').fill('admin');
        await page.getByTestId('login-button').click();

      // Should stay on login page
        await expect(page).toHaveURL(/login.html/);
    });

});