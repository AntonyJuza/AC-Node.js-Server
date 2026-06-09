const { pool } = require('../database/postgres');

const logEvent = async (req, res) => {
    try {
        const { device_id, event, temperature, presence } = req.body;

        if (!event || !device_id) {
            return res.status(400).json({ error: 'Missing "event" or "device_id" in request body' });
        }

        const istTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        console.log(`[LOG] [IST ${istTime}] Received event from ${device_id}: ${event}`);

        const query = `
            INSERT INTO ac_events (device_id, event, temperature, presence)
            VALUES ($1, $2, $3, $4) RETURNING *;
        `;
        const values = [device_id, event, temperature !== undefined ? temperature : null, presence !== undefined ? presence : null];
        
        const result = await pool.query(query, values);

        return res.status(201).json({ message: 'Event logged successfully', data: result.rows[0] });
    } catch (err) {
        console.error('[EVENT SERVER ERROR]', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

const getEvents = async (req, res) => {
    try {
        const user = req.user;

        let query = 'SELECT id, device_id, event AS event_type, temperature, presence, created_at FROM ac_events ORDER BY created_at DESC LIMIT 50';
        let params = [];

        if (user.role !== 'admin') {
            const userDeviceIds = user.devices || [];
            if (userDeviceIds.length === 0) {
                return res.status(200).json({ success: true, data: [] });
            }
            query = 'SELECT id, device_id, event AS event_type, temperature, presence, created_at FROM ac_events WHERE device_id = ANY($1) ORDER BY created_at DESC LIMIT 50';
            params = [userDeviceIds];
        }

        const result = await pool.query(query, params);
        return res.status(200).json({ success: true, data: result.rows });
    } catch (err) {
        console.error('[EVENT SERVER ERROR]', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { logEvent, getEvents };

