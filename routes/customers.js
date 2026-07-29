const express = require('express');
const router = express.Router();
const pool = require('../db/connection');

// GET all customers (pagination + search)
router.get('/', async (req, res) => {
    try {
        const page   = parseInt(req.query.page)  || 1;
        const limit  = parseInt(req.query.limit) || 10;
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        const data = await pool.query(
            `SELECT * FROM customers
             WHERE name ILIKE $1 OR email ILIKE $1 OR city ILIKE $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
            [`%${search}%`, limit, offset]
        );
        const count = await pool.query(
            `SELECT COUNT(*) FROM customers
             WHERE name ILIKE $1 OR email ILIKE $1 OR city ILIKE $1`,
            [`%${search}%`]
        );
        res.json({ data: data.rows, total: parseInt(count.rows[0].count), page, limit });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET single customer with accounts summary
router.get('/:id', async (req, res) => {
    try {
        const customer = await pool.query(
            'SELECT * FROM customers WHERE id = $1',
            [req.params.id]
        );
        if (customer.rows.length === 0) return res.status(404).json({ error: 'Customer not found' });

        const accounts = await pool.query(
            'SELECT * FROM accounts WHERE customer_id = $1 ORDER BY opened_at DESC',
            [req.params.id]
        );
        const loans = await pool.query(
            'SELECT id, loan_type, principal_amount, status FROM loans WHERE customer_id = $1',
            [req.params.id]
        );
        const cards = await pool.query(
            'SELECT id, card_number_masked, card_type, status FROM credit_cards WHERE customer_id = $1',
            [req.params.id]
        );

        res.json({
            ...customer.rows[0],
            accounts: accounts.rows,
            loans: loans.rows,
            credit_cards: cards.rows
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST create new customer
router.post('/', async (req, res) => {
    try {
        const { name, email, phone, city, kyc_status } = req.body;
        if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });

        const result = await pool.query(
            `INSERT INTO customers (name, email, phone, city, kyc_status)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [name, email, phone, city, kyc_status || 'pending']
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ error: 'Email already exists' });
        res.status(500).json({ error: err.message });
    }
});

// PUT update customer
router.put('/:id', async (req, res) => {
    try {
        const { name, email, phone, city, kyc_status } = req.body;
        const result = await pool.query(
            `UPDATE customers SET name=$1, email=$2, phone=$3, city=$4, kyc_status=$5
             WHERE id=$6 RETURNING *`,
            [name, email, phone, city, kyc_status, req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE customer
router.delete('/:id', async (req, res) => {
    try {
        const result = await pool.query(
            'DELETE FROM customers WHERE id=$1 RETURNING *',
            [req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
        res.json({ message: 'Customer deleted', customer: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
