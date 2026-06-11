const { pool } = require('../database/postgres');

module.exports = async (req, res, next) => {
  const { deviceId } = req.params;
  const user = req.user;

  if (!user) {
    return res.status(401).send({ error: 'You must be logged in.' });
  }

  // Administrators bypass device ownership checks entirely
  if (user.role === 'admin') {
    return next();
  }

  if (!deviceId) {
    return res.status(400).send({ error: 'Device ID is required.' });
  }

  try {
    const ownershipCheck = await pool.query(
      'SELECT 1 FROM device_ownership WHERE user_id = $1 AND device_id = $2',
      [user.id, deviceId]
    );
    if (ownershipCheck.rows.length === 0) {
      return res.status(403).send({ error: 'Forbidden. You do not own this device.' });
    }
    next();
  } catch (err) {
    console.error('[VERIFY OWNERSHIP ERROR]', err);
    return res.status(500).send({ error: 'Internal Server Error' });
  }
};
