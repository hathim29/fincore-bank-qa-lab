// Deterministic eval fixtures for the FinCore Assistant LLM evals.
//
// The main seed (db/seed.js) is random, so evals use two fixed customers with
// known numbers. Every assertion in /evals/tests checks against these values.
//
// Dates are RELATIVE to today (so the suite never goes stale):
//   - home loan: EMIs 1–22 paid, EMI 23 missed (~20 days overdue), EMI 24 due in ~10 days
//   - credit card due in 20 days
// evals/assertions/fixtureDate.js uses fixtureDates() to check date answers.
//
// Run directly:  node evals/fixtures/evalCustomers.js
// Safe to re-run: it deletes and recreates only these two customers.

const pool = require('../../db/connection');
const { todayYMD, addMonths, buildSchedule, summarise } = require('../../services/loans/schedule');

function addDays(ymd, n) {
    const d = new Date(ymd + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

/** The fixture's key dates, computed from today. */
function fixtureDates(today = todayYMD()) {
    let nextEmi = addDays(today, 10);
    if (Number(nextEmi.slice(8)) > 28) nextEmi = nextEmi.slice(0, 8) + '28'; // keep month maths simple
    return {
        today,
        nextEmi,                              // EMI 24 — upcoming
        missedEmi: addMonths(nextEmi, -1),    // EMI 23 — overdue
        loanStart: addMonths(nextEmi, -24),
        cardDue: addDays(today, 20),
    };
}

const PAID_EMIS = 22;

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
        { type: 'deposit',    channel: 'NEFT',     amount: 50000.00, desc: 'Salary credit',    daysAgo: 9 },
        { type: 'withdrawal', channel: 'ATM',      amount: 2500.00,  desc: 'ATM withdrawal',   daysAgo: 6 },
        { type: 'transfer',   channel: 'UPI-GPay', amount: 1200.00,  desc: 'Electricity bill', daysAgo: 3 },
    ],
    loan: { type: 'home', principal: 2500000.00, rate: 8.50, tenure: 240, emi: 21696.00, outstanding: 2310000.00, status: 'active' },
    card: {
        full: '4111222233334321', masked: '**** **** **** 4321', type: 'Visa',
        limit: 100000.00, outstanding: 23500.00, minDue: 1175.00, status: 'active',
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
        limit: 300000.00, outstanding: 45000.00, minDue: 2250.00, status: 'active',
    },
};

const CUSTOMERS = [PRIMARY, OTHER];
const EMAILS = CUSTOMERS.map(c => c.email);

function daysAgoTs(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString();
}

async function resetEvalCustomers() {
    const dates = fixtureDates();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM customers WHERE email = ANY($1)', [EMAILS]);

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
                    [accountIds[0], custId, t.type, t.channel, t.amount, t.after, `EVAL${c.key.toUpperCase()}${i}`, t.desc, daysAgoTs(t.daysAgo)]);
            }

            if (c.loan) {
                const l = c.loan;
                const r = await client.query(
                    `INSERT INTO loans (customer_id, account_id, loan_type, principal_amount, interest_rate, tenure_months,
                                        emi_amount, outstanding_balance, status, start_date, end_date)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
                    [custId, accountIds[0], l.type, l.principal, l.rate, l.tenure, l.emi, l.outstanding, l.status,
                     dates.loanStart, addMonths(dates.loanStart, l.tenure)]);
                // EMIs 1–22 paid on time; 23 has no row (virtual → overdue); 24+ upcoming
                for (let n = 1; n <= PAID_EMIS; n++) {
                    const due = addMonths(dates.loanStart, n);
                    await client.query(
                        `INSERT INTO loan_repayments (loan_id, customer_id, emi_number, emi_amount, due_date, paid_date,
                                                      status, payment_channel, reference_number, days_delayed)
                         VALUES ($1,$2,$3,$4,$5,$5,'paid','auto-debit',$6,0)`,
                        [r.rows[0].id, custId, n, l.emi, due, `EVALEMI${n}`]);
                }
            }

            if (c.card) {
                const k = c.card;
                await client.query(
                    `INSERT INTO credit_cards (customer_id, card_number, card_number_masked, card_type, credit_limit,
                                               outstanding_balance, minimum_due, due_date, status)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
                    [custId, k.full, k.masked, k.type, k.limit, k.outstanding, k.minDue, dates.cardDue, k.status]);
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

/** Current state of the eval customers' card and loan — used by workflow evals. */
async function getState() {
    const cards = await pool.query(
        `SELECT RIGHT(cc.card_number_masked, 4) AS last4, cc.status FROM credit_cards cc
           JOIN customers c ON c.id = cc.customer_id WHERE c.email = ANY($1)`, [EMAILS]);
    const card = last4 => (cards.rows.find(r => r.last4 === last4) || {}).status || null;

    const loan = (await pool.query(
        `SELECT l.id, l.status, l.tenure_months, l.emi_amount, to_char(l.start_date, 'YYYY-MM-DD') AS start_date
           FROM loans l JOIN customers c ON c.id = l.customer_id WHERE c.email = $1`, [PRIMARY.email])).rows[0];
    let missedEmis = null;
    if (loan) {
        const reps = await pool.query(
            `SELECT emi_number, emi_amount, status, to_char(due_date, 'YYYY-MM-DD') AS due_date,
                    to_char(paid_date, 'YYYY-MM-DD') AS paid_date FROM loan_repayments WHERE loan_id = $1`, [loan.id]);
        missedEmis = summarise(buildSchedule(loan, reps.rows)).missed_emis;
    }
    return { cardStatus: card('4321'), otherCardStatus: card('8765'), loanStatus: loan ? loan.status : null, missedEmis };
}

module.exports = { PRIMARY, OTHER, PAID_EMIS, fixtureDates, resetEvalCustomers, getState };

if (require.main === module) {
    resetEvalCustomers()
        .then(ids => { console.log('✅ Eval customers ready:', ids, fixtureDates()); return pool.end(); })
        .catch(err => { console.error('❌', err.message); process.exit(1); });
}
