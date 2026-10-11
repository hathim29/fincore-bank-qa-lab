// FinCore Assistant — persistence for feature flags and daily usage.
// Tables are created on first use, so no manual SQL is needed on Supabase.

const pool = require('../../db/connection');

// CI, the live SIT server and local dev may share one database. Namespacing by
// environment stops a CI run from flipping the live site's flag or eating its
// daily message budget. Set ASSISTANT_ENV (e.g. "ci", "sit"); default "default".
const envName = () => process.env.ASSISTANT_ENV || 'default';

let ready = null;

function ensureTables() {
    if (!ready) {
        ready = pool.query(`
            CREATE TABLE IF NOT EXISTS feature_flags (
                key         VARCHAR(50) PRIMARY KEY,
                enabled     BOOLEAN     NOT NULL DEFAULT FALSE,
                updated_by  VARCHAR(50),
                updated_at  TIMESTAMP   DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS assistant_usage (
                env            VARCHAR(30) NOT NULL DEFAULT 'default',
                day            DATE        NOT NULL,
                messages       INTEGER     NOT NULL DEFAULT 0,
                input_tokens   BIGINT      NOT NULL DEFAULT 0,
                output_tokens  BIGINT      NOT NULL DEFAULT 0,
                PRIMARY KEY (env, day)
            );
        `).catch(err => { ready = null; throw err; });
    }
    return ready;
}

// ── Feature flags ───────────────────────────────────────────────
async function getFlag(key) {
    await ensureTables();
    const r = await pool.query('SELECT enabled FROM feature_flags WHERE key = $1', [key]);
    return r.rows.length ? r.rows[0].enabled : false; // default OFF
}

async function listFlags() {
    await ensureTables();
    const r = await pool.query('SELECT key, enabled, updated_by, updated_at FROM feature_flags ORDER BY key');
    return r.rows;
}

async function setFlag(key, enabled, updatedBy) {
    await ensureTables();
    const r = await pool.query(
        `INSERT INTO feature_flags (key, enabled, updated_by, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (key) DO UPDATE SET enabled = EXCLUDED.enabled,
                                         updated_by = EXCLUDED.updated_by,
                                         updated_at = NOW()
         RETURNING key, enabled, updated_by, updated_at`,
        [key, enabled, updatedBy || 'unknown']
    );
    return r.rows[0];
}

// ── Usage ───────────────────────────────────────────────────────
async function getUsageToday() {
    await ensureTables();
    const r = await pool.query(
        'SELECT messages, input_tokens, output_tokens FROM assistant_usage WHERE env = $1 AND day = CURRENT_DATE',
        [envName()]
    );
    const row = r.rows[0] || { messages: 0, input_tokens: 0, output_tokens: 0 };
    return {
        messages: Number(row.messages),
        inputTokens: Number(row.input_tokens),
        outputTokens: Number(row.output_tokens),
    };
}

async function recordUsage({ inputTokens = 0, outputTokens = 0 }) {
    await ensureTables();
    await pool.query(
        `INSERT INTO assistant_usage (env, day, messages, input_tokens, output_tokens)
         VALUES ($3, CURRENT_DATE, 1, $1, $2)
         ON CONFLICT (env, day) DO UPDATE SET messages      = assistant_usage.messages + 1,
                                              input_tokens  = assistant_usage.input_tokens + $1,
                                              output_tokens = assistant_usage.output_tokens + $2`,
        [inputTokens, outputTokens, envName()]
    );
}

module.exports = { envName, ensureTables, getFlag, listFlags, setFlag, getUsageToday, recordUsage };
