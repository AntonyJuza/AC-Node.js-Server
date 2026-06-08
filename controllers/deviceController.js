const Device = require('../models/Device');
const User = require('../models/User');
const { sendCommandToDevice, invokeDeviceMethod } = require('../iotHubService');
const { publishCommand } = require('../src/mqtt/publisher');
const { pool } = require('../database/postgres');

const getDevices = async (req, res) => {
    try {
        const user = req.user;

        const userDeviceIds = user.devices || [];

        if (userDeviceIds.length === 0) {
            return res.status(200).json({ success: true, data: [] });
        }

        // Fetch user's devices from PostgreSQL (live states)
        const { rows } = await pool.query(
            'SELECT * FROM devices WHERE device_id = ANY($1) ORDER BY last_seen DESC',
            [userDeviceIds]
        );
        
        // Fetch user's devices from MongoDB (metadata / configs)
        const mongoDevices = await Device.find({ deviceId: { $in: userDeviceIds } });
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
                presence: row.presence || false,
                uptime: row.uptime || 0,
                lastSeen: row.last_seen,
                firmwareVersion: row.firmware_version || 'v1.0.0',
                activeConfigName: mongoDev.activeConfigName || 'NONE',
                configData: mongoDev.configData || null,
                deviceName: mongoDev.deviceName || 'Smart AC Node'
            };
        });

        // Add any devices only in MongoDB but not in Postgres
        mongoDevices.forEach(d => {
            const alreadyExists = devices.some(x => x.deviceId === d.deviceId);
            if (!alreadyExists) {
                devices.push({
                    deviceId: d.deviceId,
                    online: false,
                    powerState: false,
                    presence: false,
                    uptime: 0,
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

        const user = req.user;
        if (!user || !user.devices.includes(deviceId)) {
            return res.status(403).json({ error: 'You do not have permission to sync this device' });
        }

        const updatePayload = {};
        if (deviceName) updatePayload.deviceName = deviceName;
        if (activeConfigName !== undefined) updatePayload.activeConfigName = activeConfigName;
        if (configData !== undefined) updatePayload.configData = configData;

        const device = await Device.findOneAndUpdate(
            { deviceId },
            { $set: updatePayload },
            { new: true, upsert: true }
        );

        if (configData && configData.buttons) {
            const buttons = configData.buttons || {};
            const powerOn = buttons.power_on || {};
            const powerOff = buttons.power_off || {};
            
            // Extract timing parameters from one of the active buttons
            const timingSource = powerOn.bits ? powerOn : (powerOff.bits ? powerOff : {});

            publishCommand(deviceId, 'set_config', {
                cfgName: activeConfigName || device.activeConfigName || 'NONE',
                irFreq: configData.irFreq || 38,
                hdrMark: timingSource.hdr_mark || 0,
                hdrSpace: timingSource.hdr_space || 0,
                bitMark: timingSource.bit_mark || 0,
                oneSpace: timingSource.one_space || 0,
                zeroSpace: timingSource.zero_space || 0,
                stopMark: timingSource.bit_mark || 0,
                bitLen: timingSource.bits || 0,
                sendRep: configData.sendRep || 3,
                acOn: powerOn.data || [],
                acOff: powerOff.data || []
            });
        }

        return res.status(200).json({ message: 'Device synced', device });
    } catch (err) {
        console.error('[DEVICE SERVER ERROR]', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

const claimDevice = async (req, res) => {
    try {
        const { deviceId } = req.body;

        if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });

        const user = req.user;

        if (!user.devices.includes(deviceId)) {
            user.devices.push(deviceId);
            await user.save();
        }

        // Ensure device document exists in MongoDB
        const device = await Device.findOneAndUpdate(
            { deviceId },
            { $setOnInsert: { deviceName: 'Smart AC Node', activeConfigName: 'NONE' } },
            { upsert: true, new: true }
        );

        return res.status(200).json({ success: true, message: 'Device claimed successfully', devices: user.devices, device });
    } catch (err) {
        console.error('[CLAIM DEVICE ERROR]', err);
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

const powerOff = async (req, res) => {
    try {
        const { deviceId } = req.params;
        publishCommand(deviceId, 'power_off');
        return res.status(200).json({
            success: true,
            deviceId
        });
    } catch (err) {
        console.error('[DEVICE SERVER ERROR]', err);
        return res.status(500).json({ error: 'Failed to power off device' });
    }
};

const startLearn = async (req, res) => {
    try {
        const { deviceId } = req.params;
        publishCommand(deviceId, 'learn_start');
        return res.status(200).json({ success: true, deviceId });
    } catch (err) {
        console.error('[DEVICE SERVER ERROR]', err);
        return res.status(500).json({ error: 'Failed to start learning' });
    }
};

const stopLearn = async (req, res) => {
    try {
        const { deviceId } = req.params;
        publishCommand(deviceId, 'learn_stop');
        return res.status(200).json({ success: true, deviceId });
    } catch (err) {
        console.error('[DEVICE SERVER ERROR]', err);
        return res.status(500).json({ error: 'Failed to stop learning' });
    }
};

const getCapturedIr = async (req, res) => {
    try {
        const { deviceId } = req.params;
        global.capturedIr = global.capturedIr || {};
        const data = global.capturedIr[deviceId];
        if (data) {
            delete global.capturedIr[deviceId];
            return res.status(200).json({ success: true, captured: true, data });
        }
        return res.status(200).json({ success: true, captured: false });
    } catch (err) {
        console.error('[DEVICE SERVER ERROR]', err);
        return res.status(500).json({ error: 'Failed to get captured IR data' });
    }
};

const setTiming = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { onTime, offTime } = req.body;
        if (onTime === undefined || offTime === undefined) {
            return res.status(400).json({ error: 'Missing onTime or offTime in body' });
        }
        const payload = { action: 'set_timing', onTime, offTime };
        const mqttClient = require('../src/mqtt/mqttClient');
        mqttClient.publish(`ac/${deviceId}/cmd`, JSON.stringify(payload));
        return res.status(200).json({ success: true, deviceId });
    } catch (err) {
        console.error('[DEVICE SERVER ERROR]', err);
        return res.status(500).json({ error: 'Failed to set timing config' });
    }
};

const setTimeConfig = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { gmtOffset, dstOffset } = req.body;
        if (gmtOffset === undefined || dstOffset === undefined) {
            return res.status(400).json({ error: 'Missing gmtOffset or dstOffset in body' });
        }
        const payload = { action: 'set_time_config', gmtOffset, dstOffset };
        const mqttClient = require('../src/mqtt/mqttClient');
        mqttClient.publish(`ac/${deviceId}/cmd`, JSON.stringify(payload));
        return res.status(200).json({ success: true, deviceId });
    } catch (err) {
        console.error('[DEVICE SERVER ERROR]', err);
        return res.status(500).json({ error: 'Failed to set timezone config' });
    }
};

module.exports = { 
    getDevices, 
    syncDevice, 
    getDevice, 
    sendCommand, 
    invokeMethod, 
    powerOn, 
    powerOff, 
    claimDevice,
    startLearn,
    stopLearn,
    getCapturedIr,
    setTiming,
    setTimeConfig
};


