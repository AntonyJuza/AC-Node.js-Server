const mqttClient = require("./mqttClient");

mqttClient.subscribe("ac/+/status");
mqttClient.subscribe("ac/+/heartbeat");

mqttClient.on("message", (topic, message) => {
    console.log(topic);
    console.log(message.toString());

    // later:
    // update MongoDB
});
