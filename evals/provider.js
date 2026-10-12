// promptfoo custom provider for FinCore Assistant.
//
// Talks to the running FinCore server over HTTP — the same path the chat
// widget uses — so evals test the real system prompt, tools and guards.
//
// Test vars it understands:
//   customer: 'primary' | 'other'   which eval customer the chat is bound to (default primary)
//   history:  string                earlier messages in the same conversation, one per line, sent first
//             (a plain string, not a list — promptfoo expands list vars into separate test cases)
//   reset:    true                  recreate eval customers before this test (for tests that change data)
//   output:   'json'                return {reply, replies, toolCalls, cardStatus, otherCardStatus, loanStatus, missedEmis}
//                                   instead of plain text

const { resetEvalCustomers, getState } = require('./fixtures/evalCustomers');

const BASE = process.env.FINCORE_URL || 'http://localhost:3000';
let idsPromise = null;

function customerIds() {
    if (!idsPromise) idsPromise = resetEvalCustomers();
    return idsPromise;
}

async function send(customerId, conversationId, message) {
    const res = await fetch(`${BASE}/api/assistant/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, conversationId, message }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.error || 'request failed'}${body.reason ? ` (${body.reason})` : ''}`);
    return body;
}

class FinCoreAssistantProvider {
    constructor(options = {}) {
        this.providerId = options.id || 'fincore-assistant';
    }

    id() {
        return this.providerId;
    }

    async callApi(prompt, context) {
        const vars = (context && context.vars) || {};
        try {
            if (vars.reset) idsPromise = resetEvalCustomers();
            const ids = await customerIds();
            const customerId = ids[vars.customer || 'primary'];

            const turns = String(vars.history || '').split('\n').map(t => t.trim()).filter(Boolean);
            let conversationId = null;
            const replies = [];
            const toolCalls = [];
            let tokens = { prompt: 0, completion: 0 };
            let latencyMs = 0;

            for (const message of [...turns, prompt]) {
                const r = await send(customerId, conversationId, message);
                conversationId = r.conversationId;
                replies.push(r.reply);
                toolCalls.push(...r.meta.toolCalls.map(t => t.name));
                tokens.prompt += r.meta.usage.inputTokens || 0;
                tokens.completion += r.meta.usage.outputTokens || 0;
                latencyMs += r.meta.latencyMs || 0;
            }

            const reply = replies[replies.length - 1];
            let output = reply;
            if (vars.output === 'json') {
                // cardStatus (Ananya's card), otherCardStatus (Vikram's card),
                // loanStatus and missedEmis (Ananya's home loan)
                output = JSON.stringify({ reply, replies, toolCalls, ...(await getState()) });
            }

            return {
                output,
                tokenUsage: { total: tokens.prompt + tokens.completion, prompt: tokens.prompt, completion: tokens.completion },
                metadata: { toolCalls, latencyMs },
            };
        } catch (err) {
            return { error: err.message };
        }
    }
}

module.exports = FinCoreAssistantProvider;
