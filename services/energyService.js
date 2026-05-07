const { pool } = require('../database/postgres');

/**
 * Service to calculate energy consumption and costs based on runtimes
 */
class EnergyService {
    static async getMonthlyCost(deviceId) {
        // Future logic for monthly cost
        return { deviceId, cost: 0.0 };
    }
}

module.exports = EnergyService;
