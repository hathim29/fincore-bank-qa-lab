// FinCore Assistant — configuration (read from environment on every call,
// so tests and PM2 restarts pick up changes without code edits).

function num(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

function getConfig() {
    const provider = (process.env.ASSISTANT_PROVIDER || 'anthropic').toLowerCase();
    return {
        // Layer 1 — master switch. Off unless explicitly "true".
        masterEnabled: process.env.ASSISTANT_ENABLED === 'true',

        // "anthropic" (real LLM) or "mock" (deterministic, no API key, used in CI)
        provider,
        apiKey: process.env.ANTHROPIC_API_KEY || '',
        model: process.env.ASSISTANT_MODEL || 'claude-haiku-5-5',

        // Budget guard-rails
        dailyMessageLimit: num(process.env.ASSISTANT_DAILY_LIMIT, 200),
        maxTurnsPerConversation: num(process.env.ASSISTANT_MAX_TURNS, 20),
        maxMessageLength: num(process.env.ASSISTANT_MAX_MESSAGE_LENGTH, 1000),
        maxOutputTokens: num(process.env.ASSISTANT_MAX_OUTPUT_TOKENS, 600),

        // USD per million tokens — used only for the cost estimate on the settings page
        priceInputPerMTok: num(process.env.ASSISTANT_PRICE_INPUT, 0.10),
        priceOutputPerMTok: num(process.env.ASSISTANT_PRICE_OUTPUT, 0.50),
    };
}

function providerReady(cfg) {
    if (cfg.provider === 'mock') return true;
    if (cfg.provider === 'anthropic') return Boolean(cfg.apiKey);
    return false;
}

module.exports = { getConfig, providerReady };
