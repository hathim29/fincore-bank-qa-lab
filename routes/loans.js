const express = require('express');
const router = express.Router();
const pool = require('../db/connection');

// GET all loans (pagination + filter by status/type)
router.get('/', async (req, res) => {
    try {
        const page      = parseInt(req.query.page)  || 1;
        const limit     = parseInt(req.query.limit) || 10;
        const offset    = (page - 1) * limit;
        const status    = req.query.status    || '';
        const loanType  = req.query.loan_type || '';

        let conditions = [], params = [], p = 1;
        if (status)   { conditions.push(`l.status = $${p++}`);    params.push(status); }
        if (loanType) { conditions.push(`l.loan_type = $${p++}`); params.push(loanType); }

        const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

        const data = await pool.query(
            `SELECT l.*, c.name as customer_name, c.email as customer_email,
                    c.phone as customer_phone,
                    ls.score as loan_score
             FROM loans l
             JOIN customers c ON l.customer_id = c.id
             LEFT JOIN loan_score ls ON ls.loan_id = l.id
             ${where}
             ORDER BY l.applied_at DESC
             LIMIT $${p} OFFSET $${p + 1}`,
            [...params, limit, offset]
        );
        const count = await pool.query(
            `SELECT COUNT(*) FROM loans l ${where}`, params
        );
        res.json({ data: data.rows, total: parseInt(count.rows[0].count), page, limit });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET single loan with full details — for popup
router.get('/:id', async (req, res) => {
    try {
        const loan = await pool.query(
            `SELECT l.*, c.name as customer_name, c.email as customer_email,
                    c.phone as customer_phone, c.city as customer_city,
                    a.account_number, a.account_type,
                    ls.score as loan_score, ls.on_time_payments,
                    ls.delayed_payments, ls.missed_payments
             FROM loans l
             JOIN customers c ON l.customer_id = c.id
             LEFT JOIN accounts a ON l.account_id = a.id
             LEFT JOIN loan_score ls ON ls.loan_id = l.id
             WHERE l.id = $1`,
            [req.params.id]
        );
        if (loan.rows.length === 0) return res.status(404).json({ error: 'Loan not found' });

        const loanData = loan.rows[0];

        // Get existing repayment records
        const existing = await pool.query(
            `SELECT * FROM loan_repayments
             WHERE loan_id = $1
             ORDER BY emi_number ASC`,
            [req.params.id]
        );

        // Build full EMI schedule — fill in any missing EMI records
        const existingMap = {};
        existing.rows.forEach(r => { existingMap[r.emi_number] = r; });

        const fullSchedule = [];
        const startDate = new Date(loanData.start_date);

        for (let i = 1; i <= loanData.tenure_months; i++) {
            if (existingMap[i]) {
                fullSchedule.push(existingMap[i]);
            } else {
                // Generate virtual EMI entry — EMI #i is due i months after start date
                const dueDate = new Date(startDate);
                dueDate.setMonth(dueDate.getMonth() + i);
                const today = new Date();
                today.setHours(0,0,0,0);
                const status = dueDate < today ? 'overdue' : 'pending';
                const daysDelayed = status === 'overdue'
                    ? Math.floor((today - dueDate) / (1000*60*60*24))
                    : 0;
                fullSchedule.push({
                    id: null,
                    loan_id: parseInt(req.params.id),
                    customer_id: loanData.customer_id,
                    emi_number: i,
                    emi_amount: loanData.emi_amount,
                    due_date: dueDate.toISOString().split('T')[0],
                    paid_date: null,
                    status,
                    payment_channel: null,
                    reference_number: null,
                    days_delayed: daysDelayed
                });
            }
        }

        // Current EMI — first overdue, then first pending
        const overdueEMIs = fullSchedule.filter(r => r.status === 'overdue');
        const pendingEMIs = fullSchedule.filter(r => r.status === 'pending');
        const currentEMI  = overdueEMIs.length > 0
            ? overdueEMIs[0]   // oldest overdue first
            : pendingEMIs.length > 0
            ? pendingEMIs[0]   // next pending
            : null;

        res.json({
            ...loanData,
            repayment_history: fullSchedule,
            current_emi: currentEMI
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST create new loan
router.post('/', async (req, res) => {
    try {
        const { customer_id, account_id, loan_type, principal_amount,
                interest_rate, tenure_months, start_date } = req.body;

        if (!customer_id || !loan_type || !principal_amount || !interest_rate || !tenure_months) {
            return res.status(400).json({ error: 'customer_id, loan_type, principal_amount, interest_rate and tenure_months are required' });
        }

        // Calculate EMI
        const monthlyRate = interest_rate / 12 / 100;
        const emi = parseFloat(
            (principal_amount * monthlyRate * Math.pow(1 + monthlyRate, tenure_months) /
            (Math.pow(1 + monthlyRate, tenure_months) - 1)).toFixed(2)
        );

        const sDate = start_date || new Date().toISOString().split('T')[0];
        const eDate = new Date(sDate);
        eDate.setMonth(eDate.getMonth() + tenure_months);

        const result = await pool.query(
            `INSERT INTO loans (customer_id, account_id, loan_type, principal_amount, interest_rate,
             tenure_months, emi_amount, outstanding_balance, status, start_date, end_date)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9, $10) RETURNING *`,
            [customer_id, account_id || null, loan_type, principal_amount, interest_rate,
             tenure_months, emi, principal_amount, sDate, eDate.toISOString().split('T')[0]]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT update loan status (close or foreclose)
router.put('/:id', async (req, res) => {
    try {
        const { status } = req.body;
        const result = await pool.query(
            'UPDATE loans SET status=$1 WHERE id=$2 RETURNING *',
            [status, req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Loan not found' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
