const mongoose = require('mongoose');

const brandSchema = new mongoose.Schema({
    _id: { type: String, required: true }, // lowercase string, e.g. "daikin"
    name: { type: String, required: true, unique: true },
    logo: { type: String, default: '' },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Brand', brandSchema);
