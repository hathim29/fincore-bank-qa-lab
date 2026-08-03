import { Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * LoansPage — Page Object for /loans.html
 */
export class LoansPage extends BasePage {

    // ── Locators ───────────────────────────────────────────────
    private get statusFilter()      { return this.page.getByTestId('status-filter'); }
    private get typeFilter()        { return this.page.getByTestId('type-filter'); }
    private get rowsPerPage()       { return this.page.getByTestId('rows-per-page'); }
    private get totalCount()        { return this.page.getByTestId('total-count'); }
    private get loansTable()        { return this.page.getByTestId('loans-table'); }
    private get loansBody()         { return this.page.getByTestId('loans-body'); }
    private get addLoanBtn()        { return this.page.getByTestId('add-loan-btn'); }

    // ── Table ──────────────────────────────────────────────────
    async assertTableVisible() {
        await expect(this.loansTable).toBeVisible();
        await expect(this.loansBody).toBeVisible();
    }

    private get loanModal()         { return this.page.locator('#loanModal'); }
    private get closeLoanModal()    { return this.page.locator('#closeLoanModal'); }
    private get repaymentTable()    { return this.page.getByTestId('repayment-table'); }
    private get scoreWidget()       { return this.page.getByTestId('score-widget'); }
    private get foreclosureBtn()    { return this.page.getByTestId('foreclose-btn'); }
    private get closeLoanBtn()      { return this.page.getByTestId('close-loan-btn'); }

    // New loan modal
    private get newLoanModal()      { return this.page.locator('#newLoanModal'); }
    private get nlCustomerId()      { return this.page.getByTestId('nl-customer-id'); }
    private get nlLoanType()        { return this.page.getByTestId('nl-loan-type'); }
    private get nlPrincipal()       { return this.page.getByTestId('nl-principal'); }
    private get nlRate()            { return this.page.getByTestId('nl-rate'); }
    private get nlTenure()          { return this.page.getByTestId('nl-tenure'); }
    private get saveNewLoanBtn()    { return this.page.getByTestId('save-new-loan-btn'); }
    private get newLoanError()      { return this.page.locator('#newLoanError'); }
    private get newLoanSuccess()    { return this.page.locator('#newLoanSuccess'); }
    private get emiPreview()        { return this.page.locator('#emiPreview'); }

    // Pay EMI modal
    private get payEmiModal()       { return this.page.locator('#payEmiModal'); }
    private get payEmiChannel()     { return this.page.getByTestId('pay-emi-channel'); }
    private get confirmPayEmiBtn()  { return this.page.getByTestId('confirm-pay-emi-btn'); }

    // Foreclose modal
    private get foreclosureModal()  { return this.page.locator('#foreclosureModal'); }
    private get confirmForeclosure(){ return this.page.getByTestId('confirm-foreclosure-btn'); }

    // ── Navigation ─────────────────────────────────────────────
    async goto() {
        await super.goto('/loans.html');
    }

    // ── Stat Cards ─────────────────────────────────────────────
    async getStatActive() { return this.statActive.textContent(); }
    async getStatClosed() { return this.statClosed.textContent(); }

    // ── Table ──────────────────────────────────────────────────
    async assertTableVisible() {
        await expect(this.loansTable).toBeVisible();
        await expect(this.loansBody).toBeVisible();
    }

    async assertTotalCountContains(text: string) {
        await expect(this.totalCount).toContainText(text);
    }

    // ── Filters ────────────────────────────────────────────────
    async filterByStatus(status: 'active' | 'overdue' | 'closed' | 'foreclosed' | '') {
        await Promise.all([
            this.page.waitForResponse(r => r.url().includes('/api/loans')),
            this.statusFilter.selectOption(status),
        ]);
    }

    async filterByType(type: 'personal' | 'home' | 'auto' | 'education' | 'business' | '') {
        await Promise.all([
            this.page.waitForResponse(r => r.url().includes('/api/loans')),
            this.typeFilter.selectOption(type),
        ]);
    }

    // ── Loan Popup ─────────────────────────────────────────────
    async clickLoanRow(index = 0) {
        const rows = this.page.locator('[data-testid^="loan-row-"]');
        await rows.nth(index).click();
        await expect(this.loanModal).toBeVisible();
    }

    async assertLoanModalVisible() {
        await expect(this.loanModal).toBeVisible();
    }

    async assertRepaymentTableVisible() {
        await expect(this.repaymentTable).toBeVisible();
    }

    async assertScoreWidgetVisible() {
        await expect(this.scoreWidget).toBeVisible();
    }

    async closeLoanModalBtn() {
        await this.closeLoanModal.click();
        await expect(this.loanModal).not.toBeVisible();
    }

    // ── Pay EMI ────────────────────────────────────────────────
    async clickPayEmiButton() {
        await this.page.getByTestId('pay-emi-btn').first().click();
        await expect(this.payEmiModal).toBeVisible();
    }

    async selectPaymentChannel(channel: string) {
        await this.payEmiChannel.selectOption(channel);
    }

    async confirmEmiPayment() {
        await Promise.all([
            this.page.waitForResponse(r =>
                r.url().includes('/api/loan-repayments') && r.request().method() === 'POST'
            ),
            this.confirmPayEmiBtn.click(),
        ]);
    }

    // ── Foreclose Loan ──────────────────────────────────────────
    async clickForecloseButton() {
        await this.foreclosureBtn.click();
        await expect(this.foreclosureModal).toBeVisible();
    }

    async confirmForeclosure() {
        await Promise.all([
            this.page.waitForResponse(r =>
                r.url().includes('/api/loans') && r.request().method() === 'PUT'
            ),
            this.confirmForeclosure.click(),
        ]);
    }

    async assertForecloseButtonVisible() {
        await expect(this.foreclosureBtn).toBeVisible();
    }

    async assertCloseLoanButtonVisible() {
        await expect(this.closeLoanBtn).toBeVisible();
    }

    async assertCloseLoanButtonHidden() {
        await expect(this.closeLoanBtn).toHaveCount(0);
    }

    // ── Create New Loan ────────────────────────────────────────
    async openNewLoanModal() {
        await this.addLoanBtn.click();
        await expect(this.newLoanModal).toBeVisible();
    }

    async fillNewLoanForm(data: {
        customerId: string;
        loanType?: string;
        principal: string;
        rate: string;
        tenure?: string;
    }) {
        await this.nlCustomerId.fill(data.customerId);
        if (data.loanType) await this.nlLoanType.selectOption(data.loanType);
        await this.nlPrincipal.fill(data.principal);
        await this.nlRate.fill(data.rate);
        if (data.tenure) await this.nlTenure.selectOption(data.tenure);
    }

    async assertEmiPreviewVisible() {
        await expect(this.emiPreview).toBeVisible();
    }

    async submitNewLoan() {
        await Promise.all([
            this.page.waitForResponse(r =>
                r.url().includes('/api/loans') && r.request().method() === 'POST'
            ),
            this.saveNewLoanBtn.click(),
        ]);
    }

    async clickSaveNewLoanOnly() {
        await this.saveNewLoanBtn.click();
    }

    async assertNewLoanSuccess(text?: string) {
        await expect(this.newLoanSuccess).toBeVisible();
        if (text) await expect(this.newLoanSuccess).toContainText(text);
    }

    async assertNewLoanError(text?: string) {
        await expect(this.newLoanError).toBeVisible();
        if (text) await expect(this.newLoanError).toContainText(text);
    }

    // ── RBAC ───────────────────────────────────────────────────
    async assertAddLoanButtonHidden() {
        await expect(this.addLoanBtn).toBeHidden();
    }

    async assertAddLoanButtonVisible() {
        await expect(this.addLoanBtn).toBeVisible();
    }
}