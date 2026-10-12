const express = require('express');
const router = express.Router();
const pool = require('../db/connection');
const { payEmi } = require('../services/loans/payEmi');

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

// POST record an EMI payment (logic shared with FinCore Assistant — services/loans/payEmi.js)
router.post('/', async (req, res) => {
    try {
        const { loan_id, emi_number, payment_channel } = req.body;
        if (!loan_id || !emi_number || !payment_channel) {
            return res.status(400).json({ error: 'loan_id, emi_number and payment_channel are required' });
        }
        const row = await payEmi({ loanId: loan_id, emiNumber: emi_number, paymentChannel: payment_channel });
        if (!row) return res.status(404).json({ error: 'Loan not found' });
        res.json(row);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
