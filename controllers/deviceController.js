const Device = require('../models/Device');
const { sendCommandToDevice, invokeDeviceMethod } = require('../iotHubService');

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

module.exports = { syncDevice, getDevice, sendCommand, invokeMethod };
