import { test, expect } from '@playwright/test';

/**
 * Customer Onboarding Page Tests
 *
 * Covers: page load, step navigation, field validation,
 *         PAN/Aadhaar format, KYC warning, stepper state
 */

test.describe('Customer Onboarding Page', () => {

    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            sessionStorage.setItem('fincore_user', JSON.stringify({ username: 'admin', role: 'admin' }));
        });
        await page.goto('/onboarding.html');
        await page.waitForLoadState('networkidle');
    });

    // ── Page Load ──────────────────────────────────────────────

    test('should load onboarding page with stepper', async ({ page }) => {
        await expect(page.locator('#stepper')).toBeVisible();
        await expect(page.locator('#step1')).toHaveClass(/active/);
        await expect(page.locator('#section1')).toHaveClass(/active/);
    });

    test('should show Personal Details section on load', async ({ page }) => {
        await expect(page.locator('#firstName')).toBeVisible();
        await expect(page.locator('#lastName')).toBeVisible();
        await expect(page.locator('#email')).toBeVisible();
        await expect(page.locator('#phone')).toBeVisible();
    });

    test('should show Next button and no Back button on step 1', async ({ page }) => {
        await expect(page.locator('#btnNext')).toBeVisible();
        await expect(page.locator('#btnBack')).toBeHidden();
    });

    // ── Step 1 Validation ──────────────────────────────────────

    test('should show errors when Next clicked with empty required fields', async ({ page }) => {
        await page.locator('#btnNext').click();
        await expect(page.locator('#err-firstName')).toHaveClass(/show/);
        await expect(page.locator('#err-lastName')).toHaveClass(/show/);
        await expect(page.locator('#err-email')).toHaveClass(/show/);
    });

    test('should show error for invalid email format', async ({ page }) => {
        await page.locator('#firstName').fill('Test');
        await page.locator('#lastName').fill('User');
        await page.locator('#email').fill('notanemail');
        await page.locator('#phone').fill('9876543210');
        await page.locator('#dob').fill('1990-01-01');
        await page.locator('#city').fill('Chennai');
        await page.locator('#address').fill('123 Test Street');
        await page.locator('input[name="gender"][value="male"]').check();
        await page.locator('input[name="marital"][value="single"]').check();
        await page.locator('#nationality').selectOption('Indian');
        await page.locator('#btnNext').click();
        await expect(page.locator('#err-email')).toHaveClass(/show/);
    });

    test('should show error for invalid phone number', async ({ page }) => {
        await page.locator('#phone').fill('12345');
        await page.locator('#btnNext').click();
        await expect(page.locator('#err-phone')).toHaveClass(/show/);
    });

    // ── Step navigation ────────────────────────────────────────

    test('should advance to step 2 when step 1 is valid', async ({ page }) => {
        // Fill all step 1 fields
        await page.locator('#firstName').fill('Arjun');
        await page.locator('#lastName').fill('Sharma');
        await page.locator('#email').fill(`test.onboard.${Date.now()}@gmail.com`);
        await page.locator('#phone').fill('9876543210');
        await page.locator('#dob').fill('1990-01-01');
        await page.locator('#city').fill('Chennai');
        await page.locator('#address').fill('123 Test Street, Chennai');
        await page.locator('input[name="gender"][value="male"]').check();
        await page.locator('input[name="marital"][value="single"]').check();
        await page.locator('#nationality').selectOption('Indian');
        await page.locator('#btnNext').click();

        await expect(page.locator('#section2')).toHaveClass(/active/);
        await expect(page.locator('#step1')).toHaveClass(/done/);
        await expect(page.locator('#step2')).toHaveClass(/active/);
        await expect(page.locator('#btnBack')).toBeVisible();
    });

    // ── Step 2 — KYC ──────────────────────────────────────────

    test('should show KYC warning when Next clicked with no documents', async ({ page }) => {
        // Navigate to step 2
        await page.locator('#firstName').fill('Arjun');
        await page.locator('#lastName').fill('Sharma');
        await page.locator('#email').fill(`test.${Date.now()}@gmail.com`);
        await page.locator('#phone').fill('9876543210');
        await page.locator('#dob').fill('1990-01-01');
        await page.locator('#city').fill('Chennai');
        await page.locator('#address').fill('123 Test Street');
        await page.locator('input[name="gender"][value="male"]').check();
        await page.locator('input[name="marital"][value="single"]').check();
        await page.locator('#nationality').selectOption('Indian');
        await page.locator('#btnNext').click();
        await expect(page.locator('#section2')).toHaveClass(/active/);

        // Click Next without documents
        await page.locator('#btnNext').click();
        await expect(page.locator('#kycWarning')).toBeVisible();
    });

    test('should hide KYC warning when PAN is entered', async ({ page }) => {
        // Navigate to step 2
        await page.locator('#firstName').fill('Arjun');
        await page.locator('#lastName').fill('Sharma');
        await page.locator('#email').fill(`test.${Date.now()}@gmail.com`);
        await page.locator('#phone').fill('9876543210');
        await page.locator('#dob').fill('1990-01-01');
        await page.locator('#city').fill('Chennai');
        await page.locator('#address').fill('123 Test Street');
        await page.locator('input[name="gender"][value="male"]').check();
        await page.locator('input[name="marital"][value="single"]').check();
        await page.locator('#nationality').selectOption('Indian');
        await page.locator('#btnNext').click();

        // Trigger warning first
        await page.locator('#btnNext').click();
        await expect(page.locator('#kycWarning')).toBeVisible();

        // Enter PAN — warning should hide
        await page.locator('#panNumber').fill('ABCDE1234F');
        await expect(page.locator('#kycWarning')).toBeHidden();
    });

    test('should show error for invalid PAN format', async ({ page }) => {
        // Navigate to step 2
        await page.locator('#firstName').fill('Arjun');
        await page.locator('#lastName').fill('Sharma');
        await page.locator('#email').fill(`test.${Date.now()}@gmail.com`);
        await page.locator('#phone').fill('9876543210');
        await page.locator('#dob').fill('1990-01-01');
        await page.locator('#city').fill('Chennai');
        await page.locator('#address').fill('123 Test Street');
        await page.locator('input[name="gender"][value="male"]').check();
        await page.locator('input[name="marital"][value="single"]').check();
        await page.locator('#nationality').selectOption('Indian');
        await page.locator('#btnNext').click();

        // Enter invalid PAN and try to proceed
        await page.locator('#panNumber').fill('ABC12345Z');
        await page.locator('#btnNext').click();
        await expect(page.locator('#err-pan')).toHaveClass(/show/);
    });

    test('PAN should auto-uppercase', async ({ page }) => {
        await page.locator('#firstName').fill('Arjun');
        await page.locator('#lastName').fill('Sharma');
        await page.locator('#email').fill(`test.${Date.now()}@gmail.com`);
        await page.locator('#phone').fill('9876543210');
        await page.locator('#dob').fill('1990-01-01');
        await page.locator('#city').fill('Chennai');
        await page.locator('#address').fill('123 Test Street');
        await page.locator('input[name="gender"][value="male"]').check();
        await page.locator('input[name="marital"][value="single"]').check();
        await page.locator('#nationality').selectOption('Indian');
        await page.locator('#btnNext').click();

        await page.locator('#panNumber').fill('abcde1234f');
        const value = await page.locator('#panNumber').inputValue();
        expect(value).toBe('ABCDE1234F');
    });

    // ── Back button ────────────────────────────────────────────

    test('should go back to step 1 when Back is clicked', async ({ page }) => {
        await page.locator('#firstName').fill('Arjun');
        await page.locator('#lastName').fill('Sharma');
        await page.locator('#email').fill(`test.${Date.now()}@gmail.com`);
        await page.locator('#phone').fill('9876543210');
        await page.locator('#dob').fill('1990-01-01');
        await page.locator('#city').fill('Chennai');
        await page.locator('#address').fill('123 Test Street');
        await page.locator('input[name="gender"][value="male"]').check();
        await page.locator('input[name="marital"][value="single"]').check();
        await page.locator('#nationality').selectOption('Indian');
        await page.locator('#btnNext').click();

        await expect(page.locator('#section2')).toHaveClass(/active/);
        await page.locator('#btnBack').click();
        await expect(page.locator('#section1')).toHaveClass(/active/);
        await expect(page.locator('#btnBack')).toBeHidden();
    });

    // ── RBAC ───────────────────────────────────────────────────

    test('viewer should be redirected away from onboarding', async ({ page }) => {
        // Set viewer role via addInitScript before navigation
        await page.addInitScript(() => {
            sessionStorage.setItem('fincore_user', JSON.stringify({ username: 'viewer', role: 'viewer' }));
        });
        await page.goto('/onboarding.html');
        await expect(page).toHaveURL(/customers\.html/);
    });

});