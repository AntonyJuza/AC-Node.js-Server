require('dotenv').config();
require("./src/mqtt/subscriber");
const path = require('path');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const connectDB = require('./mongoClient');
const { initPostgresDB } = require('./database/postgres');

const deviceRoutes = require('./routes/deviceRoutes');
const eventRoutes = require('./routes/eventRoutes');
const authRoutes = require('./routes/authRoutes');
const profileRoutes = require('./routes/profileRoutes');
const appEmitter = require('./src/events/eventEmitter');

const app = express();
app.set('trust proxy', 1);
const port = process.env.PORT || 3000;

// Connect to MongoDB (for devices, configs)
connectDB();

// Initialize PostgreSQL (for events, analytics)
initPostgresDB();

// Security and utility middleware
app.use(helmet({
    contentSecurityPolicy: false // Disable CSP to avoid breaking inline scripts/styles/CDNs in dashboard
}));
app.use(cookieParser());
app.use(cors({
    origin: true, // Allow dynamically reflecting the origin
    credentials: true // Allow cookies
}));
app.use(express.json());
app.use(morgan('dev'));

// Rate limiting setup
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 mins
    max: 1000, // Limit each IP to 1000 requests per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 mins
    max: 20, // Limit login/register to 20 attempts per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts, please try again after 15 minutes.' }
});

// Apply rate limiting
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api', apiLimiter);

// Serve Web UI static files
app.use(express.static(path.join(__dirname, 'public')));

// Routing
app.use('/api/auth', authRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/profiles', profileRoutes);

// Health check root endpoint (keep JSON for API clients, UI is served via static)
app.get('/status', (req, res) => {
    res.json({ status: 'active', message: 'AVIO Node.js Backend is running (Hybrid Architecture)' });
});

// SSE endpoint for live UI updates
app.get('/api/stream', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });
    
    const sendUpdate = () => res.write(`data: update\n\n`);
    appEmitter.on('device_update', sendUpdate);
    
    req.on('close', () => {
        appEmitter.off('device_update', sendUpdate);
    });
});

// Start the server
app.listen(port, '0.0.0.0', () => {
    console.log(`[SERVER] Listening on http://0.0.0.0:${port}`);
    console.log(`[ROUTE] Devices API active at /api/devices`);
    console.log(`[ROUTE] Events API active at /api/events`);
});
