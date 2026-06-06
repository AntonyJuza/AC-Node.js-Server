const mqttClient = require("./mqttClient");

function publishCommand(deviceId, action) {
    const payload = {
        action,
        timestamp: Date.now()
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