// FinCore Assistant — contextual suggestion chips.
//
// Built by the server from what happened in this turn (which tools ran and
// what they returned), not by the model, so they are deterministic, cheap and
// testable — and never offer an action the customer can't actually take
// (e.g. "Pay my missed EMIs" only appears when there are missed EMIs).

const DEFAULTS = ['What is my balance?', 'Show recent transactions', 'When is my next EMI?', 'Block my credit card'];

// [suggestion pattern, question pattern] — a suggestion is skipped when the
// customer's own message was already about the same thing
const TOPICS = [
    [/missed EMIs\?$/i,       /missed|overdue/i],
    [/paid EMIs/i,             /\bpaid\b|emi history|repayment/i],
    [/next EMI/i,              /next emi|next due|when.*emi/i],
    [/balance/i,               /balance/i],
    [/recent transactions/i,   /transaction/i],
    [/minimum due/i,           /minimum due/i],
    [/credit is available/i,   /available/i],
];

const CONFIRM = {
    card_block:       ['Yes, block it', 'No, cancel'],
    emi_payment:      ['Yes, pay now', 'No, cancel'],
    loan_foreclosure: ['Yes, foreclose it', 'No, cancel'],
};

function lastResult(calls, ...names) {
    for (let i = calls.length - 1; i >= 0; i--) {
        if (names.includes(calls[i].name) && calls[i].result && !calls[i].result.error) return calls[i];
    }
    return null;
}

function loanSuggestions(loans) {
    const open = loans.filter(l => l.status === 'active' || l.status === 'overdue');
    if (!open.length) return ['What is my balance?', 'Show recent transactions', 'Show my credit cards'];
    const out = [];
    if (open.some(l => l.missed_emis > 0)) out.push('Pay my missed EMIs');
    out.push('Show my paid EMIs');
    out.push('Do I have any missed EMIs?');
    if (open.length === 1) out.push(`Foreclose my ${open[0].loan_type} loan`);
    else if (open.length > 1) out.push('Foreclose a loan');
    out.push('When is my next EMI?');
    return out;
}

/**
 * @param {Array} calls   [{ name, input, result }] tool calls made this turn
 * @param {object|null} pending  conversation.pending after the turn
 * @param {string} lastUserMessage
 */
function buildSuggestions({ calls = [], pending = null, lastUserMessage = '' }) {
    if (pending && CONFIRM[pending.type]) return CONFIRM[pending.type];

    let list = null;

    const done = lastResult(calls, 'confirm_pending_action');
    if (done && done.result.done) {
        if (done.result.action === 'emi_payment')      list = ['Do I have any missed EMIs?', 'Show my paid EMIs', 'What is my balance?'];
        if (done.result.action === 'loan_foreclosure') list = ['Show my loans', 'What is my balance?'];
        if (done.result.action === 'card_block')       list = ['Show my credit cards', 'What is my balance?'];
    }

    const loans = !list && lastResult(calls, 'list_loans');
    if (loans) list = loanSuggestions(loans.result.loans || []);

    const history = !list && lastResult(calls, 'get_emi_history');
    if (history) {
        list = ['Do I have any missed EMIs?', 'Show my paid EMIs', 'When is my next EMI?'];
        if (history.result.filter === 'missed' && history.result.total_matching > 0) list.unshift('Pay my missed EMIs');
    }

    const cards = !list && lastResult(calls, 'list_credit_cards');
    if (cards) {
        const active = (cards.result.cards || []).filter(c => c.status === 'active');
        list = ['What is my minimum due?', 'How much credit is available?'];
        if (active.length) list.unshift('Block my credit card');
    }

    const txns = !list && lastResult(calls, 'get_recent_transactions');
    if (txns) list = ['Show last 10 transactions', 'What is my balance?', 'Show my loans'];

    const accounts = !list && lastResult(calls, 'list_accounts');
    if (accounts) list = ['Show recent transactions', 'Show my loans', 'Show my credit cards'];

    const cancelled = !list && lastResult(calls, 'cancel_pending_action');
    if (cancelled) list = DEFAULTS;

    // Don't suggest the question the customer just asked (or a close variant of it)
    const asked = lastUserMessage.trim().toLowerCase();
    const sameTopic = s => {
        const t = TOPICS.find(([re]) => re.test(s));
        return s.toLowerCase() === asked || Boolean(t && t[1].test(asked));
    };
    return (list || DEFAULTS).filter(s => !sameTopic(s)).slice(0, 4);
}

module.exports = { buildSuggestions, DEFAULTS };
