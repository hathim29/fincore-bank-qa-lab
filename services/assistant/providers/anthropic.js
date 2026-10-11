// FinCore Assistant — Anthropic (Claude) provider with a tool-use loop.

const Anthropic = require('@anthropic-ai/sdk');

const MAX_TOOL_ROUNDS = 5;
let client = null;
let clientKey = null;

function getClient(apiKey) {
    if (!client || clientKey !== apiKey) {
        client = new Anthropic({ apiKey });
        clientKey = apiKey;
    }
    return client;
}

/**
 * @param {object} p
 * @param {string} p.system           system prompt
 * @param {Array}  p.messages         conversation history (mutated: new turns are appended)
 * @param {Array}  p.tools            tool definitions
 * @param {Function} p.runTool        (name, input) => Promise<result>
 * @param {object} p.cfg              assistant config
 */
async function respond({ system, messages, tools, runTool, cfg }) {
    const anthropic = getClient(cfg.apiKey);
    const toolCalls = [];
    const usage = { inputTokens: 0, outputTokens: 0 };

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        const res = await anthropic.messages.create({
            model: cfg.model,
            max_tokens: cfg.maxOutputTokens,
            system,
            tools,
            messages,
        });
        usage.inputTokens += res.usage?.input_tokens || 0;
        usage.outputTokens += res.usage?.output_tokens || 0;
        messages.push({ role: 'assistant', content: res.content });

        const uses = res.content.filter(b => b.type === 'tool_use');
        if (res.stop_reason !== 'tool_use' || uses.length === 0) {
            const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
            return { text: text || "Sorry, I couldn't produce an answer. Please try rephrasing.", toolCalls, usage };
        }

        const results = [];
        for (const u of uses) {
            toolCalls.push({ name: u.name, input: u.input });
            const out = await runTool(u.name, u.input);
            results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out) });
        }
        messages.push({ role: 'user', content: results });
    }

    const text = 'Sorry, that request needed too many steps. Please ask one thing at a time.';
    messages.push({ role: 'assistant', content: [{ type: 'text', text }] }); // keep history valid
    return { text, toolCalls, usage };
}

module.exports = { respond };
