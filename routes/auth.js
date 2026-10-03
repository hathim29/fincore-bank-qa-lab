// FinCore Bank — Auth Routes
// POST /api/auth/login       → validate credentials, return JWT
// POST /api/auth/otp/send    → generate + store OTP (simulated)
// POST /api/auth/otp/verify  → verify OTP, return final JWT
// GET  /api/auth/me          → return current user info

const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const pool    = require('../db/connection');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');

// In-memory OTP store: { username: { otp, expiresAt, userData } }
const otpStore = new Map();

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
// Step 1: validate username + password, return a short-lived pre-auth token
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }

    try {
        const result = await pool.query(
            'SELECT id, username, password, role FROM users WHERE username = $1',
            [username.trim()]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid username or password.' });
        }

        const user = result.rows[0];

        // Support both plain-text (legacy) and bcrypt passwords
        let passwordMatch = false;
        if (user.password.startsWith('$2')) {
            passwordMatch = await bcrypt.compare(password, user.password);
        } else {
            passwordMatch = (password === user.password);
        }

        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid username or password.' });
        }

        // Generate and store OTP (6 digits, valid for 5 minutes)
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = Date.now() + 5 * 60 * 1000; // 5 min

        otpStore.set(username.trim(), {
            otp,
            expiresAt,
            userData: { id: user.id, username: user.username, role: user.role }
        });

        // In a real system this would be sent via SMS/email
        // For the lab we return it in the response (visible in Network tab — intentional test surface)
        console.log(`[OTP] ${username}: ${otp} (expires in 5 min)`);

        res.json({
            message: 'Credentials verified. OTP sent.',
            // Returning OTP in response is intentional for QA lab testing
            otp_preview: otp,
            expires_in: 300
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/auth/otp/send ──────────────────────────────────────────────────
// Resend OTP for an already-validated username
router.post('/otp/send', async (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required.' });

    const stored = otpStore.get(username);
    if (!stored) {
        return res.status(401).json({ error: 'Please complete login step first.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    stored.otp = otp;
    stored.expiresAt = Date.now() + 5 * 60 * 1000;
    otpStore.set(username, stored);

    console.log(`[OTP RESEND] ${username}: ${otp}`);

    res.json({
        message: 'OTP resent.',
        otp_preview: otp,
        expires_in: 300
    });
});

// ─── POST /api/auth/otp/verify ────────────────────────────────────────────────
// Step 2: verify OTP, return full JWT
router.post('/otp/verify', (req, res) => {
    const { username, otp } = req.body;

    if (!username || !otp) {
        return res.status(400).json({ error: 'Username and OTP are required.' });
    }

    const stored = otpStore.get(username);

    if (!stored) {
        return res.status(401).json({ error: 'No pending OTP for this user.' });
    }

    if (Date.now() > stored.expiresAt) {
        otpStore.delete(username);
        return res.status(401).json({ error: 'OTP has expired. Please login again.' });
    }

    if (otp.trim() !== stored.otp) {
        return res.status(401).json({ error: 'Invalid OTP.' });
    }

    // OTP valid — issue full JWT (8 hour session)
    otpStore.delete(username);
    const token = jwt.sign(stored.userData, JWT_SECRET, { expiresIn: '8h' });

    res.json({
        message: 'Login successful.',
        token,
        user: stored.userData
    });
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
    res.json({ user: req.user });
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
    // JWT is stateless; client clears the token
    res.json({ message: 'Logged out successfully.' });
});

module.exports = router;
