import { Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * CreditCardsPage — Page Object for /credit-cards.html
 */
export class CreditCardsPage extends BasePage {

    // ── Locators ───────────────────────────────────────────────
    private get statusFilter()      { return this.page.getByTestId('status-filter'); }
    private get typeFilter()        { return this.page.getByTestId('card-type-filter'); }
    private get rowsPerPage()       { return this.page.getByTestId('rows-per-page'); }
    private get totalCount()        { return this.page.getByTestId('total-count'); }
    private get cardsTable()        { return this.page.getByTestId('credit-cards-table'); }
    private get cardsBody()         { return this.page.getByTestId('cards-body'); }
    private get addCardBtn()        { return this.page.getByTestId('add-card-btn'); }

    // ── Table ──────────────────────────────────────────────────
    async assertTableVisible() {
        await expect(this.cardsTable).toBeVisible();
        await expect(this.cardsBody).toBeVisible();
    }

    private get cardModal()         { return this.page.locator('#cardModal'); }
    private get closeCardModal()    { return this.page.locator('#closeCardModal'); }
    private get cardPayBtn()        { return this.page.getByTestId('card-pay-btn'); }
    private get blockCardBtn()      { return this.page.getByTestId('block-card-btn'); }
    private get unblockCardBtn()    { return this.page.getByTestId('unblock-card-btn'); }

    // Payment modal
    private get paymentModal()      { return this.page.locator('#paymentModal'); }
    private get optFull()           { return this.page.locator('#opt-full'); }
    private get optMinimum()        { return this.page.locator('#opt-minimum'); }
    private get optCustom()         { return this.page.locator('#opt-custom'); }
    private get customPayAmt()      { return this.page.getByTestId('custom-pay-amt'); }
    private get confirmPayBtn()     { return this.page.getByTestId('confirm-payment-btn'); }
    private get cancelPayBtn()      { return this.page.locator('#cancelPaymentModal'); }
    private get paymentError()      { return this.page.locator('#paymentError'); }
    private get paymentSuccess()    { return this.page.locator('#paymentSuccess'); }

    // Block/Unblock confirm modal
    private get blockConfirmModal() { return this.page.locator('#blockConfirmModal'); }
    private get confirmBlockBtn()   { return this.page.getByTestId('confirm-block-btn'); }
    private get cancelBlockBtn()    { return this.page.locator('#cancelBlockConfirmModal'); }

    // New card modal
    private get newCardModal()      { return this.page.locator('#newCardModal'); }
    private get ncCustomerId()      { return this.page.getByTestId('nc-customer-id'); }
    private get ncCardType()        { return this.page.getByTestId('nc-card-type'); }
    private get ncCreditLimit()     { return this.page.getByTestId('nc-credit-limit'); }
    private get saveNewCardBtn()    { return this.page.getByTestId('save-new-card-btn'); }
    private get newCardError()      { return this.page.locator('#newCardError'); }
    private get newCardSuccess()    { return this.page.locator('#newCardSuccess'); }

    // ── Navigation ─────────────────────────────────────────────
    async goto() {
        await super.goto('/credit-cards.html');
    }

    // ── Table ──────────────────────────────────────────────────
    async assertTableVisible() {
        await expect(this.cardsTable).toBeVisible();
        await expect(this.cardsBody).toBeVisible();
    }

    async assertTotalCountContains(text: string) {
        await expect(this.totalCount).toContainText(text);
    }

    // ── Filters ────────────────────────────────────────────────
    async filterByStatus(status: 'active' | 'blocked' | 'expired' | '') {
        await Promise.all([
            this.page.waitForResponse(r => r.url().includes('/api/credit-cards')),
            this.statusFilter.selectOption(status),
        ]);
    }

    async filterByType(type: 'Visa' | 'Mastercard' | 'RuPay' | '') {
        await Promise.all([
            this.page.waitForResponse(r => r.url().includes('/api/credit-cards')),
            this.typeFilter.selectOption(type),
        ]);
    }

    // ── Card Popup ─────────────────────────────────────────────
    async clickCardRow(index = 0) {
        const rows = this.page.locator('[data-testid^="card-row-"]');
        await rows.nth(index).click();
        await expect(this.cardModal).toBeVisible();
    }

    async assertCardModalVisible() {
        await expect(this.cardModal).toBeVisible();
    }

    async closeCardModalBtn() {
        await this.closeCardModal.click();
        await expect(this.cardModal).not.toBeVisible();
    }

    async assertTransactionHistoryVisible() {
        await expect(
            this.page.locator('.detail-section-title').filter({ hasText: 'Transaction History' })
        ).toBeVisible();
    }

    // ── Payment ────────────────────────────────────────────────
    async openPaymentFromPopup() {
        await this.cardPayBtn.click();
        await expect(this.paymentModal).toBeVisible();
    }

    async selectPayFull() {
        await this.optFull.click();
        await expect(this.confirmPayBtn).toBeEnabled();
    }

    async selectPayMinimum() {
        await this.optMinimum.click();
        await expect(this.confirmPayBtn).toBeEnabled();
    }

    async selectPayCustom(amount: string) {
        await this.optCustom.click();
        await this.customPayAmt.fill(amount);
        await expect(this.confirmPayBtn).toBeEnabled();
    }

    async assertConfirmPayDisabled() {
        await expect(this.confirmPayBtn).toBeDisabled();
    }

    async confirmPayment() {
        await Promise.all([
            this.page.waitForResponse(r =>
                r.url().includes('/api/credit-cards') && r.url().includes('/payment')
            ),
            this.confirmPayBtn.click(),
        ]);
    }

    async cancelPayment() {
        await this.cancelPayBtn.click();
        await expect(this.paymentModal).not.toBeVisible();
    }

    async assertPaymentSuccess(text?: string) {
        await expect(this.paymentSuccess).toBeVisible();
        if (text) await expect(this.paymentSuccess).toContainText(text);
    }

    async assertPaymentError(text?: string) {
        await expect(this.paymentError).toBeVisible();
        if (text) await expect(this.paymentError).toContainText(text);
    }

    // ── Block / Unblock ────────────────────────────────────────
    async clickBlockFromPopup() {
        await this.blockCardBtn.click();
        await expect(this.blockConfirmModal).toBeVisible();
    }

    async clickUnblockFromPopup() {
        await this.unblockCardBtn.click();
        await expect(this.blockConfirmModal).toBeVisible();
    }

    async confirmBlockToggle() {
        await Promise.all([
            this.page.waitForResponse(r =>
                r.url().includes('/api/credit-cards') && r.url().includes('/status')
            ),
            this.confirmBlockBtn.click(),
        ]);
    }

    async cancelBlockToggle() {
        await this.page.locator('#cancelBlockConfirmModal').click();
        await expect(this.blockConfirmModal).not.toBeVisible();
    }

    // ── Issue New Card ──────────────────────────────────────────
    async openNewCardModal() {
        await this.addCardBtn.click();
        await expect(this.newCardModal).toBeVisible();
    }

    async fillNewCardForm(data: {
        customerId: string;
        cardType?: 'Visa' | 'Mastercard' | 'RuPay';
        creditLimit?: string;
    }) {
        await this.ncCustomerId.fill(data.customerId);
        if (data.cardType)    await this.ncCardType.selectOption(data.cardType);
        if (data.creditLimit) await this.ncCreditLimit.selectOption(data.creditLimit);
    }

    async submitNewCard() {
        await Promise.all([
            this.page.waitForResponse(r =>
                r.url().includes('/api/credit-cards') && r.request().method() === 'POST'
            ),
            this.saveNewCardBtn.click(),
        ]);
    }

    async clickSaveNewCardOnly() {
        await this.saveNewCardBtn.click();
    }

    async assertNewCardSuccess(text?: string) {
        await expect(this.newCardSuccess).toBeVisible();
        if (text) await expect(this.newCardSuccess).toContainText(text);
    }

    async assertNewCardError(text?: string) {
        await expect(this.newCardError).toBeVisible();
        if (text) await expect(this.newCardError).toContainText(text);
    }

    // ── RBAC ───────────────────────────────────────────────────
    async assertAddCardButtonHidden() {
        await expect(this.addCardBtn).toBeHidden();
    }

    async assertAddCardButtonVisible() {
        await expect(this.addCardBtn).toBeVisible();
    }
}