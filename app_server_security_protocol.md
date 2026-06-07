# App-to-Server Security Protocol Design

**Version:** 1.0  
**Date:** June 2026  
**Scope:** Node.js Backend (`AC-Node.js-Server`)

---

## Problem

Currently, the REST API has **zero authentication**. Any client on the internet can:

| Risk | Example |
|---|---|
| Control any device | `POST /api/devices/AC_1CC3ABC25754/power-on` |
| Read device states | `GET /api/devices` |
| Read event history | `GET /api/events` |
| Sync/overwrite device config | `POST /api/devices/sync` |

The ESP32→Server channel (MQTT over TLS, port 8883) is already secured with username/password and ACL rules. But the **App→Server channel** (HTTP REST API, port 3000) is completely open.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                    SECURED CHANNELS                          │
│                                                              │
│  ┌─────────┐   HTTPS + JWT    ┌──────────────┐   MQTT/TLS  │
│  │ Flutter  │ ◄──────────────► │  Node.js     │ ◄──────────►│
│  │   App    │                  │  Backend     │              │
│  └─────────┘                  └──────┬───────┘              │
│                                      │                      │
│                                      │                      │
│                               ┌──────▼───────┐              │
│                               │  Mosquitto   │              │
│                               │  MQTT Broker │              │
│                               └──────┬───────┘              │
│                                      │ TLS + Auth            │
│                               ┌──────▼───────┐              │
│                               │    ESP32     │              │
│                               │  AC Device   │              │
│                               └──────────────┘              │
└──────────────────────────────────────────────────────────────┘
```

---

## Security Layers

### Layer 1: HTTPS (Transport Encryption)

All App↔Server communication must use HTTPS to prevent packet sniffing.

**Options (choose one):**

| Method | Complexity | Recommendation |
|---|---|---|
| Nginx reverse proxy with Let's Encrypt | Low | **Recommended** — Already have `iot.techenablesme.com` domain |
| Express `https` module with self-signed certs | Medium | Not recommended for production |
| Cloudflare proxy | Low | Good if using Cloudflare DNS |

**Nginx config example:**

```nginx
server {
    listen 443 ssl;
    server_name iot.techenablesme.com;

    ssl_certificate     /etc/letsencrypt/live/iot.techenablesme.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/iot.techenablesme.com/privkey.pem;

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api/stream {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
    }
}

server {
    listen 80;
    server_name iot.techenablesme.com;
    return 301 https://$host$request_uri;
}
```

---

### Layer 2: User Authentication (JWT)

#### User Model (MongoDB)

```javascript
// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    passwordHash: {
        type: String,
        required: true
    },
    name: {
        type: String,
        trim: true,
        default: ''
    },
    devices: [{
        type: String  // Array of deviceId strings owned by this user
    }]
}, { timestamps: true });

// Hash password before save
userSchema.pre('save', async function(next) {
    if (!this.isModified('passwordHash')) return next();
    this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
    next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.passwordHash);
};

module.exports = mongoose.model('User', userSchema);
```

#### Auth Endpoints

```
POST /api/auth/register   — Create a new user account
POST /api/auth/login      — Authenticate and receive JWT
POST /api/auth/refresh    — Refresh an expiring token (optional)
```

#### JWT Payload

```json
{
  "userId": "665abc123def456789012345",
  "email": "user@example.com",
  "iat": 1780750000,
  "exp": 1780836400
}
```

- **Signing algorithm:** HS256
- **Secret:** Stored in `.env` as `JWT_SECRET`
- **Token lifetime:** 24 hours (configurable)
- **Refresh token:** Optional, stored in HttpOnly cookie or DB

#### .env additions

```env
JWT_SECRET=your_super_secret_random_string_here_min_32_chars
JWT_EXPIRY=24h
```

---

### Layer 3: Auth Middleware

```javascript
// middleware/requireAuth.js
const jwt = require('jsonwebtoken');

const requireAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;  // { userId, email }
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};

module.exports = requireAuth;
```

---

### Layer 4: Device Ownership Verification

When a user registers a device via the Flutter app (after BLE provisioning), the app calls:

```
POST /api/devices/claim
Body: { "deviceId": "AC_1CC3ABC25754" }
Header: Authorization: Bearer <jwt>
```

The server links the `deviceId` to the user's `devices[]` array.

#### Ownership Middleware

```javascript
// middleware/verifyDeviceOwnership.js
const User = require('../models/User');

