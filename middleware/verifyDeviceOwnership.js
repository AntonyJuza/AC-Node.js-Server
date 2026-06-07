const User = require('../models/User');

const verifyDeviceOwnership = async (req, res, next) => {
    try {
        const { deviceId } = req.params;
        const { userId } = req.user;  // Set by requireAuth

        if (!deviceId) {
            return res.status(400).json({ error: 'Missing deviceId parameter' });
        }

        const user = await User.findById(userId);
        if (!user || !user.devices.includes(deviceId)) {
            return res.status(403).json({
                error: 'You do not have permission to control or view this device'
            });
        }

        next();
    } catch (err) {
        console.error('[OWNERSHIP MIDDLEWARE ERROR]', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = verifyDeviceOwnership;
