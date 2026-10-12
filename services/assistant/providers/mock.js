// FinCore Assistant — deterministic mock provider.
//
// No API key, no cost, same answer every time. It calls the SAME server-side
// tools as the real model, so CI and Playwright tests exercise the real data
// path, the customer scoping and the confirmation guards.
// It is a test double, not a chatbot: it only understands simple keywords.

const inr = v => '₹' + Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const has = (text, ...words) => words.some(w => new RegExp(`\\b${w}`, 'i').test(text));
const CONFIRM_PROMPT = 'Please reply "yes" to confirm.';
const LOAN_TYPES = ['personal', 'home', 'auto', 'education', 'business'];

async function respond({ messages, runTool }) {
    const last = messages[messages.length - 1];
    const text = typeof last.content === 'string' ? last.content : '';
    const toolCalls = [];
    const call = async (name, input = {}) => {
        toolCalls.push({ name, input });
        return runTool(name, input);
    };

    const reply = await answer(text, call, messages);
    messages.push({ role: 'assistant', content: reply });
    return { text: reply, toolCalls, usage: { inputTokens: 0, outputTokens: 0 } };
}

function pickLoan(loans, text, predicate = () => true) {
    const open = loans.filter(l => (l.status === 'active' || l.status === 'overdue') && predicate(l));
    const typed = text.toLowerCase().replace(/\bcar\b/, 'auto');
    const named = open.find(l => typed.includes(l.loan_type));
    if (named) return { loan: named };
    if (open.length === 1) return { loan: open[0] };
    return { choices: open };
}

function describeLoan(l) {
    let line = `- ${l.loan_type} loan (#${l.loan_id}): EMI ${inr(l.emi_amount)}, outstanding ${inr(l.outstanding_balance)}, status ${l.status}`;
    if (l.missed_emis) line += `, ${l.missed_emis} missed EMI(s) totalling ${inr(l.missed_amount)} (oldest due ${l.oldest_missed_due})`;
    if (l.next_emi_due) line += `, next EMI due ${l.next_emi_due}`;
    return line;
}

