const express = require('express');
const router = express.Router();
const deviceController = require('../controllers/deviceController');

console.log('[DEBUG] deviceController:', deviceController);

router.post('/sync', deviceController.syncDevice);
router.get('/:deviceId', deviceController.getDevice);
router.post('/:deviceId/command', deviceController.sendCommand);
router.post('/:deviceId/method', deviceController.invokeMethod);

module.exports = router;
