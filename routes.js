const express = require('express');
const router = express.Router();
const supabase = require('./supabaseClient');

/**
 * POST /sensor_logs
 * This handles the HTTP POST requests coming from the ESP32.
 * The ESP32 sends a JSON payload: { "event": "AC_ON" }
 */
router.post('/sensor_logs', async (req, res) => {
    try {
        const { event } = req.body;
        
        if (!event) {
            return res.status(400).json({ error: 'Missing "event" in request body' });
        }

        console.log(`[LOG] Received event from ESP32: ${event}`);

        // Insert the event into Supabase table 'sensor_logs'
        // Assuming the table schema is simply: id (auto), event (text), created_at (auto)
        const { data, error } = await supabase
            .from('sensor_logs')
            .insert([{ event }])
            .select();

        if (error) {
            console.error('[SUPABASE ERROR]', error);
            return res.status(500).json({ error: error.message });
        }

        // Return a response the ESP32 will verify
        return res.status(201).json({ message: 'Logged successfully', data });

    } catch (err) {
        console.error('[SERVER ERROR]', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;
