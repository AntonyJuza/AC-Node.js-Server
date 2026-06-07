module.exports = async (req, res, next) => {
  const { deviceId } = req.params;
  const user = req.user;

  if (!user) {
    return res.status(401).send({ error: 'You must be logged in.' });
  }

  if (!deviceId) {
    return res.status(400).send({ error: 'Device ID is required.' });
  }

  if (!user.devices.includes(deviceId)) {
    return res.status(403).send({ error: 'Forbidden. You do not own this device.' });
  }

  next();
};
