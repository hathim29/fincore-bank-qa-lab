import { Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * AccountsPage — Page Object for /accounts.html
 */
export class AccountsPage extends BasePage {

    // ── Locators ───────────────────────────────────────────────
    private get typeFilter()       { return this.page.getByTestId('type-filter'); }
    private get statusFilter()     { return this.page.getByTestId('status-filter'); }
    private get rowsPerPage()      { return this.page.getByTestId('rows-per-page'); }
    private get totalCount()       { return this.page.getByTestId('total-count'); }
    private get accountsTable()    { return this.page.getByTestId('accounts-table'); }
    private get accountsBody()     { return this.page.getByTestId('accounts-body'); }

    // ── Table ──────────────────────────────────────────────────
    async assertTableVisible() {
        await expect(this.accountsTable).toBeVisible();
        await expect(this.accountsBody).toBeVisible();
    }

    private get viewModal()        { return this.page.locator('#viewAccountModal'); }
    private get viewModalTitle()   { return this.page.locator('#viewModalTitle'); }
    private get txnTable()         { return this.page.getByTestId('account-txn-table'); }

    // Confirm action modal
    private get confirmModal()     { return this.page.locator('#statusConfirmModal'); }
    private get confirmTitle()     { return this.page.locator('#confirmTitle'); }
    private get actionReason()     { return this.page.getByTestId('action-reason'); }
    private get confirmActionBtn() { return this.page.getByTestId('confirm-action-btn'); }
    private get cancelConfirmBtn() { return this.page.locator('#cancelConfirmBtn'); }

    // ── Navigation ─────────────────────────────────────────────
    async goto() {
        await super.goto('/accounts.html');
    }

    // ── Table ──────────────────────────────────────────────────
    async assertTableVisible() {
        await expect(this.accountsTable).toBeVisible();
        await expect(this.accountsBody).toBeVisible();
    }

    async assertTotalCountContains(text: string) {
        await expect(this.totalCount).toContainText(text);
    }

    // ── Filters ────────────────────────────────────────────────
    async filterByType(type: 'savings' | 'current' | 'salary' | '') {
        // Listen BEFORE acting: a fast response could arrive before a later listener starts
        await Promise.all([
            this.page.waitForResponse(r => r.url().includes('/api/accounts')),
            this.typeFilter.selectOption(type),
        ]);
    }

    async filterByStatus(status: 'active' | 'frozen' | 'closed' | '') {
        // Listen BEFORE acting: a fast response could arrive before a later listener starts
        await Promise.all([
            this.page.waitForResponse(r => r.url().includes('/api/accounts')),
            this.statusFilter.selectOption(status),
        ]);
    }

    // ── View Account Popup ─────────────────────────────────────
    async clickAccountRow(index = 0) {
        const rows = this.page.locator('[data-testid^="account-row-"]');
        await rows.nth(index).click();
        await expect(this.viewModal).toBeVisible();
    }

    async assertViewModalVisible() {
        await expect(this.viewModal).toBeVisible();
    }

    async assertTransactionTableVisible() {
        await expect(this.txnTable).toBeVisible();
    }

    async closeViewModal() {
        await this.page.locator('#closeViewModal').click();
        await expect(this.viewModal).not.toBeVisible();
    }

    // ── Freeze Account ─────────────────────────────────────────
    async clickFreezeButton(rowIndex = 0) {
        // Find freeze button in table row (lock icon, amber colour)
        const freezeBtns = this.page.locator('[title="Freeze"]');
        await freezeBtns.nth(rowIndex).click();
        await expect(this.confirmModal).toBeVisible();
    }

    async clickFreezeFromPopup() {
        await this.page.getByTestId('freeze-btn').click();
        await expect(this.confirmModal).toBeVisible();
    }

    async clickUnfreezeFromPopup() {
        await this.page.getByTestId('unfreeze-btn').click();
        await expect(this.confirmModal).toBeVisible();
    }

    async clickCloseAccountFromPopup() {
        await this.page.getByTestId('close-account-btn').click();
        await expect(this.confirmModal).toBeVisible();
    }

    async assertConfirmButtonDisabled() {
        await expect(this.confirmActionBtn).toBeDisabled();
    }

    async fillReason(reason: string) {
        await this.actionReason.fill(reason);
    }

    async assertConfirmButtonEnabled() {
        await expect(this.confirmActionBtn).toBeEnabled();
    }

    async confirmAction() {
        // Listen BEFORE acting: a fast response could arrive before a later listener starts
        await Promise.all([
            this.page.waitForResponse(r => r.url().includes('/api/accounts') && r.request().method() === 'PUT'),
            this.confirmActionBtn.click(),
        ]);
    }

    async cancelAction() {
        await this.cancelConfirmBtn.click();
        await expect(this.confirmModal).not.toBeVisible();
    }

    async assertConfirmModalTitle(text: string) {
        await expect(this.confirmTitle).toContainText(text);
    }

    // ── Audit Trail ────────────────────────────────────────────
    async assertAuditEntryVisible() {
        await expect(this.page.getByTestId('audit-entry').first()).toBeVisible();
    }

    async assertNoAuditEntries() {
        await expect(this.page.locator('.audit-entry')).toHaveCount(0);
    }

    // ── RBAC ───────────────────────────────────────────────────
    async assertFreezeButtonsHidden() {
        await expect(this.page.locator('[title="Freeze"]')).toHaveCount(0);
    }

    async assertPopupHasNoActionButtons() {
        await expect(this.page.getByTestId('freeze-btn')).toHaveCount(0);
        await expect(this.page.getByTestId('close-account-btn')).toHaveCount(0);
    }
}