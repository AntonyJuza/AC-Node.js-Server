const { Client: ServiceClient } = require('azure-iothub');
const { Message } = require('azure-iot-common');

let serviceClient = null;

/**
 * Initialize the IoT Hub service client for sending C2D messages.
 */
async function initServiceClient() {
    const connectionString = process.env.IOT_HUB_CONNECTION_STRING;

    if (!connectionString) {
        console.warn('[IOT HUB SERVICE] IOT_HUB_CONNECTION_STRING not set, skipping service client.');
        return;
    }

    serviceClient = ServiceClient.fromConnectionString(connectionString);
    await serviceClient.open();
    console.log('[IOT HUB SERVICE] Service client connected.');
}

/**
 * Send a cloud-to-device (C2D) command to a specific device.
 * @param {string} deviceId - Target device ID
 * @param {object} payload  - JSON payload to send
 */
async function sendCommandToDevice(deviceId, payload) {
    if (!serviceClient) {
        throw new Error('IoT Hub service client not initialized');
    }

    const message = new Message(JSON.stringify(payload));
    message.ack = 'full'; // Request delivery acknowledgment
    message.messageId = `cmd-${Date.now()}`;

    // Optional: set custom properties
    message.properties.add('command-type', payload.command || 'unknown');

    try {
        await serviceClient.send(deviceId, message);
        console.log(`[IOT HUB SERVICE] Sent command to ${deviceId}:`, JSON.stringify(payload));
    } catch (err) {
        console.error(`[IOT HUB SERVICE] Failed to send to ${deviceId}:`, err.message);
        throw err;
    }
}

/**
 * Invoke a direct method on a device (alternative to C2D messages).
 * Direct methods are synchronous and return a response.
 * @param {string} deviceId   - Target device ID
 * @param {string} methodName - Method name to invoke
 * @param {object} payload    - Method payload
 * @param {number} timeout    - Response timeout in seconds
 */
async function invokeDeviceMethod(deviceId, methodName, payload = {}, timeout = 30) {
    if (!serviceClient) {
        throw new Error('IoT Hub service client not initialized');
    }

    const methodParams = {
        methodName: methodName,
        payload: payload,
        responseTimeoutInSeconds: timeout,
    };

    try {
        const result = await serviceClient.invokeDeviceMethod(deviceId, methodParams);
        console.log(`[IOT HUB SERVICE] Method ${methodName} on ${deviceId} returned:`, result.result);
        return result.result;
    } catch (err) {
        console.error(`[IOT HUB SERVICE] Method invocation failed:`, err.message);
        throw err;
    }
}

module.exports = { initServiceClient, sendCommandToDevice, invokeDeviceMethod };
