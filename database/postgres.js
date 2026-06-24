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
                presence BOOLEAN DEFAULT FALSE,
                uptime INTEGER DEFAULT 0,
                last_seen TIMESTAMPTZ,
                firmware_version VARCHAR(50),
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        // Initialize ac_events table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS ac_events (
                id SERIAL PRIMARY KEY,
                device_id VARCHAR(255) NOT NULL,
                event VARCHAR(255) NOT NULL,
                temperature NUMERIC,
                presence BOOLEAN,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        // Initialize users table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role VARCHAR(50) DEFAULT 'user',
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);

        // Initialize device_ownership table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS device_ownership (
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                device_id VARCHAR(255) NOT NULL,
                PRIMARY KEY (user_id, device_id)
            );
        `);

        // Migration to add columns to existing tables if they do not exist
        await pool.query(`
            ALTER TABLE devices ADD COLUMN IF NOT EXISTS presence BOOLEAN DEFAULT FALSE;
            ALTER TABLE devices ADD COLUMN IF NOT EXISTS uptime INTEGER DEFAULT 0;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_password_token VARCHAR(255);
            ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_password_expires TIMESTAMPTZ;
        `);

        // Migration: migrate data from legacy users.devices array to device_ownership if devices column exists
        const columnCheck = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='users' AND column_name='devices';
        `);
        if (columnCheck.rows.length > 0) {
            console.log('[POSTGRES MIGRATION] Migrating user devices array to device_ownership table...');
            const usersResult = await pool.query('SELECT id, devices FROM users');
            for (const user of usersResult.rows) {
                if (user.devices && Array.isArray(user.devices)) {
                    for (const devId of user.devices) {
                        await pool.query(`
                            INSERT INTO device_ownership (user_id, device_id)
                            VALUES ($1, $2)
                            ON CONFLICT DO NOTHING
                        `, [user.id, devId]);
                    }
                }
            }
            // Drop devices column from users
            await pool.query('ALTER TABLE users DROP COLUMN devices');
            console.log('[POSTGRES MIGRATION] Legacy devices column dropped successfully.');
        }

        console.log('[POSTGRES] Connected and initialized tables successfully.');
    } catch (err) {
        console.error('[POSTGRES] Initialization failed:', err.message);
    }
};

module.exports = { pool, initPostgresDB };
