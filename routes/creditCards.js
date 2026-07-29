const express = require('express');
const router = express.Router();
const pool = require('../db/connection');

// GET all credit cards (pagination + filter)
router.get('/', async (req, res) => {
    try {
        const page      = parseInt(req.query.page)  || 1;
        const limit     = parseInt(req.query.limit) || 10;
        const offset    = (page - 1) * limit;
        const status    = req.query.status    || '';
        const cardType  = req.query.card_type || '';

        let conditions = [], params = [], p = 1;
        if (status)   { conditions.push(`cc.status = $${p++}`);    params.push(status); }
        if (cardType) { conditions.push(`cc.card_type = $${p++}`); params.push(cardType); }

        const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

        const data = await pool.query(
            `SELECT cc.*, c.name as customer_name, c.email as customer_email,
                    c.phone as customer_phone,
                    (cc.credit_limit - cc.outstanding_balance) as available_credit
             FROM credit_cards cc
             JOIN customers c ON cc.customer_id = c.id
             ${where}
             ORDER BY cc.issued_at DESC
             LIMIT $${p} OFFSET $${p + 1}`,
            [...params, limit, offset]
        );
        const count = await pool.query(
            `SELECT COUNT(*) FROM credit_cards cc ${where}`, params
        );
        res.json({ data: data.rows, total: parseInt(count.rows[0].count), page, limit });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST issue new credit card
router.post('/', async (req, res) => {
    try {
        const { customer_id, card_type, credit_limit } = req.body;
        if (!customer_id || !card_type || !credit_limit) {
            return res.status(400).json({ error: 'customer_id, card_type and credit_limit are required' });
        }

        // Verify customer exists
        const customer = await pool.query('SELECT * FROM customers WHERE id=$1', [customer_id]);
        if (customer.rows.length === 0) return res.status(404).json({ error: 'Customer not found' });

        // Generate card number
        const last4    = String(Math.floor(1000 + Math.random() * 9000));
        const fullNum  = '4' + String(Math.floor(100000000000000 + Math.random() * 900000000000000));
        const masked   = '**** **** **** ' + last4;

        // Due date 30 days from now
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30);

        const result = await pool.query(
            `INSERT INTO credit_cards
             (customer_id, card_number, card_number_masked, card_type, credit_limit,
              outstanding_balance, minimum_due, due_date, status)
             VALUES ($1, $2, $3, $4, $5, 0, 0, $6, 'active') RETURNING *`,
            [customer_id, fullNum, masked, card_type, credit_limit, dueDate.toISOString().split('T')[0]]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET single card with full details — for popup
router.get('/:id', async (req, res) => {
    try {
        const card = await pool.query(
            `SELECT cc.*, c.name as customer_name, c.email as customer_email,
                    c.phone as customer_phone, c.city as customer_city,
                    (cc.credit_limit - cc.outstanding_balance) as available_credit
             FROM credit_cards cc
             JOIN customers c ON cc.customer_id = c.id
             WHERE cc.id = $1`,
            [req.params.id]
        );
        if (card.rows.length === 0) return res.status(404).json({ error: 'Credit card not found' });

        const transactions = await pool.query(
            `SELECT * FROM credit_card_transactions
             WHERE card_id = $1
             ORDER BY created_at DESC`,
            [req.params.id]
        );

        // Payment summary
        const payments = transactions.rows.filter(t => t.transaction_type === 'payment' && t.status === 'success');
        const totalPaidThisMonth = payments
            .filter(t => new Date(t.created_at).getMonth() === new Date().getMonth())
            .reduce((sum, t) => sum + parseFloat(t.amount), 0);

        res.json({
            ...card.rows[0],
            transactions: transactions.rows,
            total_paid_this_month: parseFloat(totalPaidThisMonth.toFixed(2))
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST make a credit card payment
router.post('/:id/payment', async (req, res) => {
    try {
        const { amount, payment_type } = req.body;
        // payment_type: 'full' | 'minimum' | 'custom'

        const card = await pool.query('SELECT * FROM credit_cards WHERE id=$1', [req.params.id]);
        if (card.rows.length === 0) return res.status(404).json({ error: 'Card not found' });

        const c = card.rows[0];
        let payAmount = parseFloat(amount);

        if (payment_type === 'full')    payAmount = parseFloat(c.outstanding_balance);
        if (payment_type === 'minimum') payAmount = parseFloat(c.minimum_due);

        if (payAmount <= 0) return res.status(400).json({ error: 'Invalid payment amount' });

        const ref = 'REF' + Date.now();

        // Record transaction
        await pool.query(
            `INSERT INTO credit_card_transactions (card_id, customer_id, transaction_type, amount, status, reference_number)
             VALUES ($1, $2, 'payment', $3, 'success', $4)`,
            [req.params.id, c.customer_id, payAmount, ref]
        );

        // Update outstanding balance
        const newBalance = Math.max(0, parseFloat(c.outstanding_balance) - payAmount);
        const updated = await pool.query(
            `UPDATE credit_cards SET outstanding_balance=$1,
             minimum_due = GREATEST(0, minimum_due - $2)
             WHERE id=$3 RETURNING *`,
            [newBalance, payAmount, req.params.id]
        );

        res.json({ message: 'Payment successful', card: updated.rows[0], reference: ref });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT block/unblock card
router.put('/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const result = await pool.query(
            'UPDATE credit_cards SET status=$1 WHERE id=$2 RETURNING *',
            [status, req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Card not found' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
