const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema({
    _id: { type: String, required: true }, // unique string ID, e.g. "DK001"
    brandId: { type: String, ref: 'Brand', required: true },
    profileName: { type: String, required: true }, // e.g. "Profile 1"
    manufacturerModel: { type: String, default: '' },
    description: { type: String, default: '' },
    method: { type: String, enum: ['raw', 'encoded'], required: true },
    frequency: { type: Number, default: 38000 },
    supportedModes: [{ type: String }], // e.g., ["cool", "dry", "fan"]
    supportedTemps: {
        min: { type: Number, default: 16 },
        max: { type: Number, default: 30 }
    },
    createdBy: { type: String, default: 'admin' },
    isVerified: { type: Boolean, default: false },
    successCount: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Profile', profileSchema);
