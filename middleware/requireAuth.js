const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async (req, res, next) => {
  let token = null;

  // 1. Read token from HttpOnly cookies (for dashboard browser UI)
  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  // 2. Read token from Authorization header (for mobile app API calls)
  if (!token && req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else {
      token = authHeader;
    }
  }

  if (!token) {
    return res.status(401).send({ error: 'You must be logged in.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    const { userId } = payload;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).send({ error: 'User not found.' });
    }
    
    req.user = user;
    req.userId = user._id;
    next();
  } catch (err) {
    return res.status(401).send({ error: 'Invalid or expired token.' });
  }
};
