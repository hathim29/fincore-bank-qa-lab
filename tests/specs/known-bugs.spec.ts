import { test, expect } from '@playwright/test';
import { API } from '../fixtures/testData';

/**
 * Known Bugs — regression tests for open defects
 *
 * Each test asserts the CORRECT behaviour and is declared with test.fail(),
 * so it is expected to fail while the bug is open:
 *   - CI stays green (an expected failure counts as a pass)
 *   - the live dashboard shows it under "Known bug"
 *   - once the bug is fixed the test PASSES, Playwright flags it as
 *     "expected to fail but passed", and test.fail() should be removed
 *
 * Known Bug 1 — EMI due dates shift back by one day in API responses
 *               (PostgreSQL DATE returned as a UTC timestamp)
 * Known Bug 2 — Loan EMI schedule mixes two date sources: duplicate due dates,
 *               out-of-order EMIs and an inflated overdue count
 */

const KNOWN_BUG_1 = 'Known Bug 1 — EMI due dates returned as UTC timestamps (one-day shift)';
const KNOWN_BUG_2 = 'Known Bug 2 — EMI schedule has duplicate / out-of-order due dates';

test.describe('Known Bugs', () => {

    test.fail('API returns EMI due dates as plain calendar dates (YYYY-MM-DD)', {
        annotation: { type: 'known-bug', description: KNOWN_BUG_1 },
    }, async ({ request }) => {
        const list = await (await request.get(`${API.loans}?limit=1&status=active`)).json();
        const loanId = list.data[0].id;
        const loan = await (await request.get(`${API.loans}/${loanId}`)).json();

        const recorded = loan.repayment_history.filter((r: any) => r.id !== null);
        expect(recorded.length).toBeGreaterThan(0);
        for (const r of recorded) {
            expect(r.due_date, `EMI #${r.emi_number} due_date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
    });

    test.fail('EMI schedule due dates are unique and strictly increasing for every active loan', {
        annotation: { type: 'known-bug', description: KNOWN_BUG_2 },
    }, async ({ request }) => {
        const list = await (await request.get(`${API.loans}?limit=50&status=active`)).json();
        expect(list.data.length).toBeGreaterThan(0);

        const broken: string[] = [];
        for (const l of list.data) {
            const loan = await (await request.get(`${API.loans}/${l.id}`)).json();
            const dates: string[] = loan.repayment_history.map((r: any) => String(r.due_date).slice(0, 10));
            const ordered = dates.every((d, i) => i === 0 || d > dates[i - 1]);
            if (!ordered) broken.push(`loan #${l.id}`);
        }
        expect(broken, `Loans whose EMI schedule is not strictly increasing`).toEqual([]);
    });

});
