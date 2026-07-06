const mongoose = require('mongoose');

const profileCommandSchema = new mongoose.Schema({
    _id: { type: String, required: true }, // e.g. "DK001_POWER_ON"
    profileId: { type: String, ref: 'Profile', required: true, index: true },
    command: { type: String, required: true }, // e.g. "power_on", "temp_24"
    method: { type: String, enum: ['raw', 'encoded'], required: true },
    frequency: { type: Number, default: 38000 },
    
    // Raw Timing Fields
    pattern: { type: [Number], default: undefined }, // Array of microsecond timings

    // Encoded Protocol Fields
    headerMark: { type: Number },
    headerSpace: { type: Number },
    bitMark: { type: Number },
    oneSpace: { type: Number },
    zeroSpace: { type: Number },
    stopMark: { type: Number },
    bits: { type: Number },
    data: [{ type: String }] // Array of hex strings, e.g., ["20DF10EF"]
}, { timestamps: true });

// Ensure unique command per profile
profileCommandSchema.index({ profileId: 1, command: 1 }, { unique: true });

module.exports = mongoose.model('ProfileCommand', profileCommandSchema);
