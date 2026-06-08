const express = require('express');
const router = express.Router();
const deviceController = require('../controllers/deviceController');
const requireAuth = require('../middleware/requireAuth');
const verifyDeviceOwnership = require('../middleware/verifyDeviceOwnership');

// All device routes require authentication
router.use(requireAuth);

router.get('/', deviceController.getDevices);
router.post('/sync', deviceController.syncDevice);
router.post('/claim', deviceController.claimDevice);
router.get('/:deviceId', verifyDeviceOwnership, deviceController.getDevice);
router.post('/:deviceId/command', verifyDeviceOwnership, deviceController.sendCommand);
router.post('/:deviceId/method', verifyDeviceOwnership, deviceController.invokeMethod);
router.post('/:deviceId/power-on', verifyDeviceOwnership, deviceController.powerOn);
router.post('/:deviceId/power-off', verifyDeviceOwnership, deviceController.powerOff);

module.exports = router;

