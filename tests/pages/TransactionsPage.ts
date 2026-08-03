import { Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * TransactionsPage — Page Object for /transactions.html
 */
export class TransactionsPage extends BasePage {

    // ── Locators ───────────────────────────────────────────────
    private get typeFilter()       { return this.page.getByTestId('type-filter'); }
    private get channelFilter()    { return this.page.getByTestId('channel-filter'); }
    private get statusFilter()     { return this.page.getByTestId('status-filter'); }
    private get rowsPerPage()      { return this.page.getByTestId('rows-per-page'); }
    private get totalCount()       { return this.page.getByTestId('total-count'); }
    private get txnTable()         { return this.page.getByTestId('transactions-table'); }
    private get txnBody()          { return this.page.getByTestId('transactions-body'); }
    private get addTxnBtn()        { return this.page.getByTestId('add-txn-btn'); }

    // ── Table ──────────────────────────────────────────────────
    async assertTableVisible() {
        await expect(this.txnTable).toBeVisible();
        await expect(this.txnBody).toBeVisible();
    }

    private get viewModal()        { return this.page.locator('#viewTxnModal'); }
    private get closeViewModal()   { return this.page.locator('#closeViewModal'); }

    // Add transaction modal
    private get addTxnModal()      { return this.page.locator('#addTxnModal'); }
    private get txnAccountNum()    { return this.page.getByTestId('txn-account-num'); }
    private get txnType()          { return this.page.getByTestId('txn-type'); }
    private get txnChannel()       { return this.page.getByTestId('txn-channel'); }
    private get txnAmount()        { return this.page.getByTestId('txn-amount'); }
    private get saveTxnBtn()       { return this.page.getByTestId('save-txn-btn'); }
    private get addTxnError()      { return this.page.locator('#addTxnError'); }
    private get addTxnSuccess()    { return this.page.locator('#addTxnSuccess'); }

    // ── Navigation ─────────────────────────────────────────────
    async goto() {
        await super.goto('/transactions.html');
    }

    // ── Table ──────────────────────────────────────────────────
    async assertTableVisible() {
        await expect(this.txnTable).toBeVisible();
        await expect(this.txnBody).toBeVisible();
    }

    async assertTotalCountContains(text: string) {
        await expect(this.totalCount).toContainText(text);
    }

    // ── Filters ────────────────────────────────────────────────
    async filterByType(type: 'deposit' | 'withdrawal' | 'transfer' | '') {
        await Promise.all([
            this.page.waitForResponse(r => r.url().includes('/api/transactions')),
            this.typeFilter.selectOption(type),
        ]);
    }

    async filterByChannel(channel: string) {
        await Promise.all([
            this.page.waitForResponse(r => r.url().includes('/api/transactions')),
            this.channelFilter.selectOption(channel),
        ]);
    }

    async filterByStatus(status: 'success' | 'failed' | 'pending' | '') {
        await Promise.all([
            this.page.waitForResponse(r => r.url().includes('/api/transactions')),
            this.statusFilter.selectOption(status),
        ]);
    }

    // ── View Transaction Popup ─────────────────────────────────
    async clickTransactionRow(index = 0) {
        const rows = this.page.locator('[data-testid^="txn-row-"]');
        await rows.nth(index).click();
        await expect(this.viewModal).toBeVisible();
    }

    async assertViewModalVisible() {
        await expect(this.viewModal).toBeVisible();
    }

    async assertViewModalContains(text: string) {
        await expect(this.viewModal).toContainText(text);
    }

    async closeViewModalBtn() {
        await this.closeViewModal.click();
        await expect(this.viewModal).not.toBeVisible();
    }

    // ── Add Transaction ────────────────────────────────────────
    async openAddModal() {
        await this.addTxnBtn.click();
        await expect(this.addTxnModal).toBeVisible();
    }

    async fillAddForm(data: {
        accountNumber: string;
        type?: 'deposit' | 'withdrawal' | 'transfer';
        channel?: string;
        amount: string;
    }) {
        await this.txnAccountNum.fill(data.accountNumber);
        if (data.type)    await this.txnType.selectOption(data.type);
        if (data.channel) await this.txnChannel.selectOption(data.channel);
        await this.txnAmount.fill(data.amount);
    }

    async submitAddForm() {
        await Promise.all([
            this.page.waitForResponse(r => r.url().includes('/api/transactions') && r.request().method() === 'POST'),
            this.saveTxnBtn.click(),
        ]);
    }

    async clickSaveButtonOnly() {
        await this.saveTxnBtn.click();
    }

    async assertAddSuccess(text?: string) {
        await expect(this.addTxnSuccess).toBeVisible();
        if (text) await expect(this.addTxnSuccess).toContainText(text);
    }

    async assertAddError(text?: string) {
        await expect(this.addTxnError).toBeVisible();
        if (text) await expect(this.addTxnError).toContainText(text);
    }

    // ── RBAC ───────────────────────────────────────────────────
    async assertAddButtonHidden() {
        await expect(this.addTxnBtn).toBeHidden();
    }

    async assertAddButtonVisible() {
        await expect(this.addTxnBtn).toBeVisible();
    }
}
