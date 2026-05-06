const { EventHubConsumerClient } = require('@azure/event-hubs');
const SensorLog = require('./models/SensorLog');
const Device = require('./models/Device');

let consumerClient = null;

/**
 * Start listening for device-to-cloud (D2C) messages from IoT Hub.
 * Messages arrive via the built-in Event Hub-compatible endpoint.
 */
async function startIoTHubListener() {
    const connectionString = process.env.IOT_HUB_EVENT_HUB_ENDPOINT;
    const consumerGroup = '$Default'; // Use default consumer group

    if (!connectionString) {
        console.warn('[IOT HUB] IOT_HUB_EVENT_HUB_ENDPOINT not set, skipping IoT Hub listener.');
        return;
    }

    consumerClient = new EventHubConsumerClient(consumerGroup, connectionString);

    console.log('[IOT HUB] Listening for device telemetry...');

    const subscription = consumerClient.subscribe({
        processEvents: async (events, context) => {
            for (const event of events) {
                const deviceId = event.systemProperties['iothub-connection-device-id'];
                const body = event.body;

                console.log(`[IOT HUB] Message from ${deviceId}:`, JSON.stringify(body));

                // Process the message — same logic as your /sensor_logs route
                try {
                    if (body.event === 'AC_ON' || body.event === 'AC_OFF') {
                        const log = new SensorLog({
                            event: body.event,
                            deviceId: deviceId,
                            deviceName: body.deviceName || deviceId,
                        });
                        await log.save();
                        console.log(`[IOT HUB] Saved event: ${body.event} from ${deviceId}`);
                    } else if (body.event === 'SYNC') {
                        // Handle device sync from MQTT
                        const updatePayload = {
                            activeConfigName: body.activeConfigName || 'NONE'
                        };
                        await Device.findOneAndUpdate(
                            { deviceId },
                            { $set: updatePayload },
                            { new: true, upsert: true }
                        );
                        console.log(`[IOT HUB] Synced device config: ${deviceId}`);
                    } else {
                        console.log(`[IOT HUB] Acknowledged event: ${body.event} from ${deviceId}`);
                    }
                } catch (err) {
                    console.error('[IOT HUB] Error processing message:', err.message);
                }
            }
        },
        processError: async (err, context) => {
            console.error(`[IOT HUB] Error on partition "${context.partitionId}":`, err.message);
        },
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
        console.log('[IOT HUB] Shutting down listener...');
        await subscription.close();
        await consumerClient.close();
        process.exit(0);
    });
}

module.exports = { startIoTHubListener };
