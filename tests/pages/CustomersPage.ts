import { Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * CustomersPage — Page Object for /customers.html
 *
 * Encapsulates all selectors and actions for the customers page.
 */
export class CustomersPage extends BasePage {

    // ── Locators ───────────────────────────────────────────────
    private get searchInput()        { return this.page.getByTestId('search-input'); }
    private get kycFilter()          { return this.page.getByTestId('kyc-filter'); }
    private get rowsPerPage()        { return this.page.getByTestId('rows-per-page'); }
    private get totalCount()         { return this.page.getByTestId('total-count'); }
    private get customersTable()     { return this.page.getByTestId('customers-table'); }
    private get customersBody()      { return this.page.getByTestId('customers-body'); }
    private get addCustomerBtn()     { return this.page.getByTestId('add-customer-button'); }
    private get pageInfo()           { return this.page.getByTestId('page-info'); }

    // Add customer modal
    private get addModal()           { return this.page.locator('#addCustomerModal'); }
    private get modalName()          { return this.page.getByTestId('modal-name'); }
    private get modalEmail()         { return this.page.getByTestId('modal-email'); }
    private get modalPhone()         { return this.page.getByTestId('modal-phone'); }
    private get modalCity()          { return this.page.getByTestId('modal-city'); }
    private get modalKyc()           { return this.page.getByTestId('modal-kyc'); }
    private get saveCustomerBtn()    { return this.page.getByTestId('save-customer-button'); }
    private get modalError()         { return this.page.locator('#modalError'); }
    private get modalSuccess()       { return this.page.locator('#modalSuccess'); }

    // Edit customer modal
    private get editModal()          { return this.page.locator('#editCustomerModal'); }
    private get editName()           { return this.page.getByTestId('edit-name'); }
    private get editEmail()          { return this.page.getByTestId('edit-email'); }
    private get editPhone()          { return this.page.getByTestId('edit-phone'); }
    private get editCity()           { return this.page.getByTestId('edit-city'); }
    private get editKyc()            { return this.page.getByTestId('edit-kyc'); }
    private get saveEditBtn()        { return this.page.getByTestId('save-edit-button'); }
    private get editModalError()     { return this.page.locator('#editModalError'); }
    private get editModalSuccess()   { return this.page.locator('#editModalSuccess'); }

    // View customer modal
    private get viewModal()          { return this.page.locator('#viewCustomerModal'); }
    private get closeViewModal()     { return this.page.locator('#closeViewModal'); }

    // Add account modal
    private get addAccountModal()    { return this.page.locator('#addAccountModal'); }
    private get addAccType()         { return this.page.getByTestId('add-acc-type'); }
    private get addAccBalance()      { return this.page.getByTestId('add-acc-balance'); }
    private get saveAddAccBtn()      { return this.page.getByTestId('save-add-acc-button'); }
    private get addAccSuccess()      { return this.page.locator('#addAccSuccess'); }
    private get addAccError()        { return this.page.locator('#addAccError'); }

    // ── Navigation ─────────────────────────────────────────────
    async goto() {
        await super.goto('/customers.html');
    }

    // ── Search ─────────────────────────────────────────────────
    async search(term: string) {
        await this.searchInput.fill(term);
        await this.page.waitForResponse(r => r.url().includes('/api/customers'));
    }

    async clearSearch() {
        await this.searchInput.fill('');
        await this.page.waitForResponse(r => r.url().includes('/api/customers'));
    }

    // ── Filters ────────────────────────────────────────────────
    async filterByKyc(status: 'verified' | 'pending' | 'rejected' | '') {
        await this.kycFilter.selectOption(status);
        await this.page.waitForLoadState('networkidle');
    }

    async setRowsPerPage(rows: '10' | '25' | '50') {
        await this.rowsPerPage.selectOption(rows);
        await this.page.waitForResponse(r => r.url().includes('/api/customers'));
    }

    // ── Table assertions ───────────────────────────────────────
    async assertTableVisible() {
        await expect(this.customersTable).toBeVisible();
        await expect(this.customersBody).toBeVisible();
    }

    async assertTotalCountContains(text: string) {
        await expect(this.totalCount).toContainText(text);
    }

    async assertNoResults() {
        await expect(this.customersBody).toContainText('No customers found');
    }

    async assertRowCount(count: number) {
        const rows = this.page.locator('[data-testid^="customer-row-"]');
        await expect(rows).toHaveCount(count);
    }

    // ── Add Customer ───────────────────────────────────────────
    async openAddModal() {
        await this.addCustomerBtn.click();
        await expect(this.addModal).toBeVisible();
    }

    async fillAddForm(data: {
        name?: string;
        email?: string;
        phone?: string;
        city?: string;
        kyc?: string;
    }) {
        if (data.name  !== undefined) await this.modalName.fill(data.name);
        if (data.email !== undefined) await this.modalEmail.fill(data.email);
        if (data.phone !== undefined) await this.modalPhone.fill(data.phone);
        if (data.city  !== undefined) await this.modalCity.fill(data.city);
        if (data.kyc   !== undefined) await this.modalKyc.selectOption(data.kyc);
    }

    async submitAddForm() {
        await Promise.all([
            this.page.waitForResponse(
                r => r.url().includes('/api/customers') && r.request().method() === 'POST'
            ),
            this.saveCustomerBtn.click(),
        ]);
    }

    // Use this for negative tests — no API call is made when validation fails
    async clickSaveButtonOnly() {
        await this.saveCustomerBtn.click();
    }

    async addCustomer(data: {
        name: string;
        email: string;
        phone?: string;
        city?: string;
        kyc?: string;
    }) {
        await this.openAddModal();
        await this.fillAddForm(data);
        await this.submitAddForm();
    }

    async assertAddSuccess(text?: string) {
        await expect(this.modalSuccess).toBeVisible();
        if (text) await expect(this.modalSuccess).toContainText(text);
    }

    async assertAddError(text?: string) {
        await expect(this.modalError).toBeVisible();
        if (text) await expect(this.modalError).toContainText(text);
    }

    // ── View Customer ──────────────────────────────────────────
    async clickCustomerRow(index = 0) {
        const rows = this.page.locator('tbody tr');
        await rows.nth(index).click();
        await expect(this.viewModal).toBeVisible();
    }

    async closeViewModalBtn() {
        await this.closeViewModal.click();
        await expect(this.viewModal).not.toBeVisible();
    }

    async assertViewModalVisible() {
        await expect(this.viewModal).toBeVisible();
    }

    // ── Edit Customer ──────────────────────────────────────────
    async clickEditButton(rowIndex = 0) {
        const editBtns = this.page.locator('[title="Edit Customer"]');
        await editBtns.nth(rowIndex).click();
        await expect(this.editModal).toBeVisible();
    }

    async fillEditForm(data: {
        name?: string;
        email?: string;
        phone?: string;
        city?: string;
        kyc?: string;
    }) {
        if (data.name  !== undefined) { await this.editName.clear(); await this.editName.fill(data.name); }
        if (data.email !== undefined) { await this.editEmail.clear(); await this.editEmail.fill(data.email); }
        if (data.phone !== undefined) { await this.editPhone.clear(); await this.editPhone.fill(data.phone); }
        if (data.city  !== undefined) { await this.editCity.clear(); await this.editCity.fill(data.city); }
        if (data.kyc   !== undefined) await this.editKyc.selectOption(data.kyc);
    }

    async submitEditForm() {
        await this.saveEditBtn.click();
        await this.page.waitForResponse(
            r => r.url().includes('/api/customers') && r.request().method() === 'PUT'
        );
    }

    async assertEditSuccess(text?: string) {
        await expect(this.editModalSuccess).toBeVisible();
        if (text) await expect(this.editModalSuccess).toContainText(text);
    }

    async assertEditError(text?: string) {
        await expect(this.editModalError).toBeVisible();
        if (text) await expect(this.editModalError).toContainText(text);
    }

    // ── Add Account for Customer ───────────────────────────────
    async clickAddAccountButton(rowIndex = 0) {
        const addAccBtns = this.page.locator('[title="Add Account"]');
        await addAccBtns.nth(rowIndex).click();
        await expect(this.addAccountModal).toBeVisible();
    }

    async fillAddAccountForm(accountType: 'savings' | 'current' | 'salary', balance?: string) {
        await this.addAccType.selectOption(accountType);
        if (balance) await this.addAccBalance.fill(balance);
    }

    async submitAddAccountForm() {
        await this.saveAddAccBtn.click();
        await this.page.waitForResponse(
            r => r.url().includes('/api/accounts') && r.request().method() === 'POST'
        );
    }

    async assertAddAccountSuccess(text?: string) {
        await expect(this.addAccSuccess).toBeVisible();
        if (text) await expect(this.addAccSuccess).toContainText(text);
    }

    async assertAddAccountError(text?: string) {
        await expect(this.addAccError).toBeVisible();
        if (text) await expect(this.addAccError).toContainText(text);
    }

    // ── RBAC ───────────────────────────────────────────────────
    async assertAddButtonHidden() {
        await expect(this.addCustomerBtn).toBeHidden();
    }

    async assertAddButtonVisible() {
        await expect(this.addCustomerBtn).toBeVisible();
    }
}
