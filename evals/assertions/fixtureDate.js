// promptfoo assertion: does the reply mention the expected fixture date?
// Test sets vars.date_key to one of: nextEmi | missedEmi | cardDue (see evals/fixtures/evalCustomers.js).
// Accepts the common ways a model writes a date: 2026-11-05, 5 Nov / 5th November (2026), Nov 5, 05/11/2026.

const { fixtureDates } = require('../fixtures/evalCustomers');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

module.exports = (output, context) => {
    const key = context.vars.date_key;
    const ymd = fixtureDates()[key];
    if (!ymd) return { pass: false, score: 0, reason: `Unknown date_key "${key}"` };

    const [y, m, d] = ymd.split('-');
    const day = String(Number(d));
    const mon = MONTHS[Number(m) - 1];
    const monRe = `(${mon}|${mon.slice(0, 3)})`;
    const patterns = [
        new RegExp(ymd),
        new RegExp(`\\b0?${day}(st|nd|rd|th)?\\s+(of\\s+)?${monRe}\\b`, 'i'),
        new RegExp(`\\b${monRe}\\.?\\s+0?${day}(st|nd|rd|th)?\\b`, 'i'),
        new RegExp(`\\b0?${day}[/-]0?${Number(m)}[/-]${y}\\b`),
    ];
    const pass = patterns.some(re => re.test(output));
    return { pass, score: pass ? 1 : 0, reason: pass ? `Mentions ${key} (${ymd})` : `Expected the ${key} date ${ymd} in the reply` };
};
