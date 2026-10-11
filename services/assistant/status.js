// FinCore Assistant — the single place that decides whether the assistant is on.
// Every chat request goes through this, so the UI can never bypass it.

const { getConfig, providerReady } = require('./config');
const store = require('./store');

// Flag key is namespaced per environment (see store.envName)
const flagKey = () => `assistant:${store.envName()}`;

async function getStatus() {
    const cfg = getConfig();
    const usage = await store.getUsageToday();
    const runtimeFlag = await store.getFlag(flagKey());

    let reason = null;
    if (!cfg.masterEnabled)                        reason = 'master_switch_off';
    else if (!providerReady(cfg))                  reason = 'no_api_key';
    else if (!runtimeFlag)                         reason = 'runtime_flag_off';
    else if (usage.messages >= cfg.dailyMessageLimit) reason = 'daily_limit_reached';

    const cost = (usage.inputTokens * cfg.priceInputPerMTok + usage.outputTokens * cfg.priceOutputPerMTok) / 1e6;

    return {
        enabled: reason === null,
        environment: store.envName(),
        reason,
        masterSwitch: cfg.masterEnabled,
        runtimeFlag,
        provider: cfg.provider,
        model: cfg.provider === 'mock' ? 'mock' : cfg.model,
        usage: {
            messagesToday: usage.messages,
            dailyLimit: cfg.dailyMessageLimit,
            inputTokensToday: usage.inputTokens,
            outputTokensToday: usage.outputTokens,
            estimatedCostUsdToday: Number(cost.toFixed(4)),
        },
    };
}

module.exports = { getStatus, flagKey };
