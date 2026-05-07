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
            CREATE TABLE IF NOT EXISTS ac_events (
                id SERIAL PRIMARY KEY,
                device_id VARCHAR(255) NOT NULL,
                event VARCHAR(50) NOT NULL,
                temperature NUMERIC,
                presence BOOLEAN,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('[POSTGRES] Connected and initialized tables successfully.');
    } catch (err) {
        console.error('[POSTGRES] Initialization failed:', err.message);
    }
};

module.exports = { pool, initPostgresDB };
