// FinCore — record an EMI payment and recalculate the loan score.
// Used by POST /api/loan-repayments and by FinCore Assistant, so a payment
// made in chat behaves exactly like one made from the Loans page.

const pool = require('../../db/connection');
const { todayYMD, addMonths, daysBetween } = require('./schedule');

async function recalcLoanScore(loanId, customerId, db = pool) {
    const all = await db.query('SELECT status, days_delayed FROM loan_repayments WHERE loan_id = $1', [loanId]);
    const onTime  = all.rows.filter(r => r.status === 'paid' && parseInt(r.days_delayed, 10) === 0).length;
    const delayed = all.rows.filter(r => r.status === 'paid' && parseInt(r.days_delayed, 10) > 0).length;
    const missed  = all.rows.filter(r => r.status === 'overdue').length;
    const total   = onTime + delayed + missed;
    const score   = total > 0
        ? Math.min(900, Math.max(300, Math.round(300 + (onTime / total * 450) - (delayed / total * 100) - (missed / total * 200))))
        : 750;
    await db.query(
        `INSERT INTO loan_score (loan_id, customer_id, score, on_time_payments, delayed_payments, missed_payments)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (loan_id) DO UPDATE
         SET score = $3, on_time_payments = $4, delayed_payments = $5, missed_payments = $6, last_calculated_at = NOW()`,
        [loanId, customerId, score, onTime, delayed, missed]);
}

/**
 * Mark one EMI as paid (creating the repayment row for a "virtual" EMI if needed).
 * @returns the updated/inserted loan_repayments row, or null if the loan doesn't exist
 */
async function payEmi({ loanId, emiNumber, paymentChannel }, db = pool) {
    const loanRes = await db.query(
        `SELECT id, customer_id, emi_amount, to_char(start_date, 'YYYY-MM-DD') AS start_date
           FROM loans WHERE id = $1`, [loanId]);
    if (!loanRes.rows.length) return null;
    const loan = loanRes.rows[0];

    const today = todayYMD();
    const ref = 'REF' + Date.now() + Math.floor(Math.random() * 1000);

    const existing = await db.query(
        `SELECT to_char(due_date, 'YYYY-MM-DD') AS due_date FROM loan_repayments
          WHERE loan_id = $1 AND emi_number = $2`, [loanId, emiNumber]);

    let row;
    if (existing.rows.length) {
        const daysDelayed = Math.max(0, daysBetween(existing.rows[0].due_date, today));
        row = (await db.query(
            `UPDATE loan_repayments
                SET status = 'paid', paid_date = $1, payment_channel = $2, reference_number = $3, days_delayed = $4
              WHERE loan_id = $5 AND emi_number = $6 RETURNING *`,
            [today, paymentChannel, ref, daysDelayed, loanId, emiNumber])).rows[0];
    } else {
        const due = addMonths(loan.start_date, Number(emiNumber));
        const daysDelayed = Math.max(0, daysBetween(due, today));
        row = (await db.query(
            `INSERT INTO loan_repayments
                    (loan_id, customer_id, emi_number, emi_amount, due_date, paid_date, status,
                     payment_channel, reference_number, days_delayed)
             VALUES ($1, $2, $3, $4, $5, $6, 'paid', $7, $8, $9) RETURNING *`,
            [loanId, loan.customer_id, emiNumber, loan.emi_amount, due, today, paymentChannel, ref, daysDelayed])).rows[0];
    }

    await recalcLoanScore(loanId, loan.customer_id, db);
    return row;
}

module.exports = { payEmi, recalcLoanScore };
