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

// GET /api/loans/credit-score/:customerId
// Calculates a credit score for a customer based on loan + CC repayment history
// Used by the New Loan modal to decide if the Create button should be enabled
router.get('/credit-score/:customerId', async (req, res) => {
    const customerId = parseInt(req.params.customerId);
    if (!customerId || isNaN(customerId)) {
        return res.status(400).json({ error: 'Invalid customer ID.' });
    }

    try {
        // 1. Check customer exists
        const custCheck = await pool.query('SELECT id, name FROM customers WHERE id = $1', [customerId]);
        if (custCheck.rows.length === 0) {
            return res.status(404).json({ error: `Customer #${customerId} not found.` });
        }
        const customerName = custCheck.rows[0].name;

        // 2. Loan repayment history
        const loanData = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE lr.status = 'paid' AND lr.days_delayed = 0)   AS on_time,
                COUNT(*) FILTER (WHERE lr.status = 'paid' AND lr.days_delayed > 0)   AS delayed,
                COUNT(*) FILTER (WHERE lr.status = 'overdue')                         AS missed,
                COUNT(*) FILTER (WHERE l.status IN ('overdue', 'foreclosed'))         AS bad_loans,
                COUNT(DISTINCT l.id)                                                  AS total_loans
            FROM loans l
            LEFT JOIN loan_repayments lr ON lr.loan_id = l.id
            WHERE l.customer_id = $1
        `, [customerId]);

        // 3. Credit card history
        const ccData = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE cc.status = 'blocked')        AS blocked_cards,
                COUNT(*) FILTER (WHERE cc.outstanding_balance > 0
                    AND cc.due_date < CURRENT_DATE)                   AS overdue_cards,
                COUNT(DISTINCT cc.id)                                 AS total_cards
            FROM credit_cards cc
            WHERE cc.customer_id = $1
        `, [customerId]);

        const loan = loanData.rows[0];
        const cc   = ccData.rows[0];

        const onTime     = parseInt(loan.on_time)    || 0;
        const delayed    = parseInt(loan.delayed)    || 0;
        const missed     = parseInt(loan.missed)     || 0;
        const badLoans   = parseInt(loan.bad_loans)  || 0;
        const totalLoans = parseInt(loan.total_loans)|| 0;

        const blockedCards = parseInt(cc.blocked_cards) || 0;
        const overdueCards = parseInt(cc.overdue_cards) || 0;
        const totalCards   = parseInt(cc.total_cards)   || 0;

        const hasLoanDefaults = badLoans > 0 || missed > 0;
        const hasCCDefaults   = blockedCards > 0 || overdueCards > 0;
        const hasLoans        = totalLoans > 0;
        const hasCards        = totalCards > 0;

        // ── Scoring logic ──────────────────────────────────────────────────────
        let score, scenario, breakdown;

        if (!hasLoans && !hasCards) {
            // Thin file — no credit history
            score    = 650;
            scenario = 'thin_file';
            breakdown = 'No loan or credit card history. Thin file — neutral score assigned.';

        } else if (!hasLoans && hasCards && !hasCCDefaults) {
            // Only CC, clean
            score    = Math.min(780, 700 + (totalCards * 10));
            scenario = 'cc_only_clean';
            breakdown = `${totalCards} credit card(s), no defaults. Good standing.`;

        } else if (!hasLoans && hasCards && hasCCDefaults) {
            // Only CC, with defaults
            score    = Math.max(480, 580 - (blockedCards * 30) - (overdueCards * 20));
            scenario = 'cc_only_defaults';
            breakdown = `${blockedCards} blocked card(s), ${overdueCards} overdue card(s). Poor CC history.`;

        } else if (hasLoans && !hasCCDefaults && !hasLoanDefaults) {
            // Loans exist, all clean
            const onTimeRatio = totalLoans > 0 ? onTime / (onTime + delayed + missed || 1) : 1;
            score    = Math.min(850, Math.round(680 + (onTimeRatio * 150) - (delayed * 5)));
            scenario = 'loans_clean';
            breakdown = `${onTime} on-time, ${delayed} delayed, ${missed} missed repayments. Clean loan history.`;

        } else if (hasLoanDefaults && !hasCCDefaults) {
            // Loan defaults, no CC issues
            score    = Math.max(400, 560 - (missed * 15) - (badLoans * 25));
            scenario = 'loan_defaults_only';
            breakdown = `${badLoans} bad loan(s), ${missed} missed repayment(s). Loan defaults detected.`;

        } else if (!hasLoanDefaults && hasCCDefaults) {
            // CC defaults, loans clean
            score    = Math.max(450, 580 - (blockedCards * 30) - (overdueCards * 15));
            scenario = 'cc_defaults_only';
            breakdown = `${blockedCards} blocked card(s), ${overdueCards} overdue payment(s). CC defaults detected.`;

        } else {
            // Both loan AND CC defaults
            score    = Math.max(300, 480 - (missed * 15) - (badLoans * 20) - (blockedCards * 25) - (overdueCards * 10));
            scenario = 'both_defaults';
            breakdown = `Loan defaults: ${badLoans} bad loan(s), ${missed} missed. CC defaults: ${blockedCards} blocked, ${overdueCards} overdue. High risk.`;
        }

        // ── Rating bands ───────────────────────────────────────────────────────
        let rating, eligible, color;
        if (score >= 750) {
            rating = 'Excellent'; eligible = true;  color = '#16a34a';
        } else if (score >= 650) {
            rating = 'Good';      eligible = true;  color = '#65a30d';
        } else if (score >= 580) {
            rating = 'Fair';      eligible = true;  color = '#d97706';
        } else if (score >= 500) {
            rating = 'Poor';      eligible = false; color = '#dc2626';
        } else {
            rating = 'Very Poor'; eligible = false; color = '#991b1b';
        }

        res.json({
            customer_id:   customerId,
            customer_name: customerName,
            score,
            rating,
            eligible,
            color,
            scenario,
            breakdown,
            details: { onTime, delayed, missed, badLoans, totalLoans, blockedCards, overdueCards, totalCards }
        });

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
