// FinCore Assistant — the only way the model can touch bank data.
//
// Security model: every tool is bound to the conversation's customer on the
// SERVER. The model never passes a customer id, so no prompt can make it read
// another customer's data — the query simply cannot return it.
//
// Actions that change data (block card, pay EMIs, foreclose) are two-step:
// a request_* tool records a pending action, and confirm_pending_action only
// runs in a LATER turn whose customer message is an explicit "yes".

const pool = require('../../db/connection');
const { buildSchedule, summarise } = require('../loans/schedule');
const { payEmi } = require('../loans/payEmi');

const AFFIRMATIVE = /^\s*(yes|yeah|yep|y|confirm(ed)?|go ahead|proceed|sure|ok(ay)?|please do|do it)\b/i;

const money = v => Number(Number(v).toFixed(2));
// Dates are returned as plain 'YYYY-MM-DD' strings (via to_char). Letting pg turn
// DATE columns into JS Dates shifts them by the server's UTC offset — in IST a
// due date of 5 Nov serialises as 2026-11-04T18:30:00Z and the model reads it as 4 Nov.

const CONFIRM_INSTRUCTION = 'Tell the customer exactly what will happen, then ask them to reply "yes" to confirm. Do not confirm on their behalf.';

// ── Tool definitions (JSON Schema, shared by all providers) ──────
const noInput = { type: 'object', properties: {}, additionalProperties: false };
const loanIdInput = (extra = {}, required = ['loan_id']) => ({
    type: 'object',
    properties: { loan_id: { type: 'integer', description: 'loan_id from list_loans' }, ...extra },
    required,
    additionalProperties: false,
});

const definitions = [
    {
        name: 'get_profile',
        description: "Get the customer's own profile: name, city and KYC status.",
        input_schema: noInput,
    },
    {
        name: 'list_accounts',
        description: "List the customer's bank accounts with account number, type, balance (INR) and status.",
        input_schema: noInput,
    },
    {
        name: 'get_recent_transactions',
        description: "Get the most recent transactions for one of the customer's accounts.",
        input_schema: {
            type: 'object',
            properties: {
                account_number: { type: 'string', description: 'Account number. Omit to use the first account.' },
                limit: { type: 'integer', minimum: 1, maximum: 10, description: 'How many transactions (default 5).' },
            },
            additionalProperties: false,
        },
    },
    {
        name: 'list_loans',
        description: "List the customer's loans: loan_id, type, principal, interest rate, EMI, outstanding balance, status, EMIs paid, missed (overdue) EMIs with total missed amount and oldest missed due date, and the next upcoming EMI due date.",
        input_schema: noInput,
    },
    {
        name: 'get_emi_history',
        description: 'List individual EMIs of one loan with EMI number, due date, amount, status (paid / overdue / pending) and paid date.',
        input_schema: loanIdInput({
            status: { type: 'string', enum: ['paid', 'missed', 'upcoming', 'all'], description: 'Filter (default all)' },
            limit: { type: 'integer', minimum: 1, maximum: 24, description: 'Max EMIs to return (default 12; most recent first for paid)' },
        }),
    },
    {
        name: 'list_credit_cards',
        description: "List the customer's credit cards (masked numbers only) with limit, outstanding, available credit, minimum due, due date and status.",
        input_schema: noInput,
    },
    {
        name: 'request_card_block',
        description: 'Step 1 of blocking a credit card. Records a pending block for the card ending in the given 4 digits. Does NOT block the card.',
        input_schema: {
            type: 'object',
            properties: { card_last4: { type: 'string', pattern: '^[0-9]{4}$' } },
            required: ['card_last4'],
            additionalProperties: false,
        },
    },
    {
        name: 'request_emi_payment',
        description: 'Step 1 of paying missed (overdue) EMIs of a loan from the linked account. Records a pending payment and returns the EMIs and total. Does NOT pay.',
        input_schema: loanIdInput({
            scope: { type: 'string', enum: ['oldest_missed', 'all_missed'], description: 'Pay only the oldest missed EMI, or all missed EMIs (default all_missed)' },
        }),
    },
    {
        name: 'request_loan_foreclosure',
        description: 'Step 1 of foreclosing (closing early) an active loan. Records a pending foreclosure and returns the outstanding balance. Does NOT foreclose.',
        input_schema: loanIdInput(),
    },
    {
        name: 'confirm_pending_action',
        description: 'Step 2 for any pending action (card block, EMI payment, loan foreclosure). Call ONLY after the customer explicitly said yes in their latest message.',
        input_schema: noInput,
    },
    {
        name: 'cancel_pending_action',
        description: 'Cancel the pending action when the customer says no or changes their mind.',
        input_schema: noInput,
    },
];

