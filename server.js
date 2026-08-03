const express = require('express');
const cors = require('cors');
const pool = require('./db/connection');
const { swaggerUi, swaggerSpec } = require('./swagger');
const testRoutes = require('./routes/test');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Routes
app.use('/api/customers',        require('./routes/customers'));
app.use('/api/accounts',         require('./routes/accounts'));
app.use('/api/loans',            require('./routes/loans'));
app.use('/api/loan-repayments',  require('./routes/loanRepayments'));
app.use('/api/credit-cards',     require('./routes/creditCards'));
app.use('/api/transactions',     require('./routes/transactions'));
app.use('/api/dashboard',        require('./routes/dashboard'));
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
