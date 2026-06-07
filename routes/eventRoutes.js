const express = require('express');
const router = express.Router();
const eventController = require('../controllers/eventController');
const requireAuth = require('../middleware/requireAuth');

router.post('/', eventController.logEvent);
router.get('/', requireAuth, eventController.getEvents);

module.exports = router;

