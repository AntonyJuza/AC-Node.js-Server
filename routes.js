const express = require('express');
const router = express.Router();
const SensorLog = require('./models/SensorLog');

/**
 * POST /sensor_logs
 * Receives a JSON payload from the ESP32: { "event": "AC_ON" }
 * and saves it to MongoDB.
 */
router.post('/sensor_logs', async (req, res) => {
    try {
        const { event, deviceName, deviceId } = req.body;

        if (!event || !deviceId) {
            return res.status(400).json({ error: 'Missing "event" or "deviceId" in request body' });
        }

        const device = deviceName || deviceId;
        console.log(`[LOG] Received event from ${device}: ${event}`);

        // Only save to database if the event is related to AC status
        if (event === 'AC_ON' || event === 'AC_OFF') {
            const log = new SensorLog({ event, deviceId, deviceName: device });
            await log.save();
            return res.status(201).json({ message: 'Logged successfully', data: log });
        } else {
            // Ignore other events like "PRESENCE", return 200 OK
            return res.status(200).json({ message: 'Event acknowledged but not logged', event, deviceName: device });
        }

    } catch (err) {
        console.error('[SERVER ERROR]', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

/**
 * GET /sensor_logs
 * Returns the last 50 sensor log entries, newest first.
 */
router.get('/sensor_logs', async (req, res) => {
    try {
        const logs = await SensorLog.find().sort({ createdAt: -1 }).limit(50);
        return res.status(200).json(logs);
    } catch (err) {
        console.error('[SERVER ERROR]', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;
