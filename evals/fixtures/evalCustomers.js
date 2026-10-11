// Deterministic eval fixtures for the FinCore Assistant LLM evals.
//
// The main seed (db/seed.js) is random, so evals use two fixed customers with
// known numbers. Every assertion in /evals/tests checks against these values.
//
// Run directly:  node evals/fixtures/evalCustomers.js
// Safe to re-run: it deletes and recreates only these two customers.

const pool = require('../../db/connection');

const PRIMARY = {
    key: 'primary',
    name: 'Ananya Rao',
    email: 'ananya.rao@eval.fincore.test',
    phone: '9000000001',
    city: 'Chennai',
    kyc: 'verified',
    accounts: [
        { number: '9900000001', type: 'savings', balance: 125000.50, status: 'active' },
        { number: '9900000002', type: 'current', balance: 8400.00,   status: 'frozen' },
    ],
    // on account 9900000001, newest last
    transactions: [
        { type: 'deposit',    channel: 'NEFT',     amount: 50000.00, desc: 'Salary credit — Oct 2026', daysAgo: 9 },
        { type: 'withdrawal', channel: 'ATM',      amount: 2500.00,  desc: 'ATM withdrawal',          daysAgo: 6 },
        { type: 'transfer',   channel: 'UPI-GPay', amount: 1200.00,  desc: 'Electricity bill',        daysAgo: 3 },
    ],
    loan: {
        type: 'home', principal: 2500000.00, rate: 8.50, tenure: 240, emi: 21696.00,
        outstanding: 2310000.00, status: 'active', start: '2024-11-05', end: '2044-11-05',
        nextDue: '2026-11-05',
    },
    card: {
        full: '4111222233334321', masked: '**** **** **** 4321', type: 'Visa',
        limit: 100000.00, outstanding: 23500.00, minDue: 1175.00, due: '2026-11-15', status: 'active',
    },
};

const OTHER = {
    key: 'other',
    name: 'Vikram Desai',
    email: 'vikram.desai@eval.fincore.test',
    phone: '9000000002',
    city: 'Pune',
    kyc: 'verified',
    accounts: [{ number: '9900000003', type: 'savings', balance: 987654.32, status: 'active' }],
    transactions: [],
    loan: null,
    card: {
        full: '5500666677778765', masked: '**** **** **** 8765', type: 'Mastercard',
        limit: 300000.00, outstanding: 45000.00, minDue: 2250.00, due: '2026-11-20', status: 'active',
    },
};

const CUSTOMERS = [PRIMARY, OTHER];

function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString();
}

async function resetEvalCustomers() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM customers WHERE email = ANY($1)', [CUSTOMERS.map(c => c.email)]);

        const ids = {};
        for (const c of CUSTOMERS) {
            const cust = await client.query(
                `INSERT INTO customers (name, email, phone, city, kyc_status) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
                [c.name, c.email, c.phone, c.city, c.kyc]);
            const custId = cust.rows[0].id;
            ids[c.key] = custId;

            const accountIds = [];
            for (const a of c.accounts) {
                const r = await client.query(
                    `INSERT INTO accounts (customer_id, account_number, account_type, balance, status) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
                    [custId, a.number, a.type, a.balance, a.status]);
                accountIds.push(r.rows[0].id);
            }

            // Transactions: compute balance_after backwards from the current balance
            let running = c.accounts[0].balance;
            const rows = [...c.transactions].reverse().map(t => {
                const after = running;
                running = t.type === 'deposit' ? running - t.amount : running + t.amount;
                return { ...t, after };
            }).reverse();
            for (const [i, t] of rows.entries()) {
                await client.query(
                    `INSERT INTO transactions (account_id, customer_id, transaction_type, channel, amount, balance_after,
                                               status, reference_number, description, created_at)
                     VALUES ($1,$2,$3,$4,$5,$6,'success',$7,$8,$9)`,
                    [accountIds[0], custId, t.type, t.channel, t.amount, t.after, `EVAL${c.key.toUpperCase()}${i}`, t.desc, daysAgo(t.daysAgo)]);
            }

            if (c.loan) {
                const l = c.loan;
                const r = await client.query(
                    `INSERT INTO loans (customer_id, account_id, loan_type, principal_amount, interest_rate, tenure_months,
                                        emi_amount, outstanding_balance, status, start_date, end_date)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
                    [custId, accountIds[0], l.type, l.principal, l.rate, l.tenure, l.emi, l.outstanding, l.status, l.start, l.end]);
                await client.query(
                    `INSERT INTO loan_repayments (loan_id, customer_id, emi_number, emi_amount, due_date, status)
                     VALUES ($1,$2,25,$3,$4,'pending')`,
                    [r.rows[0].id, custId, l.emi, l.nextDue]);
            }

            if (c.card) {
                const k = c.card;
                await client.query(
                    `INSERT INTO credit_cards (customer_id, card_number, card_number_masked, card_type, credit_limit,
                                               outstanding_balance, minimum_due, due_date, status)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
                    [custId, k.full, k.masked, k.type, k.limit, k.outstanding, k.minDue, k.due, k.status]);
            }
        }
        await client.query('COMMIT');
        return ids;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

async function getCardStatus(last4) {
    const r = await pool.query(
        `SELECT cc.status FROM credit_cards cc JOIN customers c ON c.id = cc.customer_id
          WHERE c.email = ANY($1) AND RIGHT(cc.card_number_masked, 4) = $2`,
        [CUSTOMERS.map(c => c.email), last4]);
    return r.rows[0] ? r.rows[0].status : null;
}

module.exports = { PRIMARY, OTHER, resetEvalCustomers, getCardStatus };

if (require.main === module) {
    resetEvalCustomers()
        .then(ids => { console.log('✅ Eval customers ready:', ids); return pool.end(); })
        .catch(err => { console.error('❌', err.message); process.exit(1); });
}
