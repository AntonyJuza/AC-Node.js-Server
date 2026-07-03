const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const requireAuth = require('../middleware/requireAuth');

// All profile routes require authentication
router.use(requireAuth);

router.get('/brands', profileController.getBrands);
router.get('/brand/:brandName', profileController.getProfilesByBrand);
router.get('/brand/:brandName/profile/:profileId', profileController.getProfileByBrandAndId);
router.get('/:id', profileController.getProfileById);

module.exports = router;
