require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const connectDB = require('./mongoClient');
const { initPostgresDB } = require('./database/postgres');

const deviceRoutes = require('./routes/deviceRoutes');
const eventRoutes = require('./routes/eventRoutes');

const app = express();
const port = process.env.PORT || 3000;

// Connect to MongoDB (for devices, configs)
connectDB();

// Initialize PostgreSQL (for events, analytics)
initPostgresDB();

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Routing
app.use('/api/devices', deviceRoutes);
app.use('/api/events', eventRoutes);

// Health check root endpoint
app.get('/', (req, res) => {
    res.json({ status: 'active', message: 'AC Automation Node.js Backend is running (Hybrid Architecture)' });
});

// Start the server
app.listen(port, '0.0.0.0', () => {
    console.log(`[SERVER] Listening on http://0.0.0.0:${port}`);
    console.log(`[ROUTE] Devices API active at /api/devices`);
    console.log(`[ROUTE] Events API active at /api/events`);
});
