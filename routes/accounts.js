const express = require('express');
const router = express.Router();
const pool = require('../db/connection');

// GET all accounts (pagination + filter by type/status)
router.get('/', async (req, res) => {
    try {
        const page        = parseInt(req.query.page)  || 1;
        const limit       = parseInt(req.query.limit) || 10;
        const offset      = (page - 1) * limit;
        const accountType = req.query.account_type || '';
        const status      = req.query.status || '';

        let conditions = [], params = [], p = 1;
        if (accountType) { conditions.push(`a.account_type = $${p++}`); params.push(accountType); }
        if (status)       { conditions.push(`a.status = $${p++}`);       params.push(status); }

        const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

        const data = await pool.query(
            `SELECT a.*, c.name as customer_name, c.email as customer_email, c.kyc_status
             FROM accounts a
             JOIN customers c ON a.customer_id = c.id
             ${where}
             ORDER BY a.opened_at DESC
             LIMIT $${p} OFFSET $${p + 1}`,
            [...params, limit, offset]
        );
        const count = await pool.query(
            `SELECT COUNT(*) FROM accounts a ${where}`, params
        );
        res.json({ data: data.rows, total: parseInt(count.rows[0].count), page, limit });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET audit log for an account — must be BEFORE /:id route
router.get('/:id/audit', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM account_audit_log
             WHERE account_id = $1
             ORDER BY performed_at DESC`,
            [req.params.id]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET single account with last 10 transactions
router.get('/:id', async (req, res) => {
    try {
        const account = await pool.query(
            `SELECT a.*, c.name as customer_name, c.email as customer_email,
                    c.phone as customer_phone, c.city as customer_city, c.kyc_status
             FROM accounts a
             JOIN customers c ON a.customer_id = c.id
             WHERE a.id = $1`,
            [req.params.id]
        );
        if (account.rows.length === 0) return res.status(404).json({ error: 'Account not found' });

        const transactions = await pool.query(
            `SELECT * FROM transactions
             WHERE account_id = $1
             ORDER BY created_at DESC LIMIT 10`,
            [req.params.id]
        );
        res.json({ ...account.rows[0], recent_transactions: transactions.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST create new account
router.post('/', async (req, res) => {
    try {
        const { customer_id, account_type, balance } = req.body;
        if (!customer_id || !account_type) {
            return res.status(400).json({ error: 'customer_id and account_type are required' });
        }
        const accNum = String(Math.floor(1000000000 + Math.random() * 9000000000));
        const result = await pool.query(
            `INSERT INTO accounts (customer_id, account_number, account_type, balance)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [customer_id, accNum, account_type, balance || 0]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT update account status — with audit log
router.put('/:id', async (req, res) => {
    try {
        const { status, reason, performed_by } = req.body;

        const current = await pool.query(
            'SELECT * FROM accounts WHERE id=$1', [req.params.id]
        );
        if (current.rows.length === 0) return res.status(404).json({ error: 'Account not found' });

        const account = current.rows[0];

        const result = await pool.query(
            'UPDATE accounts SET status=$1 WHERE id=$2 RETURNING *',
            [status, req.params.id]
        );

        await pool.query(
            `INSERT INTO account_audit_log
             (account_id, account_number, customer_id, action, previous_status, reason, performed_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [req.params.id, account.account_number, account.customer_id,
             status, account.status, reason || null, performed_by || 'system']
        );

        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;