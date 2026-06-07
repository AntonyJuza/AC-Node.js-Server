const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');

module.exports = async (req, res, next) => {
  const { authorization } = req.headers;

  if (!authorization) {
    return res.status(401).send({ error: 'You must be logged in.' });
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
