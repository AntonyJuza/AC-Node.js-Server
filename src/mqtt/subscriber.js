const mqttClient = require("./mqttClient");
const { pool } = require("../../database/postgres");

mqttClient.on("connect", () => {
    console.log("[MQTT] Connected");

    mqttClient.subscribe("ac/+/status");
    mqttClient.subscribe("ac/+/heartbeat");

    console.log("[MQTT] Subscribed to topics");
});

mqttClient.on("message", async (topic, message) => {
    try {
        const payload = JSON.parse(message.toString());

        console.log(`[MQTT] ${topic}`);
        console.log(payload);

        const parts = topic.split("/");
        const deviceId = parts[1];
        const eventType = parts[2];

        if (eventType === "heartbeat") {

            await pool.query(`
                INSERT INTO devices (
                    device_id,
                    online,
                    last_seen
                )
                VALUES ($1, TRUE, NOW())
                ON CONFLICT (device_id)
                DO UPDATE SET
                    online = TRUE,
                    last_seen = NOW()
            `, [deviceId]);

            console.log(`[DB] Heartbeat updated: ${deviceId}`);
        }

        if (eventType === "status") {

            await pool.query(`
                INSERT INTO devices (
                    device_id,
                    power_state,
                    last_seen
                )
                VALUES ($1, $2, NOW())
                ON CONFLICT (device_id)
                DO UPDATE SET
                    power_state = $2,
                    last_seen = NOW()
            `, [
                deviceId,
                payload.power
            ]);

            console.log(`[DB] Status updated: ${deviceId}`);
        }

    } catch (err) {
        console.error("[MQTT ERROR]", err);
    }
});