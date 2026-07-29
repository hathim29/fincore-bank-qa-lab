import {test, expect} from '@playwright/test';

test.describe('Customer Page Tests',  () => {

    test.beforeEach(async ({ page }) => {
    await page.goto('/login.html');
    await page.getByTestId('username-input').fill('admin');
    await page.getByTestId('password-input').fill('admin123');
    await page.getByTestId('login-button').click();
    await page.waitForURL(/dashboard.html/, { timeout: 10000 });
    await page.goto('/customers.html');
    await page.waitForLoadState('networkidle');
});

    //Happy path - customer table loads
    test('should load customer table', async ({ page }) => {
        await expect(page.getByTestId('customers-table')).toBeVisible();
        await expect(page.getByTestId('customers-body')).toBeVisible();
        await expect(page.getByTestId('total-count')).toContainText('customers found');
    });

    //Happy path - search with a name
    test('Search Customers by Name', async ({ page}) => {
    await page.getByTestId('search-input').fill('john');
    await page.waitForResponse(resp => resp.url().includes('/api/customers'));
    await expect(page.getByTestId('total-count')).toBeVisible();
    await expect(page.getByTestId('customers-body')).toBeVisible();
    });

    //Edge Case - search with invalid input
    test('Invalid Search', async ({ page }) => {
    await page.getByTestId('search-input').fill('zzzz2f2qa2');
    await page.waitForResponse(resp => resp.url().includes('/api/customers'));
    await expect(page.getByTestId('customers-body')).toContainText('No customers found');
    });

    //Happy path - pagination works
    test('Navigate to next page', async ({ page }) => {
        await expect(page.getByTestId('page-info')).toContainText('Page 1');
        await page.getByTestId('next-page').click();
        await expect(page.getByTestId('page-info')).toContainText('Page 2');
    });

    //Happy path - last page works
    test('Last page works', async ({ page }) => {
    await page.getByTestId('last-page').click();
    await page.waitForResponse(resp => resp.url().includes('/api/customers'));
    const pageInfo = await page.getByTestId('page-info').textContent();
    const match = pageInfo?.match(/Page (\d+) of (\d+)/);
    const currentPage = match?.[1];
    const totalPages = match?.[2];
    await expect(currentPage).toBe(totalPages);
    });

    // Happy path — add customer
    test('should add a new customer successfully', async ({ page }) => {
    await page.getByTestId('add-customer-button').click();
    await expect(page.locator('#addCustomerModal')).toBeVisible();

    const uniqueEmail = `playwright.test+${Date.now()}@gmail.com`;

    await page.getByTestId('modal-name').fill('Test Customer Playwright');
    await page.getByTestId('modal-email').fill(uniqueEmail);
    await page.getByTestId('modal-phone').fill('9876543210');
    await page.getByTestId('modal-city').fill('Chennai');

    await page.getByTestId('save-customer-button').click();
    await page.waitForResponse(resp =>
        resp.url().includes('/api/customers') && resp.request().method() === 'POST'
    );

    await expect(page.locator('#modalSuccess')).toBeVisible();
    await expect(page.locator('#modalSuccess')).toContainText('created successfully');
    });

    // Negative path — add customer with missing name
    test('should show error when name is missing', async ({ page }) => {
        await page.getByTestId('add-customer-button').click();
        await expect(page.locator('#addCustomerModal')).toBeVisible();

        await page.getByTestId('modal-email').fill('test@gmail.com');
        await page.getByTestId('save-customer-button').click();

        await expect(page.locator('#modalError')).toBeVisible();
        await expect(page.locator('#modalError')).toContainText('required');
    });

    // Negative path — add customer with missing email
    test('should show error when email is missing', async ({ page }) => {
        await page.getByTestId('add-customer-button').click();
        await expect(page.locator('#addCustomerModal')).toBeVisible();

        await page.getByTestId('modal-name').fill('Test Customer');
        await page.getByTestId('save-customer-button').click();

        await expect(page.locator('#modalError')).toBeVisible();
        await expect(page.locator('#modalError')).toContainText('required');
    });

    // Logout
    test('should logout and return to login page', async ({ page }) => {
        await page.getByTestId('logout-button').click();
        await expect(page).toHaveURL(/login.html/);
    });

});