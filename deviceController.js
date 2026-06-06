require('dotenv').config();
const { publishCommand } = require('./src/mqtt/publisher');

exports.powerOn = async (req, res) => {

    const { deviceId } = req.params;

    publishCommand(deviceId, 'power_on');

    return res.json({
        success: true,
        deviceId
    });
};
