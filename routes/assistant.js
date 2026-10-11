const express = require('express');
const router  = express.Router();
const { getStatus, flagKey } = require('../services/assistant/status');
const { chat, AssistantError } = require('../services/assistant/engine');
const store = require('../services/assistant/store');

/**
 * Admin check for changing feature flags.
 * - With the JWT auth layer (req.user set by requireAuth) this checks the real role.
 * - Without it, falls back to the client-declared role header. That is the same
 *   trust model as the rest of this branch's UI and is closed when the auth layer
 *   is merged. The env master switch and daily limit still cap the blast radius.
 */
function requireAdmin(req, res, next) {
    const role = req.user ? req.user.role : req.get('x-fincore-role');
    if (role !== 'admin') return res.status(403).json({ error: 'Admin role required' });
    next();
}

// GET /api/assistant/status — enabled? why not? today's usage
router.get('/status', async (req, res) => {
    try { res.json(await getStatus()); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/assistant/chat — { customerId, conversationId?, message }
router.post('/chat', async (req, res) => {
    try {
        const status = await getStatus();
        if (!status.enabled) {
            return res.status(503).json({ error: 'Assistant disabled', reason: status.reason });
        }
        const { customerId, conversationId, message } = req.body || {};
        res.json(await chat({ customerId, conversationId, message }));
    } catch (err) {
        if (err instanceof AssistantError) return res.status(err.status).json({ error: err.message, code: err.code });
        console.error('assistant chat error:', err);
        res.status(500).json({ error: 'Unexpected error' });
    }
});

// GET /api/assistant/flags, PUT /api/assistant/flags { enabled } (admin)
router.get('/flags', async (req, res) => {
    try { res.json(await store.listFlags()); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/flags', requireAdmin, async (req, res) => {
    const { enabled } = req.body || {};
    if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be true or false' });
    try {
        const who = (req.user && req.user.username) || req.get('x-fincore-user') || 'admin';
        await store.setFlag(flagKey(), enabled, who);
        res.json(await getStatus());
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
