// FinCore Assistant — conversation engine.
//
// The server owns the conversation history. Clients send only their new
// message plus a conversationId, so nobody can inject fake "assistant" turns
// or tool results into the history.

const crypto = require('crypto');
const pool = require('../../db/connection');
const { getConfig } = require('./config');
const { definitions, runTool } = require('./tools');
const systemPrompt = require('./systemPrompt');
const store = require('./store');
const { buildSuggestions } = require('./suggestions');

const providers = {
    anthropic: require('./providers/anthropic'),
    mock: require('./providers/mock'),
};

const TTL_MS = 30 * 60 * 1000;
const conversations = new Map();

class AssistantError extends Error {
    constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

function sweep() {
    const now = Date.now();
    for (const [id, c] of conversations) if (now - c.updatedAt > TTL_MS) conversations.delete(id);
}

async function chat({ customerId, conversationId, message }) {
    const cfg = getConfig();
    sweep();

    // ── Validate input ───────────────────────────────────────────
    const cid = Number(customerId);
    if (!Number.isInteger(cid) || cid <= 0) throw new AssistantError(400, 'customerId must be a positive integer', 'invalid_customer');
    if (typeof message !== 'string' || !message.trim()) throw new AssistantError(400, 'message is required', 'empty_message');
    if (message.length > cfg.maxMessageLength) {
        throw new AssistantError(400, `message must be ${cfg.maxMessageLength} characters or fewer`, 'message_too_long');
    }

    // ── Resolve conversation (bound to one customer for its lifetime) ──
    let convo = conversationId ? conversations.get(String(conversationId)) : null;
    if (conversationId && !convo) throw new AssistantError(404, 'Conversation not found or expired. Start a new one.', 'conversation_expired');
    if (convo && convo.customerId !== cid) {
        throw new AssistantError(409, 'This conversation belongs to a different customer. Start a new conversation.', 'customer_mismatch');
    }
    if (!convo) {
        const cust = await pool.query('SELECT id, name FROM customers WHERE id = $1', [cid]);
        if (!cust.rows.length) throw new AssistantError(404, 'Customer not found', 'customer_not_found');
        convo = {
            id: crypto.randomUUID(),
            customerId: cid,
            customerName: cust.rows[0].name,
            messages: [],
            turn: 0,
            pending: null,
            updatedAt: Date.now(),
        };
        conversations.set(convo.id, convo);
    }
    if (convo.turn >= cfg.maxTurnsPerConversation) {
        throw new AssistantError(429, 'This conversation has reached its message limit. Please start a new one.', 'conversation_limit');
    }

    // ── Run one turn ─────────────────────────────────────────────
    const provider = providers[cfg.provider];
    if (!provider) throw new AssistantError(503, `Unknown provider "${cfg.provider}"`, 'bad_provider');

    const snapshot = convo.messages.length;
    convo.turn += 1;
    convo.messages.push({ role: 'user', content: message.trim() });

    const ctx = { customerId: cid, conversation: convo, userMessage: message.trim() };
    const calls = []; // { name, input, result } — feeds the suggestion chips
    const started = Date.now();
    let result;
    try {
        result = await provider.respond({
            system: systemPrompt({ customerName: convo.customerName, today: new Date().toISOString().slice(0, 10) }),
            messages: convo.messages,
            tools: definitions,
            runTool: async (name, input) => {
                const result = await runTool(name, input, ctx);
                calls.push({ name, input, result });
                return result;
            },
            cfg,
        });
    } catch (err) {
        convo.messages.length = snapshot; // roll back the half-finished turn
        convo.turn -= 1;
        console.error('assistant provider error:', err.message);
        throw new AssistantError(502, 'The assistant is temporarily unavailable. Please try again.', 'provider_error');
    }

    convo.updatedAt = Date.now();
    await store.recordUsage(result.usage);

    return {
        conversationId: convo.id,
        reply: result.text,
        meta: {
            provider: cfg.provider,
            model: cfg.provider === 'mock' ? 'mock' : cfg.model,
            turn: convo.turn,
            toolCalls: result.toolCalls,
            pendingAction: convo.pending ? { type: convo.pending.type, summary: convo.pending.summary } : null,
            suggestions: buildSuggestions({ calls, pending: convo.pending, lastUserMessage: message }),
            latencyMs: Date.now() - started,
            usage: result.usage,
        },
    };
}

module.exports = { chat, AssistantError, _conversations: conversations };