async function answer(text, call, messages) {
    // A pending action from the previous turn → this turn is the yes/no
    const prev = messages.length >= 2 ? messages[messages.length - 2] : null;
    const awaitingConfirm = prev && typeof prev.content === 'string' && prev.content.includes(CONFIRM_PROMPT);
    if (awaitingConfirm) {
        if (/^\s*(no|nope|cancel|don't|do not|stop)\b/i.test(text)) {
            await call('cancel_pending_action');
            return 'Okay, I have cancelled that. Nothing was changed.';
        }
        const r = await call('confirm_pending_action');
        if (!r.done) return `I couldn't complete that: ${r.error}.`;
        if (r.action === 'card_block') return `Done. Your card ${r.card} is now blocked.`;
        if (r.action === 'emi_payment') return `Done. I paid ${r.emis_paid.length} EMI(s) totalling ${inr(r.total_amount)}. Reference: ${r.emis_paid.map(e => e.reference_number).join(', ')}.`;
        if (r.action === 'loan_foreclosure') return `Done. Your ${r.loan_type} loan is now foreclosed.`;
    }

    if (has(text, 'ignore', 'system prompt', 'developer mode', 'admin mode', 'jailbreak', 'pretend')) {
        return "I can't change how I work, but I'm happy to help with your FinCore accounts, loans and cards.";
    }

    // ── Card block ──────────────────────────────────────────────
    if (has(text, 'block', 'lost', 'stolen', 'freeze')) {
        let last4 = (text.match(/\b(\d{4})\b/) || [])[1];
        if (!last4) {
            const { cards = [] } = await call('list_credit_cards');
            const active = cards.filter(c => c.status === 'active');
            if (active.length !== 1) {
                return active.length === 0
                    ? "You don't have any active credit cards to block."
                    : 'Which card should I block? Please tell me the last 4 digits.';
            }
            last4 = active[0].card_number_masked.slice(-4);
        }
        const r = await call('request_card_block', { card_last4: last4 });
        if (r.error) return `I couldn't start the block: ${r.error}.`;
        return `I can block your card ${r.card}. This cannot be undone here. ${CONFIRM_PROMPT}`;
    }

    // ── Pay missed EMIs ─────────────────────────────────────────
    if (has(text, 'pay') && has(text, 'emi', 'missed', 'overdue')) {
        const { loans = [] } = await call('list_loans');
        const pick = pickLoan(loans, text, l => l.missed_emis > 0);
        if (!pick.loan) {
            return pick.choices.length
                ? `Which loan's missed EMIs should I pay? ${pick.choices.map(l => l.loan_type).join(' or ')}?`
                : "Good news — you don't have any missed EMIs.";
        }
        const scope = has(text, 'oldest', 'one') ? 'oldest_missed' : 'all_missed';
        const r = await call('request_emi_payment', { loan_id: pick.loan.loan_id, scope });
        if (r.error) return `I couldn't set up the payment: ${r.error}.`;
        const lines = r.emis.map(e => `- EMI #${e.emi_number} due ${e.due_date}: ${inr(e.amount)}`);
        return `I can pay these missed EMIs on your ${r.loan_type} loan by auto-debit:\n${lines.join('\n')}\nTotal: ${inr(r.total_amount)}. ${CONFIRM_PROMPT}`;
    }

    // ── Foreclose ───────────────────────────────────────────────
    if (has(text, 'foreclos', 'close my', 'prepay')) {
        const { loans = [] } = await call('list_loans');
        const pick = pickLoan(loans, text);
        if (!pick.loan) {
            return pick.choices.length
                ? `Which loan do you want to foreclose? ${pick.choices.map(l => l.loan_type).join(' or ')}?`
                : "You don't have any active loans to foreclose.";
        }
        const r = await call('request_loan_foreclosure', { loan_id: pick.loan.loan_id });
        if (r.error) return `I couldn't start the foreclosure: ${r.error}.`;
        return `I can foreclose your ${r.loan_type} loan. Outstanding balance: ${inr(r.outstanding_balance)}. ${r.note} ${CONFIRM_PROMPT}`;
    }

    // ── Paid EMIs ───────────────────────────────────────────────
    if (has(text, 'paid emi', 'emi history', 'repayment', 'paid')) {
        const { loans = [] } = await call('list_loans');
        const pick = pickLoan(loans, text);
        if (!pick.loan) {
            return pick.choices.length
                ? `Which loan? ${pick.choices.map(l => l.loan_type).join(' or ')}?`
                : "You don't have any active loans.";
        }
        const r = await call('get_emi_history', { loan_id: pick.loan.loan_id, status: 'paid', limit: 6 });
        if (!r.emis || !r.emis.length) return `No EMIs have been paid yet on your ${pick.loan.loan_type} loan.`;
        const lines = r.emis.map(e => `- EMI #${e.emi_number}: ${inr(e.amount)} paid on ${e.paid_date}`);
        return `Your last ${r.emis.length} paid EMIs on the ${pick.loan.loan_type} loan (${r.total_matching} paid in total):\n${lines.join('\n')}`;
    }

    // ── Missed EMIs / loans ─────────────────────────────────────
    if (has(text, 'missed', 'overdue', 'loan', 'emi')) {
        const { loans = [] } = await call('list_loans');
        if (!loans.length) return "You don't have any loans with FinCore.";
        if (has(text, 'missed', 'overdue')) {
            const missed = loans.filter(l => l.missed_emis > 0);
            if (!missed.length) return "You don't have any missed EMIs. 👍";
            const lines = missed.map(l => `- ${l.loan_type} loan: ${l.missed_emis} missed EMI(s), ${inr(l.missed_amount)} overdue since ${l.oldest_missed_due}`);
            return `Yes, you have missed EMIs:\n${lines.join('\n')}`;
        }
        return `Your loans:\n${loans.map(describeLoan).join('\n')}`;
    }

    // ── Cards ───────────────────────────────────────────────────
    if (has(text, 'card', 'credit', 'minimum due')) {
        const { cards } = await call('list_credit_cards');
        if (!cards.length) return "You don't have any FinCore credit cards.";
        const lines = cards.map(c => `- ${c.card_type} ${c.card_number_masked}: available ${inr(c.available_credit)} of ${inr(c.credit_limit)}, minimum due ${inr(c.minimum_due)} by ${c.due_date}, status ${c.status}`);
        return `Your credit cards:\n${lines.join('\n')}`;
    }

    // ── Transactions ────────────────────────────────────────────
    if (has(text, 'transaction', 'statement', 'spent', 'history')) {
        const acct = (text.match(/\b(\d{6,})\b/) || [])[1];
        const limit = /\b10\b/.test(text) ? 10 : 5;
        const r = await call('get_recent_transactions', acct ? { account_number: acct, limit } : { limit });
        if (r.error) return 'I can only access your own accounts, and I could not find that one.';
        if (!r.transactions.length) return `There are no transactions on account ${r.account_number} yet.`;
        const lines = r.transactions.map(t => `- ${String(t.date).slice(0, 10)}: ${t.transaction_type} ${inr(t.amount)} (${t.status})`);
        return `Recent transactions on account ${r.account_number}:\n${lines.join('\n')}`;
    }

    // ── Accounts ────────────────────────────────────────────────
    if (has(text, 'balance', 'account', 'savings', 'money')) {
        const acct = (text.match(/\b(\d{6,})\b/) || [])[1];
        const { accounts } = await call('list_accounts');
        if (acct && !accounts.some(a => a.account_number === acct)) {
            return 'I can only help with your own accounts, and that account is not one of them.';
        }
        if (!accounts.length) return "You don't have any accounts with FinCore yet.";
        const lines = accounts.map(a => `- ${a.account_type} ${a.account_number}: ${inr(a.balance)} (${a.status})`);
        return `Your accounts:\n${lines.join('\n')}`;
    }

    if (has(text, 'kyc', 'profile', 'my name', 'who am i')) {
        const p = await call('get_profile');
        return `You are ${p.name} from ${p.city}. Your KYC status is ${p.kyc_status}.`;
    }

    if (has(text, 'hi', 'hello', 'hey', 'help')) {
        return 'Hi! I can help with your balances, transactions, loans and EMIs (paid, missed and upcoming), credit cards — and I can block a card, pay missed EMIs or foreclose a loan.';
    }

    return 'I can only help with your FinCore accounts, transactions, loans and credit cards.';
}

module.exports = { respond, LOAN_TYPES };
