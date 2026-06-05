const mqttClient = require("./mqttClient");

function publishPowerOn(deviceId) {
    mqttClient.publish(
        `ac/${deviceId}/cmd`,
        JSON.stringify({
            action: "power_on"
        })
    );
}

module.exports = {
    publishPowerOn
};
