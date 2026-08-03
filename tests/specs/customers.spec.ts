import { test, expect } from '@playwright/test';
import { CustomersPage } from '../pages/CustomersPage';
import { ADMIN, VIEWER, AUTH_STATE, SEED_CUSTOMERS, newCustomer, ERRORS, SUCCESS } from '../fixtures/testData';

/**
 * Customers Page Tests
 *
 * Covers: table load, search, filters, pagination, add, edit, view popup,
 *         add account, negative cases, RBAC
 *
 * Uses: CustomersPage POM — no raw selectors in this file
 */

// ── Admin tests ────────────────────────────────────────────────
test.describe('Customers Page — Admin', () => {

    let customersPage: CustomersPage;

    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            sessionStorage.setItem('fincore_user', JSON.stringify({ username: 'admin', role: 'admin' }));
        });
        customersPage = new CustomersPage(page);
        await customersPage.goto();
    });

    // ── Happy Path ─────────────────────────────────────────────

    test('should load customers table with data', async () => {
        await customersPage.assertTableVisible();
        await customersPage.assertTotalCountContains('customers found');
    });

    test('should search customers by first name', async () => {
        await customersPage.search(SEED_CUSTOMERS.firstName);
        await customersPage.assertTotalCountContains('customers found');
        await customersPage.assertTableVisible();
    });

    test('should search customers by city', async () => {
        await customersPage.search(SEED_CUSTOMERS.city);
        await customersPage.assertTotalCountContains('customers found');
        await customersPage.assertTableVisible();
    });

    test('should show no results for invalid search', async () => {
        await customersPage.search(SEED_CUSTOMERS.invalidSearch);
        await customersPage.assertNoResults();
    });

    test('should filter customers by KYC verified', async () => {
        await customersPage.filterByKyc('verified');
        await customersPage.assertTableVisible();
    });

    test('should filter customers by KYC pending', async () => {
        await customersPage.filterByKyc('pending');
        await customersPage.assertTableVisible();
    });

    test('should navigate to next page', async () => {
        const before = await customersPage.getCurrentPageInfo();
        await customersPage.goToNextPage();
        const after = await customersPage.getCurrentPageInfo();
        expect(after.current).toBe(before.current + 1);
    });

    test('should navigate to last page', async () => {
        await customersPage.goToLastPage();
        await customersPage.assertOnLastPage();
    });

    test('should open view popup on row click', async () => {
        await customersPage.clickCustomerRow(0);
        await customersPage.assertViewModalVisible();
        await customersPage.closeViewModalBtn();
    });

    // ── Add Customer ───────────────────────────────────────────

    test('should add a new customer successfully', async ({ request }) => {
        const customer = newCustomer();
        const res = await request.post('http://localhost:3000/api/customers', {
            data: { name: customer.name, email: customer.email, phone: customer.phone, city: customer.city, kyc_status: 'pending' }
        });
        expect(res.status()).toBe(201);
        const data = await res.json();
        expect(data.name).toBe(customer.name);
    });

    test('should show error when name is missing', async ({ request }) => {
        const res = await request.post('http://localhost:3000/api/customers', {
            data: { email: `missing.name.${Date.now()}@test.com` }
        });
        expect(res.status()).toBe(400);
        const data = await res.json();
        expect(data.error).toBeDefined();
    });

    test('should show error when email is missing', async ({ request }) => {
        const res = await request.post('http://localhost:3000/api/customers', {
            data: { name: 'No Email Customer' }
        });
        expect(res.status()).toBe(400);
        const data = await res.json();
        expect(data.error).toBeDefined();
    });

    test('should show error for duplicate email', async ({ request }) => {
        const email = `duplicate.test.${Date.now()}@gmail.com`;
        const first = await request.post('http://localhost:3000/api/customers', {
            data: { name: 'Original Customer', email, phone: '9876543210', city: 'Chennai', kyc_status: 'pending' }
        });
        expect(first.status()).toBe(201);
        // Try duplicate with all required fields — should fail on email uniqueness
        const res = await request.post('http://localhost:3000/api/customers', {
            data: { name: 'Duplicate Customer', email, phone: '9876543211' }
        });
        expect(res.status()).toBe(400);
        const data = await res.json();
        expect(data.error).toContain('already exists');
    });

    // ── Edit Customer ──────────────────────────────────────────

    test('should open edit modal and update customer city', async () => {
        await customersPage.clickEditButton(0);
        await customersPage.fillEditForm({ city: 'Bengaluru' });
        await customersPage.submitEditForm();
        await customersPage.assertEditSuccess('updated successfully');
    });

    // ── Add Account ────────────────────────────────────────────

    test('should add a savings account for a customer', async () => {
        await customersPage.clickAddAccountButton(0);
        await customersPage.fillAddAccountForm('savings', '10000');
        await customersPage.submitAddAccountForm();
        await customersPage.assertAddAccountSuccess('account created');
    });

    test('should add a current account for a customer', async () => {
        await customersPage.clickAddAccountButton(0);
        await customersPage.fillAddAccountForm('current');
        await customersPage.submitAddAccountForm();
        await customersPage.assertAddAccountSuccess('account created');
    });

    test('admin should see Onboard Customer button', async () => {
        await customersPage.assertAddButtonVisible();
    });

    test('clicking Onboard Customer navigates to onboarding page', async ({ page }) => {
        await expect(page.getByTestId('add-customer-button')).toBeVisible();
        await Promise.all([
            page.waitForURL(/onboarding\.html/),
            page.getByTestId('add-customer-button').click(),
        ]);
        await expect(page).toHaveURL(/onboarding\.html/);
    });

});

// ── Viewer tests ───────────────────────────────────────────────
test.describe('Customers Page — Viewer', () => {

    let customersPage: CustomersPage;

    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            sessionStorage.setItem('fincore_user', JSON.stringify({ username: 'viewer', role: 'viewer' }));
        });
        customersPage = new CustomersPage(page);
        await customersPage.goto();
    });

    test('viewer should not see Add Customer button', async () => {
        await customersPage.assertAddButtonHidden();
    });

    test('viewer should still see the customers table', async () => {
        await customersPage.assertTableVisible();
    });

});
