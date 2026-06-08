const mqttClient = require("./mqttClient");
const { pool } = require("../../database/postgres");
const appEmitter = require("../events/eventEmitter");
const Device = require("../../models/Device");

mqttClient.on("connect", () => {
    console.log("[MQTT] Connected");

    mqttClient.subscribe("ac/#");

    console.log("[MQTT] Subscribed to topics");
});

mqttClient.on("message", async (topic, message) => {
    console.log("TOPIC =", topic);
    console.log("LEN =", message.length);
    console.log("RAW TOPIC:", topic);
    console.log("RAW MESSAGE:", message.toString());

    let payload;

    try {
        payload = JSON.parse(message.toString());
    } catch (e) {
        console.error("JSON parse failed:", e);
        return;
    }

    try {
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
            appEmitter.emit('device_update');
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
            appEmitter.emit('device_update');
        }

        if (eventType === "event") {
            const { event, temperature, presence } = payload;
            const istTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
            console.log(`[MQTT LOG] [IST ${istTime}] Received event from ${deviceId}: ${event}`);

            await pool.query(`
                INSERT INTO ac_events (device_id, event, temperature, presence)
                VALUES ($1, $2, $3, $4)
            `, [
                deviceId,
                event,
                temperature !== undefined ? temperature : null,
                presence !== undefined ? presence : null
            ]);

            console.log(`[DB] Event logged: ${deviceId} -> ${event}`);
            appEmitter.emit('device_update');
        }

        if (eventType === "sync") {
            const { activeConfigName } = payload;
            console.log(`[MQTT SYNC] Received sync from ${deviceId}: configName=${activeConfigName}`);

            await Device.findOneAndUpdate(
                { deviceId },
                { $set: { activeConfigName: activeConfigName || 'NONE' } },
                { returnDocument: 'after', upsert: true }
            );

            console.log(`[DB] Device sync updated: ${deviceId}`);
            appEmitter.emit('device_update');
        }

        if (eventType === "ir_data") {
            console.log(`[MQTT IR DATA] Received learned IR from ${deviceId}`);
            global.capturedIr = global.capturedIr || {};
            global.capturedIr[deviceId] = payload;
        }

    } catch (err) {
        console.error("[MQTT ERROR]", err);
    }
});