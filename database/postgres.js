const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.PG_USER || 'admin',
    host: process.env.PG_HOST || 'localhost',
    database: process.env.PG_DATABASE || 'ac_automation_db',
    password: process.env.PG_PASSWORD || 'root',
    port: process.env.PG_PORT || 5432,
});

const initPostgresDB = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS devices (
                device_id VARCHAR(255) PRIMARY KEY,
                online BOOLEAN DEFAULT FALSE,
                power_state BOOLEAN DEFAULT FALSE,
                last_seen TIMESTAMPTZ,
                firmware_version VARCHAR(50),
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        console.log('[POSTGRES] Connected and initialized tables successfully.');
    } catch (err) {
        console.error('[POSTGRES] Initialization failed:', err.message);
    }
};

module.exports = { pool, initPostgresDB };
