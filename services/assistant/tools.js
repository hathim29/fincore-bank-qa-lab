// FinCore Assistant — the only way the model can touch bank data.
//
// Security model: every tool is bound to the conversation's customer on the
// SERVER. The model never passes a customer id, so no prompt can make it read
// another customer's data — the query simply cannot return it.

const pool = require('../../db/connection');

const AFFIRMATIVE = /^\s*(yes|yeah|yep|y|confirm(ed)?|go ahead|proceed|sure|ok(ay)?|please do|do it)\b/i;

const money = v => Number(Number(v).toFixed(2));
// Dates are returned as plain 'YYYY-MM-DD' strings (via to_char). Letting pg turn
// DATE columns into JS Dates shifts them by the server's UTC offset — in IST a
// due date of 5 Nov serialises as 2026-11-04T18:30:00Z and the model reads it as 4 Nov.

// ── Tool definitions (JSON Schema, shared by all providers) ──────
const definitions = [
    {
        name: 'get_profile',
        description: "Get the customer's own profile: name, city and KYC status.",
        input_schema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
        name: 'list_accounts',
        description: "List the customer's bank accounts with account number, type, balance (INR) and status.",
        input_schema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
        name: 'get_recent_transactions',
        description: 'Get the most recent transactions for one of the customer\'s accounts.',
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
        description: "List the customer's loans with type, principal, interest rate, EMI, outstanding balance, status and next EMI due date.",
        input_schema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
        name: 'list_credit_cards',
        description: "List the customer's credit cards (masked numbers only) with limit, outstanding, available credit, minimum due, due date and status.",
        input_schema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
        name: 'request_card_block',
        description: 'Step 1 of blocking a credit card. Records a pending block request for the card ending in the given 4 digits. Does NOT block the card. You must then ask the customer to explicitly confirm.',
        input_schema: {
            type: 'object',
            properties: { card_last4: { type: 'string', pattern: '^[0-9]{4}$' } },
            required: ['card_last4'],
            additionalProperties: false,
        },
    },
    {
        name: 'confirm_card_block',
        description: 'Step 2 of blocking a credit card. Call ONLY after the customer has explicitly said yes to the pending block request in their latest message.',
        input_schema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
        name: 'cancel_pending_action',
        description: 'Cancel a pending card block request when the customer says no or changes their mind.',
        input_schema: { type: 'object', properties: {}, additionalProperties: false },
    },
];

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
        const r = await pool.query(
            `SELECT l.id, l.loan_type, l.principal_amount, l.interest_rate, l.tenure_months, l.emi_amount,
                    l.outstanding_balance, l.status, to_char(l.end_date, 'YYYY-MM-DD') AS end_date,
                    (SELECT to_char(MIN(due_date), 'YYYY-MM-DD') FROM loan_repayments lr
                      WHERE lr.loan_id = l.id AND lr.status <> 'paid') AS next_emi_due
               FROM loans l WHERE l.customer_id = $1 ORDER BY l.id`, [ctx.customerId]);
        return {
            loans: r.rows.map(({ id, ...l }) => ({
                ...l,
                principal_amount: money(l.principal_amount),
                interest_rate: Number(l.interest_rate),
                emi_amount: money(l.emi_amount),
                outstanding_balance: money(l.outstanding_balance),
            })),
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
        ctx.conversation.pending = { type: 'card_block', cardId: card.id, masked: card.card_number_masked, turn: ctx.conversation.turn };
        return { confirmation_required: true, card: card.card_number_masked,
                 instruction: 'Ask the customer to reply "yes" to confirm. Do not confirm on their behalf.' };
    },

    async confirm_card_block(_, ctx) {
        const p = ctx.conversation.pending;
        if (!p || p.type !== 'card_block') return { error: 'There is no pending card block request' };
        // Guard 1: confirmation must come in a LATER turn than the request.
        if (p.turn >= ctx.conversation.turn) return { error: 'Customer has not confirmed yet. Ask them first.' };
        // Guard 2: the customer's latest message must actually be a "yes".
        if (!AFFIRMATIVE.test(ctx.userMessage)) return { error: 'Latest customer message is not an explicit confirmation' };
        const r = await pool.query(
            `UPDATE credit_cards SET status = 'blocked'
              WHERE id = $1 AND customer_id = $2 AND status = 'active' RETURNING card_number_masked`,
            [p.cardId, ctx.customerId]);
        ctx.conversation.pending = null;
        if (!r.rows.length) return { error: 'Card could not be blocked (it may no longer be active)' };
        return { blocked: true, card: r.rows[0].card_number_masked };
    },

    async cancel_pending_action(_, ctx) {
        const had = Boolean(ctx.conversation.pending);
        ctx.conversation.pending = null;
        return { cancelled: had };
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
