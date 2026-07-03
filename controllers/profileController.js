const AcProfile = require('../models/AcProfile');

// Get all unique brands available
exports.getBrands = async (req, res) => {
    try {
        const brands = await AcProfile.distinct('brand');
        res.json({ success: true, brands });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// Get list of profiles by brand name (excluding massive button patterns for quick list load)
exports.getProfilesByBrand = async (req, res) => {
    try {
        const { brandName } = req.params;
        const profiles = await AcProfile.find({ brand: new RegExp(`^${brandName}$`, 'i') })
            .select('profileId brand')
            .sort({ profileId: 1 });
        res.json({ success: true, profiles });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// Get detailed profile (with patterns) by unique Database ID (_id)
exports.getProfileById = async (req, res) => {
    try {
        const { id } = req.params;
        const profile = await AcProfile.findById(id);
        if (!profile) {
            return res.status(404).json({ success: false, error: 'Profile not found' });
        }
        res.json({ success: true, profile });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// Get detailed profile by brand name and profile ID
exports.getProfileByBrandAndId = async (req, res) => {
    try {
        const { brandName, profileId } = req.params;
        const profile = await AcProfile.findOne({
            brand: new RegExp(`^${brandName}$`, 'i'),
            profileId: parseInt(profileId)
        });
        if (!profile) {
            return res.status(404).json({ success: false, error: 'Profile not found' });
        }
        res.json({ success: true, profile });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
