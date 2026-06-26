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
            const { power, presence, uptime, radarBypassed } = payload;
            await pool.query(`
                INSERT INTO devices (
                    device_id,
                    online,
                    power_state,
                    presence,
                    uptime,
                    radar_bypassed,
                    last_seen
                )
                VALUES ($1, TRUE, $2, $3, $4, $5, NOW())
                ON CONFLICT (device_id)
                DO UPDATE SET
                    online = TRUE,
                    power_state = EXCLUDED.power_state,
                    presence = EXCLUDED.presence,
                    uptime = EXCLUDED.uptime,
                    radar_bypassed = EXCLUDED.radar_bypassed,
                    last_seen = NOW()
            `, [
                deviceId,
                power !== undefined ? power : false,
                presence !== undefined ? presence : false,
                uptime !== undefined ? uptime : 0,
                radarBypassed !== undefined ? radarBypassed : false
            ]);

            console.log(`[DB] Heartbeat updated: ${deviceId} (Power=${power}, Presence=${presence}, Uptime=${uptime})`);
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

            if (event === "AC_ON") {
                const device = await Device.findOne({ deviceId });
                if (device && device.configData) {
                    const defTemp = device.configData.defaultTurnOnTemp;
                    if (defTemp && defTemp > 0) {
                        device.configData.temperature = defTemp;
                        device.markModified('configData');
                        await device.save();
                        console.log(`[MQTT EVENT] Auto-set device temperature state to defaultTurnOnTemp: ${defTemp}°C`);
                    }
                }
            }

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

// Periodic offline check: marks devices as offline if not seen for >90 seconds
setInterval(async () => {
    try {
        const { rowCount } = await pool.query(`
            UPDATE devices 
            SET online = FALSE 
            WHERE last_seen < NOW() - INTERVAL '90 seconds' AND online = TRUE
        `);
        if (rowCount > 0) {
            console.log(`[MQTT] Marked ${rowCount} inactive device(s) as offline`);
            appEmitter.emit('device_update');
        }
    } catch (err) {
        console.error("[OFFLINE CHECK ERROR]", err);
    }
}, 30000);