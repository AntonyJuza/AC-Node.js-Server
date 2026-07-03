const mongoose = require('mongoose');

const buttonSchema = new mongoose.Schema({
    method: { type: String, required: true },
    frequency: { type: Number, required: true },
    pattern: { type: [Number], required: true }
}, { _id: false });

const acProfileSchema = new mongoose.Schema(
    {
        profileId: { type: Number, required: true, unique: true },
        brand: { type: String, required: true, trim: true },
        buttons: { type: Map, of: buttonSchema, required: true }
    },
    {
        timestamps: true
    }
);

// Index on brand for quick lookups
acProfileSchema.index({ brand: 1 });

module.exports = mongoose.model('AcProfile', acProfileSchema);
