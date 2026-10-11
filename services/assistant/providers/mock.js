// FinCore Assistant — deterministic mock provider.
//
// No API key, no cost, same answer every time. It calls the SAME server-side
// tools as the real model, so CI and Playwright tests exercise the real data
// path, the customer scoping and the card-block confirmation guards.
// It is a test double, not a chatbot: it only understands simple keywords.

const inr = v => '₹' + Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const has = (text, ...words) => words.some(w => new RegExp(`\\b${w}`, 'i').test(text));

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

async function answer(text, call, messages) {
    // Pending card block → this turn is the yes/no
    const prev = messages.length >= 2 ? messages[messages.length - 2] : null;
    const awaitingConfirm = prev && typeof prev.content === 'string' && /reply "yes" to confirm/i.test(prev.content);
    if (awaitingConfirm) {
        if (/^\s*(no|nope|cancel|don't|do not|stop)\b/i.test(text)) {
            await call('cancel_pending_action');
            return 'Okay, I have cancelled the request. Your card has not been blocked.';
        }
        const r = await call('confirm_card_block');
        if (r.blocked) return `Done. Your card ${r.card} is now blocked.`;
        return `I couldn't block the card: ${r.error}.`;
    }

    if (has(text, 'ignore', 'system prompt', 'developer mode', 'admin mode', 'jailbreak', 'pretend')) {
        return "I can't change how I work, but I'm happy to help with your FinCore accounts, loans and cards.";
    }

    if (has(text, 'block', 'lost', 'stolen', 'freeze')) {
        const digits = (text.match(/\b(\d{4})\b/) || [])[1];
        let last4 = digits;
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
        return `I can block your card ${r.card}. This cannot be undone here. Please reply "yes" to confirm.`;
    }

    if (has(text, 'transaction', 'statement', 'spent', 'history')) {
        const acct = (text.match(/\b(\d{6,})\b/) || [])[1];
        const r = await call('get_recent_transactions', acct ? { account_number: acct } : {});
        if (r.error) return 'I can only access your own accounts, and I could not find that one.';
        if (!r.transactions.length) return `There are no transactions on account ${r.account_number} yet.`;
        const lines = r.transactions.map(t => `- ${String(t.date).slice(0, 10)}: ${t.transaction_type} ${inr(t.amount)} (${t.status})`);
        return `Recent transactions on account ${r.account_number}:\n${lines.join('\n')}`;
    }

    if (has(text, 'loan', 'emi')) {
        const { loans } = await call('list_loans');
        if (!loans.length) return "You don't have any loans with FinCore.";
        const lines = loans.map(l => `- ${l.loan_type} loan: EMI ${inr(l.emi_amount)}, outstanding ${inr(l.outstanding_balance)}, status ${l.status}` +
            (l.next_emi_due ? `, next EMI due ${String(l.next_emi_due).slice(0, 10)}` : ''));
        return `Your loans:\n${lines.join('\n')}`;
    }

    if (has(text, 'card', 'credit')) {
        const { cards } = await call('list_credit_cards');
        if (!cards.length) return "You don't have any FinCore credit cards.";
        const lines = cards.map(c => `- ${c.card_type} ${c.card_number_masked}: available ${inr(c.available_credit)} of ${inr(c.credit_limit)}, status ${c.status}`);
        return `Your credit cards:\n${lines.join('\n')}`;
    }

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
        return 'Hi! I can help with your account balances, recent transactions, loans and EMIs, credit cards, and blocking a card.';
    }

    return 'I can only help with your FinCore accounts, transactions, loans and credit cards.';
}

module.exports = { respond };
