import { test, expect } from '@playwright/test';
import { AccountsPage } from '../pages/AccountsPage';
import { ADMIN, VIEWER } from '../fixtures/testData';

/**
 * Accounts Page Tests
 *
 * Covers: stat cards, table, filters, pagination, view popup,
 *         freeze/unfreeze/close with reason, audit trail, RBAC
 */

// ── Admin tests ────────────────────────────────────────────────
test.describe('Accounts Page — Admin', () => {

    let accountsPage: AccountsPage;

    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            sessionStorage.setItem('fincore_user', JSON.stringify({ username: 'admin', role: 'admin' }));
        });
        accountsPage = new AccountsPage(page);
        await accountsPage.goto();
    });

    // ── Happy Path ─────────────────────────────────────────────

    test('should load accounts table with stat cards', async () => {
        await accountsPage.assertTableVisible();
        await accountsPage.assertStatCardsVisible();
    });

    test('should show correct total count', async () => {
        await accountsPage.assertTotalCountContains('accounts found');
    });

    test('should filter by savings account type', async () => {
        await accountsPage.filterByType('savings');
        await accountsPage.assertTableVisible();
        await accountsPage.assertTotalCountContains('accounts found');
    });

    test('should filter by current account type', async () => {
        await accountsPage.filterByType('current');
        await accountsPage.assertTableVisible();
    });

    test('should filter by active status', async () => {
        await accountsPage.filterByStatus('active');
        await accountsPage.assertTableVisible();
    });

    test('should filter by frozen status', async () => {
        await accountsPage.filterByStatus('frozen');
        await accountsPage.assertTableVisible();
    });

    test('should navigate to next page', async () => {
        const before = await accountsPage.getCurrentPageInfo();
        await accountsPage.goToNextPage();
        const after = await accountsPage.getCurrentPageInfo();
        expect(after.current).toBe(before.current + 1);
    });

    test('should navigate to last page', async () => {
        await accountsPage.goToLastPage();
        await accountsPage.assertOnLastPage();
    });

    // ── View Popup ─────────────────────────────────────────────

    test('should open account popup on row click', async () => {
        await accountsPage.clickAccountRow(0);
        await accountsPage.assertViewModalVisible();
    });

    test('should show transaction history in popup', async () => {
        // Filter to active accounts — more likely to have transactions
        await accountsPage.filterByStatus('active');
        await accountsPage.clickAccountRow(0);
        // The popup always shows either the transaction table or a no-transactions message
        // Both are inside the Recent Transactions section — just assert that section exists
        const section = accountsPage['page'].locator('.detail-section-title')
            .filter({ hasText: 'Recent Transactions' });
        await expect(section).toBeVisible();
        await accountsPage.closeViewModal();
    });

    test('should close popup', async () => {
        await accountsPage.clickAccountRow(0);
        await accountsPage.closeViewModal();
    });

    // ── Freeze / Unfreeze ──────────────────────────────────────

    test('confirm button should be disabled until reason is entered', async () => {
        await accountsPage.filterByStatus('active');
        await accountsPage.clickAccountRow(0);
        await accountsPage.clickFreezeFromPopup();
        await accountsPage.assertConfirmButtonDisabled();
    });

    test('confirm button should enable after entering reason', async () => {
        await accountsPage.filterByStatus('active');
        await accountsPage.clickAccountRow(0);
        await accountsPage.clickFreezeFromPopup();
        await accountsPage.fillReason('Testing freeze functionality');
        await accountsPage.assertConfirmButtonEnabled();
    });

    test('should show correct title in freeze confirm modal', async () => {
        await accountsPage.filterByStatus('active');
        await accountsPage.clickAccountRow(0);
        await accountsPage.clickFreezeFromPopup();
        await accountsPage.assertConfirmModalTitle('Freeze Account');
    });

    test('should cancel freeze action', async () => {
        await accountsPage.filterByStatus('active');
        await accountsPage.clickAccountRow(0);
        await accountsPage.clickFreezeFromPopup();
        await accountsPage.cancelAction();
    });

    test('should freeze an active account', async () => {
        await accountsPage.filterByStatus('active');
        await accountsPage.clickAccountRow(0);
        await accountsPage.clickFreezeFromPopup();
        await accountsPage.fillReason('Account under review — suspicious activity detected');
        await accountsPage.confirmAction();
        // After confirm the modal closes and table refreshes
        await accountsPage.assertTableVisible();
    });

    test('should show audit entry after freeze', async () => {
        // Find a frozen account and verify audit trail
        await accountsPage.filterByStatus('frozen');
        await accountsPage.clickAccountRow(0);
        await accountsPage.assertAuditEntryVisible();
        await accountsPage.closeViewModal();
    });

    test('should show unfreeze confirm modal for frozen account', async () => {
        await accountsPage.filterByStatus('frozen');
        await accountsPage.clickAccountRow(0);
        await accountsPage.clickUnfreezeFromPopup();
        await accountsPage.assertConfirmModalTitle('Unfreeze Account');
        await accountsPage.cancelAction();
    });

    test('should close account with reason', async () => {
        await accountsPage.filterByStatus('active');
        await accountsPage.clickAccountRow(0);
        await accountsPage.clickCloseAccountFromPopup();
        await accountsPage.assertConfirmModalTitle('Close Account');
        await accountsPage.fillReason('Customer requested account closure');
        await accountsPage.confirmAction();
        await accountsPage.assertTableVisible();
    });

    // ── RBAC ───────────────────────────────────────────────────

    test('admin should see freeze buttons in table', async () => {
        await expect(
            accountsPage['page'].locator('[title="Freeze"]').first()
        ).toBeVisible();
    });

});

// ── Viewer tests ───────────────────────────────────────────────
test.describe('Accounts Page — Viewer', () => {

    let accountsPage: AccountsPage;

    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            sessionStorage.setItem('fincore_user', JSON.stringify({ username: 'viewer', role: 'viewer' }));
        });
        accountsPage = new AccountsPage(page);
        await accountsPage.goto();
    });

    test('viewer should see accounts table', async () => {
        await accountsPage.assertTableVisible();
    });

    test('viewer should not see freeze buttons', async () => {
        await accountsPage.assertFreezeButtonsHidden();
    });

    test('viewer popup should have no action buttons', async () => {
        await accountsPage.clickAccountRow(0);
        await accountsPage.assertPopupHasNoActionButtons();
        await accountsPage.closeViewModal();
    });

});
