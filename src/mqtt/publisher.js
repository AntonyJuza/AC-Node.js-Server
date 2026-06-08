const mqttClient = require("./mqttClient");

function publishCommand(deviceId, action, extraPayload = {}) {
    const payload = {
        action,
        timestamp: Date.now(),
        ...extraPayload
    };

    mqttClient.publish(
        `ac/${deviceId}/cmd`,
        JSON.stringify(payload)
    );

    console.log(
        `[MQTT] Command sent to ${deviceId}: ${action}`
    );
}

module.exports = {
    publishCommand
};