const Brand = require('../models/Brand');
const Profile = require('../models/Profile');
const ProfileCommand = require('../models/ProfileCommand');

// Get all unique brands available
exports.getBrands = async (req, res) => {
    try {
        const brandsObj = await Brand.find({ isActive: true });
        res.json({ success: true, brands: brandsObj.map(b => b.name) });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// Get list of profiles by brand name (excluding massive button patterns for quick list load)
exports.getProfilesByBrand = async (req, res) => {
    try {
        const { brandName } = req.params;
        const brand = await Brand.findOne({ name: new RegExp(`^${brandName}$`, 'i') });
        if (!brand) {
            return res.json({ success: true, profiles: [] });
        }
        
        const profiles = await Profile.find({ brandId: brand._id }).sort({ _id: 1 });
        
        const mappedProfiles = profiles.map(p => ({
            _id: p._id,
            profileId: parseInt(p._id.replace(/[^0-9]/g, '')) || 1,
            brand: brand.name
        }));
        
        res.json({ success: true, profiles: mappedProfiles });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// Get detailed profile (with patterns) by unique Database ID (_id)
exports.getProfileById = async (req, res) => {
    try {
        const { id } = req.params;
        const profileObj = await Profile.findById(id).populate('brandId');
        if (!profileObj) {
            return res.status(404).json({ success: false, error: 'Profile not found' });
        }
        
        const commands = await ProfileCommand.find({ profileId: id });
        const buttons = {};
        
        commands.forEach(cmd => {
            const displayName = cmd.command.toUpperCase().replace(/_/g, ' ');
            const buttonData = cmd.method === 'raw' ? {
                method: 'raw',
                frequency: cmd.frequency,
                pattern: cmd.pattern
            } : {
                method: 'encoded',
                frequency: cmd.frequency,
                hdrMark: cmd.headerMark,
                hdrSpace: cmd.headerSpace,
                bitMark: cmd.bitMark,
                oneSpace: cmd.oneSpace,
                zeroSpace: cmd.zeroSpace,
                stopMark: cmd.stopMark,
                bits: cmd.bits,
                hexData: cmd.data
            };
            buttons[cmd.command] = buttonData;
            buttons[displayName] = buttonData;
        });

        const brandName = profileObj.brandId ? profileObj.brandId.name : 'Unknown';
        const profileIdNum = parseInt(id.replace(/[^0-9]/g, '')) || 1;

        res.json({
            success: true,
            profile: {
                _id: profileObj._id,
                profileId: profileIdNum,
                brand: brandName,
                buttons,
                createdAt: profileObj.createdAt,
                updatedAt: profileObj.updatedAt
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// Get detailed profile by brand name and profile ID
exports.getProfileByBrandAndId = async (req, res) => {
    try {
        const { brandName, profileId } = req.params;
        const brand = await Brand.findOne({ name: new RegExp(`^${brandName}$`, 'i') });
        if (!brand) {
            return res.status(404).json({ success: false, error: 'Profile not found' });
        }
        
        const profileIdStr = `${brand._id.substring(0, 2).toUpperCase()}${String(profileId).padStart(3, '0')}`;
        const profileObj = await Profile.findById(profileIdStr);
        if (!profileObj) {
            return res.status(404).json({ success: false, error: 'Profile not found' });
        }
        
        const commands = await ProfileCommand.find({ profileId: profileIdStr });
        const buttons = {};
        
        commands.forEach(cmd => {
            const displayName = cmd.command.toUpperCase().replace(/_/g, ' ');
            const buttonData = cmd.method === 'raw' ? {
                method: 'raw',
                frequency: cmd.frequency,
                pattern: cmd.pattern
            } : {
                method: 'encoded',
                frequency: cmd.frequency,
                hdrMark: cmd.headerMark,
                hdrSpace: cmd.headerSpace,
                bitMark: cmd.bitMark,
                oneSpace: cmd.oneSpace,
                zeroSpace: cmd.zeroSpace,
                stopMark: cmd.stopMark,
                bits: cmd.bits,
                hexData: cmd.data
            };
            buttons[cmd.command] = buttonData;
            buttons[displayName] = buttonData;
        });

        res.json({
            success: true,
            profile: {
                _id: profileObj._id,
                profileId: parseInt(profileId),
                brand: brand.name,
                buttons,
                createdAt: profileObj.createdAt,
                updatedAt: profileObj.updatedAt
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
