const express = require('express');
const router = express.Router();
const pool = require('../db/connection');

// GET repayments for a loan
router.get('/', async (req, res) => {
    try {
        const loanId = req.query.loan_id || '';
        if (!loanId) return res.status(400).json({ error: 'loan_id is required' });

        const result = await pool.query(
            `SELECT * FROM loan_repayments
             WHERE loan_id = $1
             ORDER BY emi_number ASC`,
            [loanId]
        );
        res.json({ data: result.rows, total: result.rows.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST record an EMI payment
router.post('/', async (req, res) => {
    try {
        const { loan_id, emi_number, payment_channel } = req.body;
        if (!loan_id || !emi_number || !payment_channel) {
            return res.status(400).json({ error: 'loan_id, emi_number and payment_channel are required' });
        }

        const today = new Date().toISOString().split('T')[0];
        const ref   = 'REF' + Date.now();

        // Check if repayment record exists
        const existing = await pool.query(
            'SELECT * FROM loan_repayments WHERE loan_id=$1 AND emi_number=$2',
            [loan_id, emi_number]
        );

        // Get loan details for EMI amount and dates if record doesn't exist
        const loanRes = await pool.query('SELECT * FROM loans WHERE id=$1', [loan_id]);
        if (loanRes.rows.length === 0) return res.status(404).json({ error: 'Loan not found' });
        const loan = loanRes.rows[0];

        let result;

        if (existing.rows.length > 0) {
            // Update existing record
            const due = new Date(existing.rows[0].due_date);
            const paid = new Date(today);
            const daysDelayed = Math.max(0, Math.floor((paid - due) / (1000*60*60*24)));

            result = await pool.query(
                `UPDATE loan_repayments
                 SET status='paid', paid_date=$1, payment_channel=$2,
                     reference_number=$3, days_delayed=$4
                 WHERE loan_id=$5 AND emi_number=$6 RETURNING *`,
                [today, payment_channel, ref, daysDelayed, loan_id, emi_number]
            );
        } else {
            // Create new record for virtual EMI
            const startDate = new Date(loan.start_date);
            const dueDate = new Date(startDate);
            dueDate.setMonth(dueDate.getMonth() + emi_number);
            const dueDateStr = dueDate.toISOString().split('T')[0];
            const daysDelayed = Math.max(0, Math.floor((new Date(today) - dueDate) / (1000*60*60*24)));

            result = await pool.query(
                `INSERT INTO loan_repayments
                 (loan_id, customer_id, emi_number, emi_amount, due_date, paid_date,
                  status, payment_channel, reference_number, days_delayed)
                 VALUES ($1, $2, $3, $4, $5, $6, 'paid', $7, $8, $9) RETURNING *`,
                [loan_id, loan.customer_id, emi_number, loan.emi_amount,
                 dueDateStr, today, payment_channel, ref, daysDelayed]
            );
        }

        // Recalculate loan score
        const all = await pool.query(
            `SELECT * FROM loan_repayments WHERE loan_id=$1`,
            [loan_id]
        );
        const onTime  = all.rows.filter(r => r.status==='paid' && parseInt(r.days_delayed)===0).length;
        const delayed = all.rows.filter(r => r.status==='paid' && parseInt(r.days_delayed)>0).length;
        const missed  = all.rows.filter(r => r.status==='overdue').length;
        const total   = onTime + delayed + missed;
        const score   = total > 0
            ? Math.min(900, Math.max(300, Math.round(300 + (onTime/total*450) - (delayed/total*100) - (missed/total*200))))
            : 750;

        await pool.query(
            `INSERT INTO loan_score (loan_id, customer_id, score, on_time_payments, delayed_payments, missed_payments)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (loan_id) DO UPDATE
             SET score=$3, on_time_payments=$4, delayed_payments=$5,
                 missed_payments=$6, last_calculated_at=NOW()`,
            [loan_id, loan.customer_id, score, onTime, delayed, missed]
        );

        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
