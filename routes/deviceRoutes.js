const express = require('express');
const router = express.Router();
const deviceController = require('../controllers/deviceController');

<<<<<<< HEAD
router.post('/:deviceId/power-on', deviceController.powerOn);
=======
console.log('[DEBUG] deviceController:', deviceController);

>>>>>>> 1b02c2d7a8fafbe6feb2a23a47a62a8204c63ef0
router.post('/sync', deviceController.syncDevice);
router.get('/:deviceId', deviceController.getDevice);
router.post('/:deviceId/command', deviceController.sendCommand);
router.post('/:deviceId/method', deviceController.invokeMethod);

module.exports = router;
