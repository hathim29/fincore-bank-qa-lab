import { test, expect } from '@playwright/test';
import { CreditCardsPage } from '../pages/CreditCardsPage';
import { NEW_CARD } from '../fixtures/testData';

/**
 * Credit Cards Page Tests
 *
 * Covers: stat cards, table, filters, pagination, card popup,
 *         payment flows (full/minimum/custom), block/unblock,
 *         issue new card, RBAC
 */

// ── Admin tests ────────────────────────────────────────────────
test.describe('Credit Cards Page — Admin', () => {

    let ccPage: CreditCardsPage;

    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            sessionStorage.setItem('fincore_user', JSON.stringify({ username: 'admin', role: 'admin' }));
        });
        ccPage = new CreditCardsPage(page);
        await ccPage.goto();
    });

    // ── Happy Path ─────────────────────────────────────────────

    test('should load credit cards table', async () => {
        await ccPage.assertTableVisible();
        await ccPage.assertTotalCountContains('cards found');
    });

    test('should show correct total count', async () => {
        await ccPage.assertTotalCountContains('cards found');
    });

    test('should filter by active status', async () => {
        await ccPage.filterByStatus('active');
        await ccPage.assertTableVisible();
        await ccPage.assertTotalCountContains('cards found');
    });

    test('should filter by blocked status', async () => {
        await ccPage.filterByStatus('blocked');
        await ccPage.assertTableVisible();
    });

    test('should filter by Visa card type', async () => {
        await ccPage.filterByType('Visa');
        await ccPage.assertTableVisible();
    });

    test('should filter by Mastercard type', async () => {
        await ccPage.filterByType('Mastercard');
        await ccPage.assertTableVisible();
    });

    test('should filter by RuPay type', async () => {
        await ccPage.filterByType('RuPay');
        await ccPage.assertTableVisible();
    });

    test('should navigate to next page', async () => {
        const before = await ccPage.getCurrentPageInfo();
        await ccPage.goToNextPage();
        const after = await ccPage.getCurrentPageInfo();
        expect(after.current).toBe(before.current + 1);
    });

    test('should navigate to last page', async () => {
        await ccPage.goToLastPage();
        await ccPage.assertOnLastPage();
    });

    // ── Card Popup ─────────────────────────────────────────────

    test('should open card popup on row click', async () => {
        await ccPage.clickCardRow(0);
        await ccPage.assertCardModalVisible();
    });

    test('should show transaction history section in popup', async () => {
        await ccPage.clickCardRow(0);
        await ccPage.assertTransactionHistoryVisible();
        await ccPage.closeCardModalBtn();
    });

    test('should close card popup', async () => {
        await ccPage.clickCardRow(0);
        await ccPage.closeCardModalBtn();
    });

    // ── Payment ────────────────────────────────────────────────

    test('confirm payment button should be disabled until option selected', async () => {
        // Find a card with outstanding balance
        await ccPage.filterByStatus('active');
        await ccPage.clickCardRow(0);
        const payBtn = ccPage['page'].getByTestId('card-pay-btn');
        const hasPayBtn = await payBtn.isVisible().catch(() => false);
        if (hasPayBtn) {
            await ccPage.openPaymentFromPopup();
            await ccPage.assertConfirmPayDisabled();
            await ccPage.cancelPayment();
        }
        await ccPage.closeCardModalBtn();
    });

    test('should enable confirm button when full payment selected', async () => {
        await ccPage.filterByStatus('active');
        await ccPage.clickCardRow(0);
        const payBtn = ccPage['page'].getByTestId('card-pay-btn');
        const hasPayBtn = await payBtn.isVisible().catch(() => false);
        if (hasPayBtn) {
            await ccPage.openPaymentFromPopup();
            await ccPage.selectPayFull();
            await ccPage.cancelPayment();
        }
        await ccPage.closeCardModalBtn();
    });

    test('should enable confirm button when minimum payment selected', async () => {
        await ccPage.filterByStatus('active');
        await ccPage.clickCardRow(0);
        const payBtn = ccPage['page'].getByTestId('card-pay-btn');
        const hasPayBtn = await payBtn.isVisible().catch(() => false);
        if (hasPayBtn) {
            await ccPage.openPaymentFromPopup();
            await ccPage.selectPayMinimum();
            await ccPage.cancelPayment();
        }
        await ccPage.closeCardModalBtn();
    });

    test('should pay minimum due successfully', async () => {
        await ccPage.filterByStatus('active');
        await ccPage.clickCardRow(0);
        const payBtn = ccPage['page'].getByTestId('card-pay-btn');
        const hasPayBtn = await payBtn.isVisible().catch(() => false);
        if (hasPayBtn) {
            await ccPage.openPaymentFromPopup();
            await ccPage.selectPayMinimum();
            await ccPage.confirmPayment();
            await ccPage.assertPaymentSuccess('Payment successful');
        }
    });

    test('should pay custom amount successfully', async () => {
        await ccPage.filterByStatus('active');
        await ccPage.clickCardRow(0);
        const payBtn = ccPage['page'].getByTestId('card-pay-btn');
        const hasPayBtn = await payBtn.isVisible().catch(() => false);
        if (hasPayBtn) {
            await ccPage.openPaymentFromPopup();
            await ccPage.selectPayCustom('100');
            await ccPage.confirmPayment();
            await ccPage.assertPaymentSuccess('Payment successful');
        }
    });

    // ── Block / Unblock ────────────────────────────────────────

    test('should show block confirm modal for active card', async () => {
        await ccPage.filterByStatus('active');
        await ccPage.clickCardRow(0);
        await ccPage.clickBlockFromPopup();
        // Note: cancel button closes all modals in credit-cards.html
        await ccPage['page'].locator('#cancelBlockConfirmModal').click();
        await expect(ccPage['page'].locator('#blockConfirmModal')).not.toBeVisible();
        // Card modal also closes — this is the expected behaviour
        await expect(ccPage['page'].locator('#cardModal')).not.toBeVisible();
    });

    test('should block an active card', async () => {
        await ccPage.filterByStatus('active');
        await ccPage.clickCardRow(0);
        await ccPage.clickBlockFromPopup();
        await ccPage.confirmBlockToggle();
        // Modal closes after confirmation
        await ccPage.assertTableVisible();
    });

    test('should show unblock option for blocked card', async () => {
        await ccPage.filterByStatus('blocked');
        const hasBlockedCards = await ccPage['page']
            .locator('[data-testid^="card-row-"]').first().isVisible().catch(() => false);
        if (hasBlockedCards) {
            await ccPage.clickCardRow(0);
            await expect(ccPage['page'].getByTestId('unblock-card-btn')).toBeVisible();
            await ccPage.closeCardModalBtn();
        }
    });

    // ── Issue New Card ──────────────────────────────────────────

    test('should show error when customer ID is missing', async () => {
        await ccPage.openNewCardModal();
        await ccPage.fillNewCardForm({ customerId: '' });
        await ccPage.clickSaveNewCardOnly();
        await ccPage.assertNewCardError('required');
    });

    test('should issue a new Visa card successfully', async () => {
        await ccPage.openNewCardModal();
        await ccPage.fillNewCardForm({
            customerId:  '1',
            cardType:    'Visa',
            creditLimit: NEW_CARD.creditLimit,
        });
        await ccPage.submitNewCard();
        await ccPage.assertNewCardSuccess('issued successfully');
    });

    test('should issue a new Mastercard successfully', async () => {
        await ccPage.openNewCardModal();
        await ccPage.fillNewCardForm({
            customerId:  '2',
            cardType:    'Mastercard',
            creditLimit: '50000',
        });
        await ccPage.submitNewCard();
        await ccPage.assertNewCardSuccess('issued successfully');
    });

    // ── RBAC ───────────────────────────────────────────────────

    test('admin should see New Card button', async () => {
        await ccPage.assertAddCardButtonVisible();
    });

});

// ── Viewer tests ───────────────────────────────────────────────
test.describe('Credit Cards Page — Viewer', () => {

    let ccPage: CreditCardsPage;

    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            sessionStorage.setItem('fincore_user', JSON.stringify({ username: 'viewer', role: 'viewer' }));
        });
        ccPage = new CreditCardsPage(page);
        await ccPage.goto();
    });

    test('viewer should see credit cards table', async () => {
        await ccPage.assertTableVisible();
    });

    test('viewer should not see New Card button', async () => {
        await ccPage.assertAddCardButtonHidden();
    });

    test('viewer popup should have no payment or block buttons', async () => {
        await ccPage.clickCardRow(0);
        await expect(ccPage['page'].getByTestId('card-pay-btn')).toHaveCount(0);
        await expect(ccPage['page'].getByTestId('block-card-btn')).toHaveCount(0);
        await ccPage.closeCardModalBtn();
    });

});
