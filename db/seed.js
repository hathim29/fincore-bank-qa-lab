// FinCore Bank — Seed Script
// Save in: db/seed.js
// Run: node db/seed.js (from project root)

const pool = require('./connection');
const { faker } = require('@faker-js/faker');

// ============================================================
// HELPERS
// ============================================================
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randAmount(min, max) { return parseFloat((Math.random() * (max - min) + min).toFixed(2)); }
function refNumber() { return 'REF' + Date.now() + randInt(1000, 9999); }

function daysFromNow(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}
function monthsAgo(months) {
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    return d.toISOString().split('T')[0];
}
function monthsFromNow(months) {
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    return d.toISOString().split('T')[0];
}

// ============================================================
// CONSTANTS
// ============================================================
const loanTypes     = ['personal', 'home', 'auto', 'education', 'business'];
const cardTypes     = ['Visa', 'Mastercard', 'RuPay'];
const txnChannels   = ['cash', 'ATM', 'NEFT', 'RTGS', 'IMPS', 'UPI-GPay', 'UPI-PhonePe', 'UPI-Paytm', 'UPI-Other', 'cheque', 'branch'];
const txnTypes      = ['deposit', 'withdrawal', 'transfer'];
const txnStatuses   = ['success', 'success', 'success', 'success', 'failed', 'pending'];
const payChannels   = ['cash', 'NEFT', 'RTGS', 'IMPS', 'UPI-GPay', 'UPI-PhonePe', 'auto-debit', 'cheque'];
const merchants     = ['Amazon', 'Flipkart', 'Swiggy', 'Zomato', 'BigBasket', 'Myntra', 'BookMyShow', 'MakeMyTrip', 'Reliance Digital', 'Decathlon', 'IRCTC', 'Uber', 'Ola', 'Nykaa', 'PharmEasy'];
const kycStatuses   = ['verified', 'verified', 'verified', 'pending', 'rejected'];
const accTypes      = ['savings', 'current', 'salary'];

