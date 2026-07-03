const mongoose = require('mongoose');

const buttonSchema = new mongoose.Schema({
    method: { type: String, required: true },
    frequency: { type: Number, required: true },
    pattern: { type: [Number], required: true }
}, { _id: false });

const acProfileSchema = new mongoose.Schema(
    {
        profileId: { type: Number, required: true },
        brand: { type: String, required: true, trim: true },
        buttons: { type: Map, of: buttonSchema, required: true }
    },
    {
        timestamps: true
    }
);

// Compound unique index so profileId is unique PER brand, and easy to query/sort
acProfileSchema.index({ brand: 1, profileId: 1 }, { unique: true });

module.exports = mongoose.model('AcProfile', acProfileSchema);
