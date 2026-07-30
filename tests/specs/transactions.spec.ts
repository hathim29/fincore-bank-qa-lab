import { test, expect } from '@playwright/test';
import { TransactionsPage } from '../pages/TransactionsPage';
import { API } from '../fixtures/testData';

/**
 * Transactions Page Tests
 *
 * Covers: stat cards, table, filters, pagination, view popup, add transaction, RBAC
 */

// ── Admin tests ────────────────────────────────────────────────
test.describe('Transactions Page — Admin', () => {

    let txnPage: TransactionsPage;

    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            sessionStorage.setItem('fincore_user', JSON.stringify({ username: 'admin', role: 'admin' }));
        });
        txnPage = new TransactionsPage(page);
        await txnPage.goto();
    });

    // ── Happy Path ─────────────────────────────────────────────

    test('should load transactions table with stat cards', async () => {
        await txnPage.assertTableVisible();
        await txnPage.assertStatCardsLoaded();
    });

    test('should show correct total count', async () => {
        await txnPage.assertTotalCountContains('transactions found');
    });

    test('should filter by deposit type', async () => {
        await txnPage.filterByType('deposit');
        await txnPage.assertTableVisible();
        await txnPage.assertTotalCountContains('transactions found');
    });

    test('should filter by withdrawal type', async () => {
        await txnPage.filterByType('withdrawal');
        await txnPage.assertTableVisible();
    });

    test('should filter by transfer type', async () => {
        await txnPage.filterByType('transfer');
        await txnPage.assertTableVisible();
    });

    test('should filter by ATM channel', async () => {
        await txnPage.filterByChannel('ATM');
        await txnPage.assertTableVisible();
    });

    test('should filter by UPI-GPay channel', async () => {
        await txnPage.filterByChannel('UPI-GPay');
        await txnPage.assertTableVisible();
    });

    test('should filter by success status', async () => {
        await txnPage.filterByStatus('success');
        await txnPage.assertTableVisible();
    });

    test('should filter by failed status', async () => {
        await txnPage.filterByStatus('failed');
        await txnPage.assertTableVisible();
    });

    test('should navigate to next page', async () => {
        const before = await txnPage.getCurrentPageInfo();
        await txnPage.goToNextPage();
        const after = await txnPage.getCurrentPageInfo();
        expect(after.current).toBe(before.current + 1);
    });

    test('should navigate to last page', async () => {
        await txnPage.goToLastPage();
        await txnPage.assertOnLastPage();
    });

    // ── View Popup ─────────────────────────────────────────────

    test('should open transaction popup on row click', async () => {
        await txnPage.clickTransactionRow(0);
        await txnPage.assertViewModalVisible();
    });

    test('should show customer details in transaction popup', async () => {
        await txnPage.clickTransactionRow(0);
        // Popup always shows customer & account section
        await expect(txnPage['page'].locator('.detail-section-title')
            .filter({ hasText: 'Customer & Account' })).toBeVisible();
        await txnPage.closeViewModalBtn();
    });

    test('should show account history in transaction popup', async () => {
        await txnPage.clickTransactionRow(0);
        await expect(txnPage['page'].locator('.detail-section-title')
            .filter({ hasText: 'Account Transaction History' })).toBeVisible();
        await txnPage.closeViewModalBtn();
    });

    test('should close transaction popup', async () => {
        await txnPage.clickTransactionRow(0);
        await txnPage.closeViewModalBtn();
    });

    // ── Add Transaction ────────────────────────────────────────

    test('admin should see Add Transaction button', async () => {
        await txnPage.assertAddButtonVisible();
    });

    test('should open add transaction modal', async () => {
        await txnPage.openAddModal();
    });

    test('should show error for missing account number', async () => {
        await txnPage.openAddModal();
        await txnPage.fillAddForm({ accountNumber: '', amount: '1000' });
        await txnPage.clickSaveButtonOnly();
        await txnPage.assertAddError('required');
    });

    test('should show error for invalid account number', async () => {
        await txnPage.openAddModal();
        await txnPage.fillAddForm({ accountNumber: '9999999999', amount: '1000' });
        // This makes an API call — account lookup happens
        await txnPage.clickSaveButtonOnly();
        await txnPage.assertAddError('not found');
    });

});

// ── Viewer tests ───────────────────────────────────────────────
test.describe('Transactions Page — Viewer', () => {

    let txnPage: TransactionsPage;

    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            sessionStorage.setItem('fincore_user', JSON.stringify({ username: 'viewer', role: 'viewer' }));
        });
        txnPage = new TransactionsPage(page);
        await txnPage.goto();
    });

    test('viewer should see transactions table', async () => {
        await txnPage.assertTableVisible();
    });

    test('viewer should not see Add Transaction button', async () => {
        await txnPage.assertAddButtonHidden();
    });

});
