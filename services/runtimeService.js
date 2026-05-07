const { pool } = require('../database/postgres');

/**
 * Service to calculate daily, monthly runtime based on Postgres events
 */
class RuntimeService {
    static async getDailyRuntime(deviceId) {
        // Future SQL query logic to pair AC_ON and AC_OFF events
        return { deviceId, status: "Not implemented yet, ready for SQL analytics!" };
    }
}

module.exports = RuntimeService;
