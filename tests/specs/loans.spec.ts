import { test, expect } from '@playwright/test';
import { LoansPage } from '../pages/LoansPage';
import { NEW_LOAN } from '../fixtures/testData';

/**
 * Loans Page Tests
 *
 * Covers: stat cards, table, filters, pagination, loan popup,
 *         repayment table, loan score, create loan, pay EMI,
 *         foreclose, RBAC
 */

// ── Admin tests ────────────────────────────────────────────────
test.describe('Loans Page — Admin', () => {

    let loansPage: LoansPage;

    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            sessionStorage.setItem('fincore_user', JSON.stringify({ username: 'admin', role: 'admin' }));
        });
        loansPage = new LoansPage(page);
        await loansPage.goto();
    });

    // ── Happy Path ─────────────────────────────────────────────

    test('should load loans table with stat cards', async () => {
        await loansPage.assertTableVisible();
        await loansPage.assertStatCardsLoaded();
    });

    test('should show correct total count', async () => {
        await loansPage.assertTotalCountContains('loans found');
    });

    test('should filter by active status', async () => {
        await loansPage.filterByStatus('active');
        await loansPage.assertTableVisible();
        await loansPage.assertTotalCountContains('loans found');
    });

    test('should filter by overdue status', async () => {
        await loansPage.filterByStatus('overdue');
        await loansPage.assertTableVisible();
    });

    test('should filter by closed status', async () => {
        await loansPage.filterByStatus('closed');
        await loansPage.assertTableVisible();
    });

    test('should filter by personal loan type', async () => {
        await loansPage.filterByType('personal');
        await loansPage.assertTableVisible();
    });

    test('should filter by home loan type', async () => {
        await loansPage.filterByType('home');
        await loansPage.assertTableVisible();
    });

    test('should navigate to next page', async () => {
        const before = await loansPage.getCurrentPageInfo();
        await loansPage.goToNextPage();
        const after = await loansPage.getCurrentPageInfo();
        expect(after.current).toBe(before.current + 1);
    });

    // ── Loan Popup ─────────────────────────────────────────────

    test('should open loan popup on row click', async () => {
        await loansPage.clickLoanRow(0);
        await loansPage.assertLoanModalVisible();
    });

    test('should show repayment history table in popup', async () => {
        await loansPage.clickLoanRow(0);
        await loansPage.assertRepaymentTableVisible();
    });

    test('should show loan score widget in popup', async () => {
        await loansPage.clickLoanRow(0);
        await loansPage.assertScoreWidgetVisible();
    });

    test('should close loan popup', async () => {
        await loansPage.clickLoanRow(0);
        await loansPage.closeLoanModalBtn();
    });

    test('active loan should show foreclose button', async () => {
        await loansPage.filterByStatus('active');
        await loansPage.clickLoanRow(0);
        await loansPage.assertForecloseButtonVisible();
        await loansPage.closeLoanModalBtn();
    });

    test('active loan should not show close loan button when EMIs pending', async () => {
        await loansPage.filterByStatus('active');
        await loansPage.clickLoanRow(0);
        await loansPage.assertCloseLoanButtonHidden();
        await loansPage.closeLoanModalBtn();
    });

    // ── Pay EMI ────────────────────────────────────────────────

    test('should open pay EMI modal from popup', async () => {
        await loansPage.filterByStatus('active');
        await loansPage.clickLoanRow(0);
        // Check if pay EMI button exists — depends on loan having pending EMIs
        const payBtn = loansPage['page'].getByTestId('pay-emi-btn').first();
        const hasPayBtn = await payBtn.isVisible().catch(() => false);
        if (hasPayBtn) {
            await payBtn.click();
            await expect(loansPage['page'].locator('#payEmiModal')).toBeVisible();
            // Cancel
            await loansPage['page'].locator('#cancelPayEmiModal').click();
        }
        await loansPage.closeLoanModalBtn();
    });

    test('should pay an EMI successfully', async () => {
        await loansPage.filterByStatus('active');
        await loansPage.clickLoanRow(0);
        const payBtn = loansPage['page'].getByTestId('pay-emi-btn').first();
        const hasPayBtn = await payBtn.isVisible().catch(() => false);
        if (hasPayBtn) {
            await payBtn.click();
            await loansPage.selectPaymentChannel('UPI-GPay');
            await loansPage.confirmEmiPayment();
            // Modal closes and popup refreshes
            await loansPage.assertTableVisible();
        }
    });

    // ── Create New Loan ────────────────────────────────────────

    test('should show EMI preview when form is filled', async () => {
        await loansPage.openNewLoanModal();
        await loansPage.fillNewLoanForm({
            customerId: '1',
            loanType:   NEW_LOAN.loanType,
            principal:  NEW_LOAN.principalAmount,
            rate:       NEW_LOAN.interestRate,
            tenure:     NEW_LOAN.tenureMonths,
        });
        await loansPage.assertEmiPreviewVisible();
    });

    test('should show error when customer ID is missing', async () => {
        await loansPage.openNewLoanModal();
        await loansPage.fillNewLoanForm({
            customerId: '',
            principal:  NEW_LOAN.principalAmount,
            rate:       NEW_LOAN.interestRate,
        });
        await loansPage.clickSaveNewLoanOnly();
        await loansPage.assertNewLoanError('required');
    });

    test('should create a new loan successfully', async () => {
        await loansPage.openNewLoanModal();
        await loansPage.fillNewLoanForm({
            customerId: '1',
            loanType:   NEW_LOAN.loanType,
            principal:  NEW_LOAN.principalAmount,
            rate:       NEW_LOAN.interestRate,
            tenure:     NEW_LOAN.tenureMonths,
        });
        await loansPage.submitNewLoan();
        await loansPage.assertNewLoanSuccess('created successfully');
    });

    // ── RBAC ───────────────────────────────────────────────────

    test('admin should see New Loan button', async () => {
        await loansPage.assertAddLoanButtonVisible();
    });

});

// ── Viewer tests ───────────────────────────────────────────────
test.describe('Loans Page — Viewer', () => {

    let loansPage: LoansPage;

    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            sessionStorage.setItem('fincore_user', JSON.stringify({ username: 'viewer', role: 'viewer' }));
        });
        loansPage = new LoansPage(page);
        await loansPage.goto();
    });

    test('viewer should see loans table', async () => {
        await loansPage.assertTableVisible();
    });

    test('viewer should not see New Loan button', async () => {
        await loansPage.assertAddLoanButtonHidden();
    });

    test('viewer popup should have no pay EMI button', async () => {
        await loansPage.clickLoanRow(0);
        await expect(
            loansPage['page'].getByTestId('pay-emi-btn')
        ).toHaveCount(0);
        await loansPage.closeLoanModalBtn();
    });

});
