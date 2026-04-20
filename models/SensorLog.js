const mongoose = require('mongoose');

const sensorLogSchema = new mongoose.Schema(
    {
        deviceId: {
            type: String,
            required: true,
            trim: true,
        },
        deviceName: {
            type: String,
            required: false,
            trim: true,
            default: 'Unknown Device',
        },
        event: {
            type: String,
            required: true,
            trim: true,
        },
    },
    {
        timestamps: true, // Automatically adds createdAt and updatedAt fields
    }
);

module.exports = mongoose.model('SensorLog', sensorLogSchema);
