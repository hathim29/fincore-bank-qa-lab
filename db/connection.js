const { Pool } = require('pg');
const dns = require('dns');
require('dotenv').config();

// Force IPv4 — GitHub Actions runners resolve to IPv6 by default
// which is unreachable from Supabase. This forces Node.js to use IPv4.
dns.setDefaultResultOrder('ipv4first');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

module.exports = pool;
