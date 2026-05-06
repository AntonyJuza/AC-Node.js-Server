const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema(
    {
        deviceId: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        deviceName: {
            type: String,
            required: false,
            trim: true,
            default: 'Unknown Device',
        },
        activeConfigName: {
            type: String,
            default: 'NONE',
        },
        configData: {
            type: mongoose.Schema.Types.Mixed,
        },
    },
    {
        timestamps: true, // Automatically adds createdAt and updatedAt fields
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

// Virtual field for Indian Standard Time (IST)
deviceSchema.virtual('updatedAtIST').get(function() {
    if (!this.updatedAt) return null;
    return new Date(this.updatedAt).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour12: true,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
});

module.exports = mongoose.model('Device', deviceSchema);