// ============================================================
// MAIN SEED
// ============================================================
async function seed() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        console.log('🌱 FinCore Bank — Seeding started...\n');

        // ----------------------------------------
        // CLEAR EXISTING DATA
        // ----------------------------------------
        console.log('🗑️  Clearing existing data...');
        await client.query(`
            TRUNCATE loan_score, loan_repayments, credit_card_transactions,
                     credit_cards, transactions, loans, accounts,
                     customers, users
            RESTART IDENTITY CASCADE
        `);
        console.log('   ✅ Cleared\n');

        // ----------------------------------------
        // USERS
        // ----------------------------------------
        console.log('🔑 Creating users...');
        await client.query(`
            INSERT INTO users (username, password, role) VALUES
            ('admin', 'admin123', 'admin'),
            ('viewer', 'viewer123', 'viewer')
        `);
        console.log('   ✅ 2 users created\n');

        // ----------------------------------------
        // CUSTOMERS — 20 realistic customers
        // ----------------------------------------
        console.log('👥 Creating customers...');
        const customerIds = [];

        const customerNames = [
            'Arjun Sharma', 'Priya Nair', 'Rahul Verma', 'Sneha Iyer',
            'Karthik Rajan', 'Divya Menon', 'Anil Kumar', 'Meera Pillai',
            'Suresh Babu', 'Lakshmi Devi', 'Vikram Singh', 'Anitha Raj',
            'Mohan Das', 'Kavitha Sundaram', 'Rajesh Patel', 'Sunita Rao',
            'Deepak Nair', 'Uma Krishnan', 'Sanjay Mehta', 'Revathi Subramanian'
        ];
        const cities = ['Chennai', 'Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Kochi', 'Pune', 'Coimbatore', 'Madurai', 'Ahmedabad', 'Kolkata'];

        for (let i = 0; i < customerNames.length; i++) {
            const name = customerNames[i];
            const email = name.toLowerCase().replace(/ /g, '.') + '@gmail.com';
            const phone = '9' + randInt(100000000, 999999999);
            const city = randItem(cities);
            const kyc = randItem(kycStatuses);

            const res = await client.query(
                `INSERT INTO customers (name, email, phone, city, kyc_status)
                 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                [name, email, phone, city, kyc]
            );
            customerIds.push(res.rows[0].id);
        }
        console.log(`   ✅ ${customerIds.length} customers created\n`);

        // ----------------------------------------
        // ACCOUNTS — 1 to 2 per customer
        // ----------------------------------------
        console.log('🏦 Creating accounts...');
        const accountIds = [];
        const accountByCustomer = {};
        let accNum = 1000000001;

        for (const custId of customerIds) {
            accountByCustomer[custId] = [];
            const numAccounts = Math.random() > 0.4 ? 2 : 1;
            const usedTypes = [];

            for (let i = 0; i < numAccounts; i++) {
                let accType;
                do { accType = randItem(accTypes); } while (usedTypes.includes(accType));
                usedTypes.push(accType);

                const balance = randAmount(5000, 500000);
                const status = Math.random() > 0.9 ? 'frozen' : 'active';

                const res = await client.query(
                    `INSERT INTO accounts (customer_id, account_number, account_type, balance, status)
                     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                    [custId, String(accNum++), accType, balance, status]
                );
                accountIds.push(res.rows[0].id);
                accountByCustomer[custId].push({ id: res.rows[0].id, balance });
            }
        }
        console.log(`   ✅ ${accountIds.length} accounts created\n`);

        // ----------------------------------------
        // LOANS — for ~70% of customers
        // ----------------------------------------
        console.log('💰 Creating loans...');
        const loanIds = [];
        const loanByCustomer = {};

        for (const custId of customerIds) {
            if (Math.random() > 0.3) {
                loanByCustomer[custId] = [];
                const numLoans = Math.random() > 0.6 ? 2 : 1;

                for (let i = 0; i < numLoans; i++) {
                    const loanType      = randItem(loanTypes);
                    const principal     = randAmount(50000, 2000000);
                    const rate          = randAmount(7.5, 18.5);
                    const tenure        = randItem([12, 24, 36, 48, 60, 84, 120]);
                    const monthlyRate   = rate / 12 / 100;
                    const emi           = parseFloat((principal * monthlyRate * Math.pow(1 + monthlyRate, tenure) / (Math.pow(1 + monthlyRate, tenure) - 1)).toFixed(2));
                    const startDate     = monthsAgo(randInt(1, 24));
                    const endDate       = monthsFromNow(tenure - randInt(1, 24));
                    const paidMonths    = randInt(0, Math.min(12, tenure - 1));
                    const outstanding   = parseFloat(Math.max(0, principal - (emi * paidMonths * 0.7)).toFixed(2));
                    const status        = randItem(['active', 'active', 'active', 'overdue', 'closed']);
                    const accId         = accountByCustomer[custId]?.[0]?.id || null;

                    const res = await client.query(
                        `INSERT INTO loans (customer_id, account_id, loan_type, principal_amount, interest_rate,
                         tenure_months, emi_amount, outstanding_balance, status, start_date, end_date)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
                        [custId, accId, loanType, principal, rate, tenure, emi, outstanding, status, startDate, endDate]
                    );
                    loanIds.push(res.rows[0].id);
                    loanByCustomer[custId].push({ id: res.rows[0].id, emi, tenure, paidMonths });
                }
            }
        }
        console.log(`   ✅ ${loanIds.length} loans created\n`);

        // ----------------------------------------
        // LOAN REPAYMENTS + LOAN SCORE
        // ----------------------------------------
        console.log('📅 Creating loan repayments and scores...');
        let repaymentCount = 0;

        for (const custId of Object.keys(loanByCustomer)) {
            for (const loan of loanByCustomer[custId]) {
                let onTime = 0, delayed = 0, missed = 0;

                // Past EMIs
                for (let emi = 1; emi <= loan.paidMonths; emi++) {
                    const dueDate = new Date();
                    dueDate.setMonth(dueDate.getMonth() - (loan.paidMonths - emi + 1));
                    const dueDateStr = dueDate.toISOString().split('T')[0];

                    const rand = Math.random();
                    let status, paidDate, daysDelayed, channel;

                    if (rand > 0.6) {
                        status = 'paid'; paidDate = dueDateStr; daysDelayed = 0;
                        channel = randItem(payChannels); onTime++;
                    } else if (rand > 0.35) {
                        const delay = randInt(1, 15);
                        const pd = new Date(dueDateStr);
                        pd.setDate(pd.getDate() + delay);
                        status = 'paid'; paidDate = pd.toISOString().split('T')[0];
                        daysDelayed = delay; channel = randItem(payChannels); delayed++;
                    } else {
                        status = 'overdue'; paidDate = null;
                        daysDelayed = randInt(16, 60); channel = null; missed++;
                    }

                    await client.query(
                        `INSERT INTO loan_repayments (loan_id, customer_id, emi_number, emi_amount,
                         due_date, paid_date, status, payment_channel, reference_number, days_delayed)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                        [loan.id, parseInt(custId), emi, loan.emi, dueDateStr, paidDate,
                         status, channel, paidDate ? refNumber() : null, daysDelayed]
                    );
                    repaymentCount++;
                }

                // Upcoming pending EMIs
                for (let emi = loan.paidMonths + 1; emi <= Math.min(loan.paidMonths + 3, loan.tenure); emi++) {
                    const dueDate = new Date();
                    dueDate.setMonth(dueDate.getMonth() + (emi - loan.paidMonths));
                    await client.query(
                        `INSERT INTO loan_repayments (loan_id, customer_id, emi_number, emi_amount, due_date, status, days_delayed)
                         VALUES ($1, $2, $3, $4, $5, 'pending', 0)`,
                        [loan.id, parseInt(custId), emi, loan.emi, dueDate.toISOString().split('T')[0]]
                    );
                    repaymentCount++;
                }

                // Loan score
                const total = onTime + delayed + missed;
                const score = total > 0
                    ? Math.min(900, Math.max(300, Math.round(300 + (onTime / total * 450) - (delayed / total * 100) - (missed / total * 200))))
                    : 750;

                await client.query(
                    `INSERT INTO loan_score (loan_id, customer_id, score, on_time_payments, delayed_payments, missed_payments)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [loan.id, parseInt(custId), score, onTime, delayed, missed]
                );
            }
        }
        console.log(`   ✅ ${repaymentCount} loan repayments + scores created\n`);

        // ----------------------------------------
        // CREDIT CARDS — for ~60% of customers
        // ----------------------------------------
        console.log('💳 Creating credit cards...');
        const cardIds = [];
        const cardByCustomer = {};
        let cardSuffix = 1001;

        for (const custId of customerIds) {
            if (Math.random() > 0.4) {
                cardByCustomer[custId] = [];
                const numCards = Math.random() > 0.6 ? 2 : 1;

                for (let i = 0; i < numCards; i++) {
                    const cardType      = randItem(cardTypes);
                    const limit         = randItem([50000, 100000, 150000, 200000, 300000, 500000]);
                    const outstanding   = randAmount(0, limit * 0.8);
                    const minDue        = parseFloat((outstanding * 0.05).toFixed(2));
                    const dueDate       = daysFromNow(randInt(5, 25));
                    const status        = Math.random() > 0.9 ? 'blocked' : 'active';
                    const last4         = String(cardSuffix++).padStart(4, '0');
                    const fullNum       = '4000' + randInt(10000000, 99999999) + last4;
                    const masked        = '**** **** **** ' + last4;

                    const res = await client.query(
                        `INSERT INTO credit_cards (customer_id, card_number, card_number_masked, card_type,
                         credit_limit, outstanding_balance, minimum_due, due_date, status)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
                        [custId, fullNum, masked, cardType, limit, outstanding, minDue, dueDate, status]
                    );
                    cardIds.push(res.rows[0].id);
                    cardByCustomer[custId].push({ id: res.rows[0].id, outstanding });
                }
            }
        }
        console.log(`   ✅ ${cardIds.length} credit cards created\n`);

        // ----------------------------------------
        // CREDIT CARD TRANSACTIONS
        // ----------------------------------------
        console.log('🛒 Creating credit card transactions...');
        let ccTxnCount = 0;

        for (const custId of Object.keys(cardByCustomer)) {
            for (const card of cardByCustomer[custId]) {
                const numTxns = randInt(8, 20);

                for (let i = 0; i < numTxns; i++) {
                    const txnType   = randItem(['purchase', 'purchase', 'purchase', 'refund', 'cashback', 'payment']);
                    const amount    = txnType === 'payment'
                        ? randAmount(1000, Math.max(1000, card.outstanding))
                        : randAmount(200, 15000);
                    const status    = randItem(['success', 'success', 'success', 'failed', 'pending']);
                    const merchant  = txnType === 'purchase' ? randItem(merchants) : null;

                    await client.query(
                        `INSERT INTO credit_card_transactions (card_id, customer_id, transaction_type,
                         merchant_name, amount, status, reference_number)
                         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                        [card.id, parseInt(custId), txnType, merchant, amount, status, refNumber()]
                    );
                    ccTxnCount++;
                }
            }
        }
        console.log(`   ✅ ${ccTxnCount} credit card transactions created\n`);

        // ----------------------------------------
        // GENERAL TRANSACTIONS
        // ----------------------------------------
        console.log('💸 Creating general transactions...');
        let txnCount = 0;

        for (const custId of customerIds) {
            const accounts = accountByCustomer[custId] || [];

            for (const acc of accounts) {
                const numTxns = randInt(15, 30);
                let runningBalance = acc.balance;

                for (let i = 0; i < numTxns; i++) {
                    const txnType   = randItem(txnTypes);
                    const channel   = randItem(txnChannels);
                    const amount    = randAmount(500, 50000);
                    const status    = randItem(txnStatuses);
                    const daysBack  = randInt(0, 90);

                    if (txnType !== 'deposit') {
                        runningBalance = Math.max(500, runningBalance - amount);
                    } else {
                        runningBalance += amount;
                    }

                    const desc = `${txnType.charAt(0).toUpperCase() + txnType.slice(1)} via ${channel}`;

                    await client.query(
                        `INSERT INTO transactions (account_id, customer_id, transaction_type, channel,
                         amount, balance_after, status, reference_number, description, created_at)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW() - ($10 || ' days')::INTERVAL)`,
                        [acc.id, custId, txnType, channel, amount,
                         parseFloat(runningBalance.toFixed(2)), status, refNumber(), desc, daysBack]
                    );
                    txnCount++;
                }
            }
        }
        console.log(`   ✅ ${txnCount} general transactions created\n`);

        await client.query('COMMIT');

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ FinCore Bank seed complete!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`   Customers:             ${customerIds.length}`);
        console.log(`   Accounts:              ${accountIds.length}`);
        console.log(`   Loans:                 ${loanIds.length}`);
        console.log(`   Loan Repayments:       ${repaymentCount}`);
        console.log(`   Credit Cards:          ${cardIds.length}`);
        console.log(`   CC Transactions:       ${ccTxnCount}`);
        console.log(`   General Transactions:  ${txnCount}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('\n🔑 Login credentials:');
        console.log('   Admin:  admin / admin123');
        console.log('   Viewer: viewer / viewer123\n');

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('\n❌ Seed failed:', err.message);
        console.error(err.stack);
    } finally {
        client.release();
        process.exit(0);
    }
}

seed();
