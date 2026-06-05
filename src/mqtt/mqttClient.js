const mqtt = require("mqtt");
const fs = require("fs");

const client = mqtt.connect({
    host: "127.0.0.1",
    port: 8883,
    protocol: "mqtts",

    username: process.env.MQTT_USER,
    password: process.env.MQTT_PASSWORD,

    ca: fs.readFileSync("/home/welboundappsadmin/mqtt-ca/ca.crt"),
    servername: "iot.techenablesme.com"
});

client.on("connect", () => {
    console.log("MQTT Connected");
});

client.on("error", (err) => {
    console.error("MQTT Error:", err);
});

module.exports = client;
