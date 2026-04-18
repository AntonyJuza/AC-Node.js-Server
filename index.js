require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const routes = require('./routes');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Routing
// The ESP32 code directly hits /rest/v1/sensor_logs to simulate Supabase API. 
// We will intercept that route here and forward it appropriately.
app.use('/rest/v1', routes);
// We also expose /api for general usage
app.use('/api', routes);

// Health check root endpoint
app.get('/', (req, res) => {
    res.json({ status: 'active', message: 'AC Automation Node.js Backend is running' });
});

// Start the server
app.listen(port, '0.0.0.0', () => {
    console.log(`[SERVER] Listening on http://0.0.0.0:${port}`);
    console.log(`[ROUTE] ESP32 endpoint active at /rest/v1/sensor_logs`);
});
