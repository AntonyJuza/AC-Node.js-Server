const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const { pool } = require('../database/postgres');

module.exports = async (req, res, next) => {
  const { authorization } = req.headers;

  if (!authorization) {
    try {
      // Find or create default developer user for local UI access
      let user = await User.findOne({ email: 'dev@example.com' });
      if (!user) {
        user = await User.findOne(); // fallback to any existing user
      }
      if (!user) {
        user = new User({
          name: 'Default Developer',
          email: 'dev@example.com',
          password: 'password123',
          devices: []
        });
        await user.save();
      }

      // Automatically claim any device found in Postgres database
      const { rows } = await pool.query('SELECT device_id FROM devices');
      let updated = false;
      rows.forEach(row => {
        if (!user.devices.includes(row.device_id)) {
          user.devices.push(row.device_id);
          updated = true;
        }
      });
      if (updated) {
        await user.save();
      }

      req.user = user;
      req.userId = user._id;
      return next();
    } catch (err) {
      console.error('[AUTH BYPASS ERROR]', err);
      return res.status(401).send({ error: 'You must be logged in.' });
    }
  }

  const token = authorization.replace('Bearer ', '');
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const { userId } = payload;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).send({ error: 'User not found.' });
    }
    
    req.user = user;
    req.userId = user._id;
    next();
  } catch (err) {
    return res.status(401).send({ error: 'Invalid token.' });
  }
};