// ── Loan helpers ─────────────────────────────────────────────────
async function loadLoans(customerId, loanId = null) {
    const loans = await pool.query(
        `SELECT id, loan_type, principal_amount, interest_rate, tenure_months, emi_amount, outstanding_balance, status,
                to_char(start_date, 'YYYY-MM-DD') AS start_date, to_char(end_date, 'YYYY-MM-DD') AS end_date
           FROM loans WHERE customer_id = $1 ${loanId ? 'AND id = $2' : ''} ORDER BY id`,
        loanId ? [customerId, loanId] : [customerId]);
    if (!loans.rows.length) return [];
    const reps = await pool.query(
        `SELECT loan_id, emi_number, emi_amount, status,
                to_char(due_date, 'YYYY-MM-DD') AS due_date, to_char(paid_date, 'YYYY-MM-DD') AS paid_date
           FROM loan_repayments WHERE loan_id = ANY($1)`, [loans.rows.map(l => l.id)]);
    return loans.rows.map(l => {
        const open = l.status === 'active' || l.status === 'overdue';
        const schedule = open ? buildSchedule(l, reps.rows.filter(r => r.loan_id === l.id)) : [];
        return { loan: l, open, schedule };
    });
}

function loanNotFound(id) {
    return { error: `No loan with id ${id} for this customer` };
}

