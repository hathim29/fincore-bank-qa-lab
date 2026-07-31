import { test, expect } from '@playwright/test';
import { API, URLS } from '../fixtures/testData';

/**
 * Security Tests
 *
 * Deliberately tests the known client-side auth limitations.
 * Demonstrates that a QA engineer understands the security
 * vulnerabilities and can write tests to document them.
 *
 * These tests PASS because the API has no server-side auth —
 * that is the documented known limitation. If these tests
 * ever FAIL, it means server-side auth has been added (good!).
 */

test.describe('Security — API Access Control', () => {

    const BASE = 'http://localhost:3000';

    // ── No auth header tests ───────────────────────────────────
    // The API has no server-side authentication middleware.
    // All endpoints are accessible without any auth token.

    test('API is accessible without any authentication', async ({ request }) => {
        const res = await request.get(`${BASE}/api/customers`);
        // Documents that the API has no server-side auth — returns 200 not 401
        expect(res.status()).toBe(200);
    });

    test('can read all accounts without authentication', async ({ request }) => {
        const res = await request.get(`${BASE}/api/accounts`);
        expect(res.status()).toBe(200);
    });

    test('can read all loans without authentication', async ({ request }) => {
        const res = await request.get(`${BASE}/api/loans`);
        expect(res.status()).toBe(200);
    });

    test('can read all transactions without authentication', async ({ request }) => {
        const res = await request.get(`${BASE}/api/transactions`);
        expect(res.status()).toBe(200);
    });

    test('can read all credit cards without authentication', async ({ request }) => {
        const res = await request.get(`${BASE}/api/credit-cards`);
        expect(res.status()).toBe(200);
    });

    // ── Viewer session bypassing RBAC ──────────────────────────
    // The UI hides admin buttons for viewer role.
    // But the API has no role check — a viewer can call any endpoint directly.

    test('viewer session can call POST customers API directly', async ({ request }) => {
        // Viewer role is enforced only in the UI — not the API
        const res = await request.post(`${BASE}/api/customers`, {
            data: {
                name:       'Security Test Customer',
                email:      `security.test.${Date.now()}@gmail.com`,
                phone:      '9876543210',
                city:       'Chennai',
                kyc_status: 'pending'
            }
        });
        // Documents that the API has no RBAC — viewer can create customers via API
        expect(res.status()).toBe(201);
    });

    test('viewer session can call PUT account status API directly', async ({ request }) => {
        // First get an account ID
        const accounts = await request.get(`${BASE}/api/accounts?limit=1&status=active`);
        const data = await accounts.json();
        const accountId = data.data[0]?.id;

        if (accountId) {
            // Viewer can freeze an account directly via API — UI would not show this button
            const res = await request.put(`${BASE}/api/accounts/${accountId}`, {
                data: {
                    status:       'frozen',
                    reason:       'Security test — demonstrating API RBAC gap',
                    performed_by: 'security-test-viewer'
                }
            });
            // Documents that the API has no role enforcement
            expect(res.status()).toBe(200);

            // Restore account to active
            await request.put(`${BASE}/api/accounts/${accountId}`, {
                data: {
                    status:       'active',
                    reason:       'Security test — restoring after RBAC gap test',
                    performed_by: 'security-test-restore'
                }
            });
        }
    });

    // ── Session manipulation ────────────────────────────────────
    // Since auth is stored in sessionStorage, anyone can manipulate it.

    test('can access dashboard by setting sessionStorage directly', async ({ page }) => {
        // Set admin session without going through login
        await page.addInitScript(() => {
            sessionStorage.setItem('fincore_user', JSON.stringify({
                username: 'admin',
                role:     'admin'
            }));
        });
        await page.goto('/dashboard.html');
        // Page loads successfully — no server-side session check
        await expect(page).toHaveURL(/dashboard\.html/);
        await expect(page.locator('.page-title')).toContainText('Dashboard');
    });

    test('can impersonate admin role by modifying sessionStorage before page load', async ({ page }) => {
        // Session is read on page load via addInitScript — setting it before
        // navigation successfully escalates role
        await page.addInitScript(() => {
            sessionStorage.setItem('fincore_user', JSON.stringify({
                username: 'viewer',
                role:     'admin'  // escalated role set before page load
            }));
        });
        await page.goto('/customers.html');
        await page.waitForLoadState('networkidle');

        // Admin buttons visible — pre-load session manipulation succeeded
        // Post-load manipulation (after page already rendered) does NOT work
        // because the page only reads sessionStorage once on initial load
        await expect(page.getByTestId('add-customer-button')).toBeVisible();
    });

});

/**
 * NOTE: All tests above are EXPECTED to pass.
 * They document known security gaps in this QA practice lab.
 * In a production system, these tests should FAIL because:
 * - API endpoints should return 401 without a valid auth token
 * - Role checks should be enforced server-side
 * - Session manipulation should be prevented with server-side sessions or JWT
 *
 * This spec can be used as the acceptance criteria for a future
 * "Add server-side authentication" user story.
 */
