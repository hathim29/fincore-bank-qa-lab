const express = require('express');
const router = express.Router();
const pool = require('../db/connection');

// GET all transactions (pagination + filter)
router.get('/', async (req, res) => {
    try {
        const page      = parseInt(req.query.page)  || 1;
        const limit     = parseInt(req.query.limit) || 10;
        const offset    = (page - 1) * limit;
        const txnType   = req.query.transaction_type || '';
        const channel   = req.query.channel || '';
        const status    = req.query.status  || '';

        let conditions = [], params = [], p = 1;
        if (txnType) { conditions.push(`t.transaction_type = $${p++}`); params.push(txnType); }
        if (channel) { conditions.push(`t.channel = $${p++}`);         params.push(channel); }
        if (status)  { conditions.push(`t.status = $${p++}`);          params.push(status); }

        const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

        const data = await pool.query(
            `SELECT t.*,
                    c.name as customer_name, c.email as customer_email,
                    a.account_number, a.account_type
             FROM transactions t
             JOIN customers c ON t.customer_id = c.id
             JOIN accounts a ON t.account_id = a.id
             ${where}
             ORDER BY t.created_at DESC
             LIMIT $${p} OFFSET $${p + 1}`,
            [...params, limit, offset]
        );
        const count = await pool.query(
            `SELECT COUNT(*) FROM transactions t ${where}`, params
        );
        res.json({ data: data.rows, total: parseInt(count.rows[0].count), page, limit });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET single transaction with full customer + account history — for popup
router.get('/:id', async (req, res) => {
    try {
        const txn = await pool.query(
            `SELECT t.*,
                    c.name as customer_name, c.email as customer_email,
                    c.phone as customer_phone, c.city as customer_city, c.kyc_status,
                    a.account_number, a.account_type, a.balance as current_balance, a.status as account_status
             FROM transactions t
             JOIN customers c ON t.customer_id = c.id
             JOIN accounts a ON t.account_id = a.id
             WHERE t.id = $1`,
            [req.params.id]
        );
        if (txn.rows.length === 0) return res.status(404).json({ error: 'Transaction not found' });

        // Last 10 transactions for this account
        const history = await pool.query(
            `SELECT id, transaction_type, channel, amount, balance_after, status, created_at
             FROM transactions
             WHERE account_id = $1
             ORDER BY created_at DESC LIMIT 5`,
            [txn.rows[0].account_id]
        );

        res.json({ ...txn.rows[0], account_history: history.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST create new transaction (admin only)
router.post('/', async (req, res) => {
    try {
        const { account_id, transaction_type, channel, amount, description } = req.body;
        if (!account_id || !transaction_type || !channel || !amount) {
            return res.status(400).json({ error: 'account_id, transaction_type, channel and amount are required' });
        }

        // Get current balance
        const account = await pool.query('SELECT * FROM accounts WHERE id=$1', [account_id]);
        if (account.rows.length === 0) return res.status(404).json({ error: 'Account not found' });
        if (account.rows[0].status !== 'active') return res.status(400).json({ error: 'Account is not active' });

        let newBalance = parseFloat(account.rows[0].balance);
        if (transaction_type === 'deposit') {
            newBalance += parseFloat(amount);
        } else {
            if (newBalance < parseFloat(amount)) return res.status(400).json({ error: 'Insufficient funds' });
            newBalance -= parseFloat(amount);
        }

        const ref = 'REF' + Date.now();

        const result = await pool.query(
            `INSERT INTO transactions (account_id, customer_id, transaction_type, channel, amount, balance_after, status, reference_number, description)
             VALUES ($1, $2, $3, $4, $5, $6, 'success', $7, $8) RETURNING *`,
            [account_id, account.rows[0].customer_id, transaction_type, channel, amount, newBalance.toFixed(2), ref, description || '']
        );

        // Update account balance
        await pool.query('UPDATE accounts SET balance=$1 WHERE id=$2', [newBalance.toFixed(2), account_id]);

        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;