const Device = require('../models/Device');
const { sendCommandToDevice, invokeDeviceMethod } = require('../iotHubService');
const { publishCommand } = require('../src/mqtt/publisher');
const { pool } = require('../database/postgres');

const getDevices = async (req, res) => {
    try {
        const user = req.user;

        let query = 'SELECT * FROM devices ORDER BY created_at ASC, device_id ASC';
        let params = [];

        if (user.role !== 'admin') {
            const ownedDevices = await pool.query(
                'SELECT device_id FROM device_ownership WHERE user_id = $1',
                [user.id]
            );
            const userDeviceIds = ownedDevices.rows.map(r => r.device_id);
            if (userDeviceIds.length === 0) {
                return res.status(200).json({ success: true, data: [] });
            }
            query = 'SELECT * FROM devices WHERE device_id = ANY($1) ORDER BY created_at ASC, device_id ASC';
            params = [userDeviceIds];
        }

        // Fetch user's devices from PostgreSQL (live states)
        const { rows } = await pool.query(query, params);
        
        const deviceIds = rows.map(r => r.device_id);

        // Fetch user's devices from MongoDB (metadata / configs)
        const mongoDevices = await Device.find({ deviceId: { $in: deviceIds } });
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
                radarBypassed: row.radar_bypassed || false,
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
        const { deviceId, deviceName, activeConfigName, configData, defaultTurnOnTemp } = req.body;
        if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });

        const user = req.user;
        if (!user) {
            return res.status(403).json({ error: 'You do not have permission to sync this device' });
        }

        if (user.role !== 'admin') {
            const ownershipCheck = await pool.query(
                'SELECT 1 FROM device_ownership WHERE user_id = $1 AND device_id = $2',
                [user.id, deviceId]
            );
            if (ownershipCheck.rows.length === 0) {
                return res.status(403).json({ error: 'You do not have permission to sync this device' });
            }
        }

        let device = await Device.findOne({ deviceId });
        if (!device) {
            device = new Device({ deviceId });
        }

        if (deviceName) device.deviceName = deviceName;
        if (activeConfigName !== undefined) device.activeConfigName = activeConfigName;
        if (configData !== undefined) device.configData = configData;

        if (defaultTurnOnTemp !== undefined) {
            if (!device.configData) {
                device.configData = {};
            }
            device.configData.defaultTurnOnTemp = defaultTurnOnTemp;
        }

        device.markModified('configData');
        await device.save();

        if (device.configData && device.configData.buttons) {
            const buttons = device.configData.buttons || {};
            let powerOn = buttons.power_on || {};
            const powerOff = buttons.power_off || {};
            
            const defTemp = device.configData.defaultTurnOnTemp;
            if (defTemp) {
                const tempKey = `temp_${defTemp}`;
                if (buttons[tempKey]) {
                    powerOn = buttons[tempKey];
                    console.log(`[SYNC] Using custom turn-on temp IR pattern: ${tempKey}`);
                }
            }

            // Extract timing parameters from one of the active buttons
            const timingSource = powerOn.bits ? powerOn : (powerOff.bits ? powerOff : {});

            publishCommand(deviceId, 'set_config', {
                cfgName: activeConfigName || device.activeConfigName || 'NONE',
                irFreq: device.configData.irFreq || 38,
                hdrMark: timingSource.hdr_mark || 0,
                hdrSpace: timingSource.hdr_space || 0,
                bitMark: timingSource.bit_mark || 0,
                oneSpace: timingSource.one_space || 0,
                zeroSpace: timingSource.zero_space || 0,
                stopMark: timingSource.bit_mark || 0,
                bitLen: timingSource.bits || 0,
                sendRep: device.configData.sendRep || 3,
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

        await pool.query(
            `INSERT INTO device_ownership (user_id, device_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [user.id, deviceId]
        );

        // Ensure device document exists in MongoDB
        const device = await Device.findOneAndUpdate(
            { deviceId },
            { $setOnInsert: { deviceName: 'Smart AC Node', activeConfigName: 'NONE' } },
            { upsert: true, new: true }
        );

        const ownedDevices = await pool.query(
            'SELECT device_id FROM device_ownership WHERE user_id = $1',
            [user.id]
        );

        return res.status(200).json({
            success: true,
            message: 'Device claimed successfully',
            devices: ownedDevices.rows.map(r => r.device_id),
            device
        });
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

const setRadarBypass = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { bypass } = req.body;
        if (bypass === undefined) {
            return res.status(400).json({ error: 'Missing bypass parameter' });
        }
        const payload = { action: bypass ? 'radar_off' : 'radar_on' };
        const mqttClient = require('../src/mqtt/mqttClient');
        mqttClient.publish(`ac/${deviceId}/cmd`, JSON.stringify(payload));
        return res.status(200).json({ success: true, deviceId });
    } catch (err) {
        console.error('[DEVICE SERVER ERROR]', err);
        return res.status(500).json({ error: 'Failed to set radar bypass' });
    }
};

const changeTemperature = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { temp } = req.body;

        if (temp === undefined) {
            return res.status(400).json({ error: 'Missing "temp" in request body' });
        }

        const device = await Device.findOne({ deviceId });
        if (!device) {
            return res.status(404).json({ error: 'Device not found' });
        }

        const tempKey = `temp_${temp}`;
        let patternSent = false;

        if (device.configData && device.configData.buttons) {
            const button = device.configData.buttons[tempKey];
            if (button) {
                const method = button.method || 'encoded';
                const { publishCommand } = require('../src/mqtt/publisher');
                if (method === 'encoded' && button.data) {
                    publishCommand(deviceId, 'send_ir', {
                        method: 'encoded',
                        hexData: button.data,
                        bits: button.bits,
                        hdrMark: button.hdr_mark,
                        hdrSpace: button.hdr_space,
                        bitMark: button.bit_mark,
                        oneSpace: button.one_space,
                        zeroSpace: button.zero_space
                    });
                    patternSent = true;
                } else if (method === 'raw' && button.rawData) {
                    publishCommand(deviceId, 'send_ir', {
                        method: 'raw',
                        rawData: button.rawData
                    });
                    patternSent = true;
                }
            }
        }

        // Save new temp state in mongo
        if (!device.configData) {
            device.configData = {};
        }
        device.configData.temperature = temp;
        device.markModified('configData');
        await device.save();

        return res.status(200).json({ 
            success: true, 
            deviceId, 
            temperature: temp, 
            patternSent 
        });
    } catch (err) {
        console.error('[DEVICE SERVER ERROR]', err);
        return res.status(500).json({ error: 'Failed to change temperature' });
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
    setTimeConfig,
    setRadarBypass,
    changeTemperature
};


