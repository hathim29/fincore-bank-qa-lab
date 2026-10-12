// FinCore — EMI schedule helpers (shared by the assistant and EMI payments).
//
// Mirrors the schedule shown in the Loans page popup (GET /api/loans/:id):
// stored loan_repayments rows win; any EMI without a row is "virtual" and due
// `emi_number` months after the loan start date. A virtual or stored-pending
// EMI whose due date has passed counts as overdue (missed).
//
// All dates are plain 'YYYY-MM-DD' strings and month maths is done in UTC, so
// results don't shift with the server's timezone.

/** Today's date in the server's local timezone, as YYYY-MM-DD. */
function todayYMD() {
    return new Date().toLocaleDateString('en-CA'); // en-CA formats as YYYY-MM-DD
}

/** Add n calendar months to a YYYY-MM-DD date, clamping to the month's last day. */
function addMonths(ymd, n) {
    const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1 + n, 1));
    const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    first.setUTCDate(Math.min(d, lastDay));
    return first.toISOString().slice(0, 10);
}

function daysBetween(fromYMD, toYMD) {
    return Math.round((Date.parse(toYMD + 'T00:00:00Z') - Date.parse(fromYMD + 'T00:00:00Z')) / 86400000);
}

/**
 * @param {object} loan     { start_date: 'YYYY-MM-DD', tenure_months, emi_amount }
 * @param {Array}  records  loan_repayments rows with due_date/paid_date as 'YYYY-MM-DD' strings
 * @param {string} today    'YYYY-MM-DD'
 */
function buildSchedule(loan, records = [], today = todayYMD()) {
    const byNumber = new Map(records.map(r => [Number(r.emi_number), r]));
    const schedule = [];
    for (let i = 1; i <= Number(loan.tenure_months); i++) {
        const r = byNumber.get(i);
        const due = r ? String(r.due_date).slice(0, 10) : addMonths(loan.start_date, i);
        let status = r ? r.status : 'pending';
        if (status !== 'paid' && due < today) status = 'overdue';
        schedule.push({
            emi_number: i,
            due_date: due,
            amount: Number(Number(r ? r.emi_amount : loan.emi_amount).toFixed(2)),
            status,
            paid_date: r && r.paid_date ? String(r.paid_date).slice(0, 10) : null,
            days_overdue: status === 'overdue' ? daysBetween(due, today) : 0,
            stored: Boolean(r),
        });
    }
    return schedule;
}

function summarise(schedule) {
    const paid = schedule.filter(e => e.status === 'paid');
    // Sort by date, not EMI number: stored rows and virtual EMIs don't always line up
    const byDate = [...schedule].sort((a, b) => a.due_date.localeCompare(b.due_date) || a.emi_number - b.emi_number);
    const missed = byDate.filter(e => e.status === 'overdue');
    const upcoming = byDate.find(e => e.status === 'pending') || null;
    return {
        emis_paid: paid.length,
        emis_total: schedule.length,
        missed_emis: missed.length,
        missed_amount: Number(missed.reduce((s, e) => s + e.amount, 0).toFixed(2)),
        oldest_missed_due: missed.length ? missed[0].due_date : null,
        next_emi_due: upcoming ? upcoming.due_date : null,
    };
}

module.exports = { todayYMD, addMonths, daysBetween, buildSchedule, summarise };
