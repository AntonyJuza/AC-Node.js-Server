const express = require('express');
const router = express.Router();
const SensorLog = require('./models/SensorLog');
const Device = require('./models/Device');
const { sendCommandToDevice, invokeDeviceMethod } = require('./iotHubService');

/**
 * POST /devices/sync
 * Allows the ESP32 or App to sync device configuration state
 */
router.post('/devices/sync', async (req, res) => {
    try {
        console.log('[DEBUG] /devices/sync body:', JSON.stringify(req.body, null, 2));
        const { deviceId, deviceName, activeConfigName, configData } = req.body;
        if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });

        const updatePayload = {};
        if (deviceName) updatePayload.deviceName = deviceName;
        if (activeConfigName !== undefined) updatePayload.activeConfigName = activeConfigName;
        if (configData !== undefined) updatePayload.configData = configData;

        const device = await Device.findOneAndUpdate(
            { deviceId },
            { $set: updatePayload },
            { new: true, upsert: true }
        );
        return res.status(200).json({ message: 'Device synced', device });
    } catch (err) {
        console.error('[SERVER ERROR]', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

/**
 * GET /devices/:deviceId
 * Fetch a device's current configuration from the cloud
 */
router.get('/devices/:deviceId', async (req, res) => {
    try {
        const device = await Device.findOne({ deviceId: req.params.deviceId });
        if (!device) return res.status(404).json({ error: 'Device not found' });
        return res.status(200).json(device);
    } catch (err) {
        console.error('[SERVER ERROR]', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

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
        const istTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        console.log(`[LOG] [IST ${istTime}] Received event from ${device}: ${event}`);

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

/**
 * POST /devices/:deviceId/command
 * Send a cloud-to-device command via Azure IoT Hub
 * Body: { "command": "SET_TEMP", "value": 24 }
 */
router.post('/devices/:deviceId/command', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const payload = req.body;

        if (!payload.command) {
            return res.status(400).json({ error: 'Missing "command" in request body' });
        }

        await sendCommandToDevice(deviceId, payload);
        return res.status(200).json({ message: 'Command sent', deviceId, payload });
    } catch (err) {
        console.error('[SERVER ERROR]', err);
        return res.status(500).json({ error: 'Failed to send command' });
    }
});

/**
 * POST /devices/:deviceId/method
 * Invoke a direct method on a device (synchronous, with response)
 * Body: { "methodName": "getStatus", "payload": {} }
 */
router.post('/devices/:deviceId/method', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { methodName, payload } = req.body;

        if (!methodName) {
            return res.status(400).json({ error: 'Missing "methodName" in request body' });
        }

        const result = await invokeDeviceMethod(deviceId, methodName, payload || {});
        return res.status(200).json({ message: 'Method invoked', deviceId, result });
    } catch (err) {
        console.error('[SERVER ERROR]', err);
        return res.status(500).json({ error: 'Failed to invoke method' });
    }
});

module.exports = router;
