const Device = require('../models/Device');
const { sendCommandToDevice, invokeDeviceMethod } = require('../iotHubService');
const { publishCommand } = require('../src/mqtt/publisher');
const { pool } = require('../database/postgres');

const getDevices = async (req, res) => {
    try {
        // Fetch all devices from PostgreSQL (live states)
        const { rows } = await pool.query('SELECT * FROM devices ORDER BY last_seen DESC');
        
        // Fetch all devices from MongoDB (metadata / configs)
        const mongoDevices = await Device.find({});
        const mongoMap = {};
        mongoDevices.forEach(d => {
            mongoMap[d.deviceId] = d;
        });

        // Merge SQL states with Mongo metadata
        const devices = rows.map(row => {
            const mongoDev = mongoMap[row.device_id] || {};
            return {
                deviceId: row.device_id,
                online: row.online,
                powerState: row.power_state,
                lastSeen: row.last_seen,
                firmwareVersion: row.firmware_version || 'v1.0.0',
                activeConfigName: mongoDev.activeConfigName || 'NONE',
                configData: mongoDev.configData || null,
                deviceName: mongoDev.deviceName || 'Smart AC Node'
            };
        });

        // Add any devices only in MongoDB but not in Postgres (rare, but good for completeness)
        mongoDevices.forEach(d => {
            const alreadyExists = devices.some(x => x.deviceId === d.deviceId);
            if (!alreadyExists) {
                devices.push({
                    deviceId: d.deviceId,
                    online: false,
                    powerState: false,
                    lastSeen: null,
                    firmwareVersion: 'v1.0.0',
                    activeConfigName: d.activeConfigName || 'NONE',
                    configData: d.configData || null,
                    deviceName: d.deviceName || 'Smart AC Node'
                });
            }
        });

        return res.status(200).json({ success: true, data: devices });
    } catch (err) {
        console.error('[DEVICE SERVER ERROR]', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

const syncDevice = async (req, res) => {
    try {
        console.log('[DEBUG] /api/devices/sync body:', JSON.stringify(req.body, null, 2));
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
        console.error('[DEVICE SERVER ERROR]', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

const getDevice = async (req, res) => {
    try {
        const device = await Device.findOne({ deviceId: req.params.deviceId });
        if (!device) return res.status(404).json({ error: 'Device not found' });
        return res.status(200).json(device);
    } catch (err) {
        console.error('[DEVICE SERVER ERROR]', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

const sendCommand = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const payload = req.body;

        if (!payload.command) {
            return res.status(400).json({ error: 'Missing "command" in request body' });
        }

        await sendCommandToDevice(deviceId, payload);
        return res.status(200).json({ message: 'Command sent', deviceId, payload });
    } catch (err) {
        console.error('[DEVICE SERVER ERROR]', err);
        return res.status(500).json({ error: 'Failed to send command' });
    }
};

const invokeMethod = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { methodName, payload } = req.body;

        if (!methodName) {
            return res.status(400).json({ error: 'Missing "methodName" in request body' });
        }

        const result = await invokeDeviceMethod(deviceId, methodName, payload || {});
        return res.status(200).json({ message: 'Method invoked', deviceId, result });
    } catch (err) {
        console.error('[DEVICE SERVER ERROR]', err);
        return res.status(500).json({ error: 'Failed to invoke method' });
    }
};

const powerOn = async (req, res) => {
    try {
        const { deviceId } = req.params;
        publishCommand(deviceId, 'power_on');
        return res.status(200).json({
            success: true,
            deviceId
        });
    } catch (err) {
        console.error('[DEVICE SERVER ERROR]', err);
        return res.status(500).json({ error: 'Failed to power on device' });
    }
};

module.exports = { getDevices, syncDevice, getDevice, sendCommand, invokeMethod, powerOn };

