const express = require('express');
const router  = express.Router();
const pool    = require('../db/connection');
const { exec } = require('child_process');
const path = require('path');

/**
 * Test Utility Routes
 * Only available when NODE_ENV !== 'production'
 */

const guard = (req, res, next) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ error: 'Test utilities are not available in production' });
    }
    next();
};

const seedPath = path.join(__dirname, '..', 'db', 'seed.js');

// POST /api/test/reset — truncate then seed in background
router.post('/reset', guard, async (req, res) => {
    try {
        // Truncate immediately
        await pool.query(`
            TRUNCATE TABLE
                credit_card_transactions,
                account_audit_log,
                loan_repayments,
                loan_score,
                transactions,
                credit_cards,
                loans,
                accounts,
                customers
            RESTART IDENTITY CASCADE
        `);

        // Respond immediately — seed runs in background
        res.json({
            message: 'Database cleared. Seeding in background — check dashboard in ~60 seconds.',
            timestamp: new Date().toISOString(),
            note: 'Tables truncated. Seed running async — call GET /api/test/status to monitor.'
        });

        // Seed in background after response sent
        exec(`node "${seedPath}"`, (err) => {
            if (err) console.error('❌ Background seed failed:', err.message);
            else console.log('✅ Background seed completed');
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/test/seed — seed without clearing
router.post('/seed', guard, (req, res) => {
    res.json({
        message: 'Seeding in background — check dashboard in ~60 seconds.',
        timestamp: new Date().toISOString()
    });

    exec(`node "${seedPath}"`, (err) => {
        if (err) console.error('❌ Seed failed:', err.message);
        else console.log('✅ Seed completed');
    });
});

// GET /api/test/status
router.get('/status', (req, res) => {
    res.json({
        available:   process.env.NODE_ENV !== 'production',
        environment: process.env.NODE_ENV || 'development',
        endpoints: [
            'POST /api/test/reset — truncate all tables + async reseed (~2s response, ~60s to complete)',
            'POST /api/test/seed  — async seed without clearing',
            'GET  /api/test/status — check availability',
        ]
    });
});

module.exports = router;
