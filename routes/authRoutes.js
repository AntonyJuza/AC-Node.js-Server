const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const requireAuth = require('../middleware/requireAuth');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.get('/me', requireAuth, authController.me);
router.get('/setup-status', authController.setupStatus);

module.exports = router;