// ── Implementations ──────────────────────────────────────────────
const impl = {
    async get_profile(_, ctx) {
        const r = await pool.query('SELECT name, city, kyc_status FROM customers WHERE id = $1', [ctx.customerId]);
        return r.rows[0] || { error: 'Profile not found' };
    },

    async list_accounts(_, ctx) {
        const r = await pool.query(
            `SELECT account_number, account_type, balance, status
               FROM accounts WHERE customer_id = $1 ORDER BY id`, [ctx.customerId]);
        return { accounts: r.rows.map(a => ({ ...a, balance: money(a.balance) })) };
    },

    async get_recent_transactions(input, ctx) {
        const limit = Math.min(Math.max(parseInt(input.limit, 10) || 5, 1), 10);
        const acc = input.account_number
            ? await pool.query('SELECT id, account_number FROM accounts WHERE customer_id = $1 AND account_number = $2',
                [ctx.customerId, String(input.account_number).trim()])
            : await pool.query('SELECT id, account_number FROM accounts WHERE customer_id = $1 ORDER BY id LIMIT 1',
                [ctx.customerId]);
        // Same answer whether the account belongs to someone else or doesn't exist —
        // never confirm that another customer's account exists.
        if (!acc.rows.length) return { error: 'No such account for this customer' };
        const r = await pool.query(
            `SELECT to_char(created_at, 'YYYY-MM-DD') AS date, transaction_type, channel, amount, status, description, balance_after
               FROM transactions WHERE account_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
            [acc.rows[0].id, limit]);
        return {
            account_number: acc.rows[0].account_number,
            transactions: r.rows.map(t => ({ ...t, amount: money(t.amount), balance_after: money(t.balance_after) })),
        };
    },

    async list_loans(_, ctx) {
        const loans = await loadLoans(ctx.customerId);
        return {
            loans: loans.map(({ loan: l, open, schedule }) => ({
                loan_id: l.id,
                loan_type: l.loan_type,
                principal_amount: money(l.principal_amount),
                interest_rate: Number(l.interest_rate),
                tenure_months: l.tenure_months,
                emi_amount: money(l.emi_amount),
                outstanding_balance: money(l.outstanding_balance),
                status: l.status,
                end_date: l.end_date,
                ...(open ? summarise(schedule) : {}),
            })),
        };
    },

    async get_emi_history(input, ctx) {
        const [entry] = await loadLoans(ctx.customerId, Number(input.loan_id) || -1);
        if (!entry) return loanNotFound(input.loan_id);
        if (!entry.open) return { loan_id: entry.loan.id, status: entry.loan.status, note: 'This loan is no longer active, so no EMI schedule is shown.' };
        const limit = Math.min(Math.max(parseInt(input.limit, 10) || 12, 1), 24);
        const filter = input.status || 'all';
        let emis = entry.schedule;
        if (filter === 'paid') emis = emis.filter(e => e.status === 'paid').reverse();
        else if (filter === 'missed') emis = emis.filter(e => e.status === 'overdue').sort((a, b) => a.due_date.localeCompare(b.due_date));
        else if (filter === 'upcoming') emis = emis.filter(e => e.status === 'pending');
        else {
            // "all": the most recent paid/missed EMIs plus the next upcoming one
            const past = emis.filter(e => e.status !== 'pending');
            const next = emis.filter(e => e.status === 'pending').slice(0, 1);
            emis = past.slice(Math.max(0, past.length - (limit - next.length))).concat(next);
        }
        return {
            loan_id: entry.loan.id,
            loan_type: entry.loan.loan_type,
            filter,
            total_matching: emis.length,
            emis: emis.slice(0, limit).map(({ stored, ...e }) => e),
        };
    },

    async list_credit_cards(_, ctx) {
        const r = await pool.query(
            `SELECT card_number_masked, card_type, credit_limit, outstanding_balance, minimum_due,
                    to_char(due_date, 'YYYY-MM-DD') AS due_date, status
               FROM credit_cards WHERE customer_id = $1 ORDER BY id`, [ctx.customerId]);
        return {
            cards: r.rows.map(c => ({
                ...c,
                credit_limit: money(c.credit_limit),
                outstanding_balance: money(c.outstanding_balance),
                available_credit: money(c.credit_limit - c.outstanding_balance),
                minimum_due: money(c.minimum_due),
            })),
        };
    },

    async request_card_block(input, ctx) {
        const last4 = String(input.card_last4 || '').trim();
        if (!/^\d{4}$/.test(last4)) return { error: 'card_last4 must be exactly 4 digits' };
        const r = await pool.query(
            `SELECT id, card_number_masked, status FROM credit_cards
              WHERE customer_id = $1 AND RIGHT(card_number_masked, 4) = $2`, [ctx.customerId, last4]);
        if (!r.rows.length) return { error: 'No card ending in ' + last4 + ' for this customer' };
        const card = r.rows[0];
        if (card.status !== 'active') return { error: `Card ${card.card_number_masked} is already ${card.status}` };
        ctx.conversation.pending = {
            type: 'card_block', cardId: card.id, turn: ctx.conversation.turn,
            summary: `Block card ${card.card_number_masked}`,
        };
        return { confirmation_required: true, action: 'card_block', card: card.card_number_masked, instruction: CONFIRM_INSTRUCTION };
    },

    async request_emi_payment(input, ctx) {
        const [entry] = await loadLoans(ctx.customerId, Number(input.loan_id) || -1);
        if (!entry) return loanNotFound(input.loan_id);
        if (!entry.open) return { error: `This loan is ${entry.loan.status}, so there is nothing to pay` };
        const missed = entry.schedule.filter(e => e.status === 'overdue')
            .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.emi_number - b.emi_number);
        if (!missed.length) return { error: 'This loan has no missed EMIs' };
        const toPay = (input.scope === 'oldest_missed') ? missed.slice(0, 1) : missed;
        const total = money(toPay.reduce((s, e) => s + e.amount, 0));
        ctx.conversation.pending = {
            type: 'emi_payment', loanId: entry.loan.id, emiNumbers: toPay.map(e => e.emi_number), total,
            turn: ctx.conversation.turn,
            summary: `Pay ${toPay.length} missed EMI(s) on ${entry.loan.loan_type} loan, total ₹${total}`,
        };
        return {
            confirmation_required: true,
            action: 'emi_payment',
            loan_id: entry.loan.id,
            loan_type: entry.loan.loan_type,
            emis: toPay.map(({ emi_number, due_date, amount }) => ({ emi_number, due_date, amount })),
            total_amount: total,
            payment_channel: 'auto-debit from linked account',
            instruction: CONFIRM_INSTRUCTION,
        };
    },

    async request_loan_foreclosure(input, ctx) {
        const [entry] = await loadLoans(ctx.customerId, Number(input.loan_id) || -1);
        if (!entry) return loanNotFound(input.loan_id);
        if (!entry.open) return { error: `This loan is already ${entry.loan.status}` };
        const l = entry.loan;
        ctx.conversation.pending = {
            type: 'loan_foreclosure', loanId: l.id, turn: ctx.conversation.turn,
            summary: `Foreclose ${l.loan_type} loan (outstanding ₹${money(l.outstanding_balance)})`,
        };
        return {
            confirmation_required: true,
            action: 'loan_foreclosure',
            loan_id: l.id,
            loan_type: l.loan_type,
            outstanding_balance: money(l.outstanding_balance),
            note: 'Foreclosure closes the loan early in FinCore records. Any foreclosure charges are handled by the branch.',
            instruction: CONFIRM_INSTRUCTION,
        };
    },

    async confirm_pending_action(_, ctx) {
        const p = ctx.conversation.pending;
        if (!p) return { error: 'There is no pending action to confirm' };
        // Guard 1: confirmation must come in a LATER turn than the request.
        if (p.turn >= ctx.conversation.turn) return { error: 'Customer has not confirmed yet. Ask them first.' };
        // Guard 2: the customer's latest message must actually be a "yes".
        if (!AFFIRMATIVE.test(ctx.userMessage)) return { error: 'Latest customer message is not an explicit confirmation' };
        ctx.conversation.pending = null;

        if (p.type === 'card_block') {
            const r = await pool.query(
                `UPDATE credit_cards SET status = 'blocked'
                  WHERE id = $1 AND customer_id = $2 AND status = 'active' RETURNING card_number_masked`,
                [p.cardId, ctx.customerId]);
            if (!r.rows.length) return { error: 'Card could not be blocked (it may no longer be active)' };
            return { done: true, action: 'card_block', card: r.rows[0].card_number_masked };
        }

        if (p.type === 'emi_payment') {
            const own = await pool.query('SELECT id FROM loans WHERE id = $1 AND customer_id = $2', [p.loanId, ctx.customerId]);
            if (!own.rows.length) return loanNotFound(p.loanId);
            const paid = [];
            for (const n of p.emiNumbers) {
                const row = await payEmi({ loanId: p.loanId, emiNumber: n, paymentChannel: 'auto-debit' });
                paid.push({ emi_number: n, reference_number: row.reference_number });
            }
            return { done: true, action: 'emi_payment', loan_id: p.loanId, emis_paid: paid, total_amount: p.total };
        }

        if (p.type === 'loan_foreclosure') {
            const r = await pool.query(
                `UPDATE loans SET status = 'foreclosed'
                  WHERE id = $1 AND customer_id = $2 AND status IN ('active', 'overdue') RETURNING loan_type`,
                [p.loanId, ctx.customerId]);
            if (!r.rows.length) return { error: 'Loan could not be foreclosed (it may no longer be active)' };
            return { done: true, action: 'loan_foreclosure', loan_id: p.loanId, loan_type: r.rows[0].loan_type };
        }

        return { error: 'Unknown pending action' };
    },

    async cancel_pending_action(_, ctx) {
        const had = ctx.conversation.pending;
        ctx.conversation.pending = null;
        return { cancelled: Boolean(had), action: had ? had.type : null };
    },
};

async function runTool(name, input, ctx) {
    if (!impl[name]) return { error: `Unknown tool ${name}` };
    try {
        return await impl[name](input || {}, ctx);
    } catch (err) {
        console.error(`assistant tool ${name} failed:`, err.message);
        return { error: 'Internal error while fetching data' };
    }
}

module.exports = { definitions, runTool, AFFIRMATIVE };
