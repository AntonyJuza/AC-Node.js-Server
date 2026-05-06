require('dotenv').config();

// Polyfill global crypto for Node 16 (Required by newer Azure SDKs)
const webcrypto = require('crypto').webcrypto;
if (!globalThis.crypto) {
    globalThis.crypto = webcrypto;
}
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const connectDB = require('./mongoClient');
const routes = require('./routes');
const { startIoTHubListener } = require('./iotHubClient');
const { initServiceClient } = require('./iotHubService');
const app = express();
const port = process.env.PORT || 3000;

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Routing
// The ESP32 code directly hits /rest/v1/sensor_logs to simulate Supabase API.
// We intercept that route here and save to MongoDB instead.
app.use('/rest/v1', routes);
// Also expose /api for general usage
app.use('/api', routes);

// Health check root endpoint
app.get('/', (req, res) => {
    res.json({ status: 'active', message: 'AC Automation Node.js Backend is running (MongoDB)' });
});

// Start the server
app.listen(port, '0.0.0.0', async () => {
    console.log(`[SERVER] Listening on http://0.0.0.0:${port}`);
    console.log(`[ROUTE] ESP32 endpoint active at /rest/v1/sensor_logs`);

    // Start Azure IoT Hub integration
    try {
        await initServiceClient();
        await startIoTHubListener();
    } catch (err) {
        console.error('[IOT HUB] Failed to initialize:', err.message);
        console.warn('[IOT HUB] Server continues without IoT Hub integration.');
    }
});