const verifyDeviceOwnership = async (req, res, next) => {
    const { deviceId } = req.params;
    const { userId } = req.user;  // Set by requireAuth

    const user = await User.findById(userId);
    if (!user || !user.devices.includes(deviceId)) {
        return res.status(403).json({
            error: 'You do not have permission to control this device'
        });
    }

    next();
};

module.exports = verifyDeviceOwnership;
```

---

## Endpoint Security Matrix

| Endpoint | Auth Required | Ownership Check | Purpose |
|---|---|---|---|
| `POST /api/auth/register` | ✗ No | ✗ No | Create account |
| `POST /api/auth/login` | ✗ No | ✗ No | Get JWT |
| `GET /api/devices` | ✓ Yes | Filtered | List only user's devices |
| `GET /api/devices/:deviceId` | ✓ Yes | ✓ Yes | Get device details |
| `POST /api/devices/:deviceId/power-on` | ✓ Yes | ✓ Yes | Control device |
| `POST /api/devices/:deviceId/command` | ✓ Yes | ✓ Yes | Send arbitrary command |
| `POST /api/devices/sync` | ✓ Yes | ✓ Yes | Update device config |
| `POST /api/devices/claim` | ✓ Yes | ✗ No | Register ownership |
| `GET /api/events` | ✓ Yes | Filtered | Only user's device events |
| `GET /api/stream` | ✓ Yes | Filtered | Only user's device updates |
| `GET /status` | ✗ No | ✗ No | Health check |

---

## Route Changes

### Updated `deviceRoutes.js`

```javascript
const express = require('express');
const router = express.Router();
const deviceController = require('../controllers/deviceController');
const requireAuth = require('../middleware/requireAuth');
const verifyDeviceOwnership = require('../middleware/verifyDeviceOwnership');

// All device routes require authentication
router.use(requireAuth);

router.get('/', deviceController.getDevices);                              // Filtered by ownership
router.post('/sync', deviceController.syncDevice);                         // Ownership checked inside
router.post('/claim', deviceController.claimDevice);                       // NEW: register ownership
router.get('/:deviceId', verifyDeviceOwnership, deviceController.getDevice);
router.post('/:deviceId/command', verifyDeviceOwnership, deviceController.sendCommand);
router.post('/:deviceId/method', verifyDeviceOwnership, deviceController.invokeMethod);
router.post('/:deviceId/power-on', verifyDeviceOwnership, deviceController.powerOn);

module.exports = router;
```

### New `authRoutes.js`

```javascript
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/register', authController.register);
router.post('/login', authController.login);

module.exports = router;
```

### Updated `index.js`

```javascript
// Add this line with the other route imports:
const authRoutes = require('./routes/authRoutes');

// Add this line with the other app.use() calls:
app.use('/api/auth', authRoutes);
```

---

## Flutter App Changes Required

### Login Flow

```
App Start
    ↓
Has saved JWT?
    │
    ├── YES → Validate token → if expired → /api/auth/login
    │
    └── NO → Show Login/Register screen → /api/auth/register or /login
                ↓
         Save JWT in secure storage (flutter_secure_storage)
                ↓
         All subsequent API calls include:
         Header: "Authorization: Bearer <jwt>"
```

### Device Claiming Flow

```
BLE provisioning complete → WiFi set → MQTT connected →
    ↓
App calls POST /api/devices/claim with deviceId
    ↓
Server links deviceId to user account
    ↓
User can now control this device from anywhere
```

---

## Dependencies Required

```bash
npm install bcryptjs jsonwebtoken
```

These are lightweight, well-maintained, and have no native compilation requirements.

---

## What Does NOT Change

| Component | Status |
|---|---|
| ESP32 firmware | Unchanged — no auth changes needed on device |
| MQTT broker credentials | Unchanged — device auth handled separately |
| MQTT ACL rules | Unchanged |
| PostgreSQL schema | Unchanged |
| Mosquitto configuration | Unchanged |
| BLE command protocol | Unchanged |

---

## Implementation Priority

| Step | What | Effort |
|---|---|---|
| 1 | HTTPS via Nginx + Let's Encrypt | 30 min (server-side) |
| 2 | User model + auth endpoints | 1 hour |
| 3 | Auth middleware + route protection | 30 min |
| 4 | Device ownership + claim endpoint | 30 min |
| 5 | Flutter app login UI + secure storage | 2-3 hours |
| 6 | Flutter app: send JWT with all API calls | 30 min |

**Total backend effort:** ~2.5 hours  
**Total app effort:** ~3 hours
