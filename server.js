const express = require('express');
const cors = require('cors');
const pool = require('./db/connection');
const { swaggerUi, swaggerSpec } = require('./swagger');
const testRoutes = require('./routes/test');
const { requireAuth } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ── Public routes (no auth required) ──────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));

// ── Protected routes (JWT required) ───────────────────────────────────────────
app.use('/api/customers',        requireAuth, require('./routes/customers'));
app.use('/api/accounts',         requireAuth, require('./routes/accounts'));
app.use('/api/loans',            requireAuth, require('./routes/loans'));
app.use('/api/loan-repayments',  requireAuth, require('./routes/loanRepayments'));
app.use('/api/credit-cards',     requireAuth, require('./routes/creditCards'));
app.use('/api/transactions',     requireAuth, require('./routes/transactions'));
app.use('/api/dashboard',        requireAuth, require('./routes/dashboard'));
app.use('/api/test', testRoutes);

// Health check
app.get('/', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ message: 'FinCore Bank API is running!', database: 'Connected' });
    } catch (err) {
        res.json({ message: 'FinCore Bank API is running!', database: 'NOT connected', error: err.message });
    }
});

// Swagger UI 
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'FinCore Bank API Docs',
    customCss: `
        .topbar { background: linear-gradient(135deg, #26b2ad 0%, #005175 100%) !important; }
        .topbar-wrapper img { display: none; }
        .topbar-wrapper::before { content: 'FinCore Bank API'; color: white; font-size: 18px; font-weight: 700; }
    `,
}));

app.listen(PORT, () => {
    console.log(`FinCore Bank server running at http://localhost:${PORT}`);
});
