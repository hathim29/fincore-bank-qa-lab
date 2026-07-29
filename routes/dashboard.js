const express = require('express');
const router = express.Router();
const pool = require('../db/connection');

// GET dashboard summary stats
router.get('/stats', async (req, res) => {
    try {
        const [
            customers, accounts, loans, cards,
            txnToday, overdueLoans, cardsDue
        ] = await Promise.all([
            pool.query('SELECT COUNT(*) FROM customers'),
            pool.query('SELECT COUNT(*) FROM accounts WHERE status = $1', ['active']),
            pool.query(`SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status='active') as active,
                COUNT(*) FILTER (WHERE status='overdue') as overdue
                FROM loans`),
            pool.query('SELECT COUNT(*) FROM credit_cards WHERE status=$1', ['active']),
            pool.query(`SELECT COUNT(*), COALESCE(SUM(amount),0) as total_amount
                FROM transactions
                WHERE created_at >= CURRENT_DATE`),
            pool.query(`SELECT COUNT(*) FROM loans WHERE status='overdue'`),
            pool.query(`SELECT COUNT(*) FROM credit_cards
                WHERE due_date <= CURRENT_DATE + INTERVAL '5 days'
                AND outstanding_balance > 0 AND status='active'`)
        ]);

        res.json({
            total_customers:      parseInt(customers.rows[0].count),
            active_accounts:      parseInt(accounts.rows[0].count),
            total_loans:          parseInt(loans.rows[0].total),
            active_loans:         parseInt(loans.rows[0].active),
            overdue_loans:        parseInt(loans.rows[0].overdue),
            active_cards:         parseInt(cards.rows[0].count),
            transactions_today:   parseInt(txnToday.rows[0].count),
            txn_amount_today:     parseFloat(txnToday.rows[0].total_amount),
            cards_due_soon:       parseInt(cardsDue.rows[0].count)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET recent transactions for dashboard widget
router.get('/recent-transactions', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT t.id, t.transaction_type, t.channel, t.amount,
                    t.status, t.created_at,
                    c.name as customer_name,
                    a.account_number
             FROM transactions t
             JOIN customers c ON t.customer_id = c.id
             JOIN accounts a ON t.account_id = a.id
             ORDER BY t.created_at DESC LIMIT 8`
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET alerts — overdue loans and cards due soon
router.get('/alerts', async (req, res) => {
    try {
        const overdueLoans = await pool.query(
            `SELECT l.id, l.loan_type, l.outstanding_balance,
                    c.name as customer_name
             FROM loans l
             JOIN customers c ON l.customer_id = c.id
             WHERE l.status = 'overdue'
             LIMIT 5`
        );
        const cardsDue = await pool.query(
            `SELECT cc.id, cc.card_number_masked, cc.card_type,
                    cc.minimum_due, cc.due_date,
                    c.name as customer_name,
                    (cc.due_date - CURRENT_DATE) as days_remaining
             FROM credit_cards cc
             JOIN customers c ON cc.customer_id = c.id
             WHERE cc.due_date <= CURRENT_DATE + INTERVAL '5 days'
             AND cc.outstanding_balance > 0 AND cc.status = 'active'
             ORDER BY cc.due_date ASC LIMIT 5`
        );
        res.json({
            overdue_loans: overdueLoans.rows,
            cards_due_soon: cardsDue.rows
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
