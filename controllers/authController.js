const jwt = require('jsonwebtoken');
const User = require('../models/User');

const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET || 'fallback_secret', {
    expiresIn: '7d' // token valid for 7 days
  });
};

const setCookie = (res, token) => {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
};

exports.register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).send({ error: 'Username, email, and password are required.' });
    }

    const existingEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      return res.status(422).send({ error: 'Email is in use.' });
    }

    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return res.status(422).send({ error: 'Username is in use.' });
    }

    // First user is automatically admin
    const userCount = await User.countDocuments();
    const role = userCount === 0 ? 'admin' : 'user';

    const user = new User({ username, email, passwordHash: password, role });
    await user.save();

    const token = generateToken(user._id);
    setCookie(res, token);

    res.status(201).send({
      success: true,
      token,
      user: { id: user._id, username: user.username, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    res.status(500).json({
      error: err.message
    });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, username, password } = req.body;
    const loginIdentifier = email || username;

    if (!loginIdentifier || !password) {
      return res.status(400).send({ error: 'Must provide username/email and password.' });
    }

    // Find user by email OR username
    const user = await User.findOne({
      $or: [
        { email: loginIdentifier.toLowerCase() },
        { username: loginIdentifier }
      ]
    });

    if (!user) {
      return res.status(401).send({ error: 'Invalid username/email or password.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).send({ error: 'Invalid username/email or password.' });
    }

    const token = generateToken(user._id);
    setCookie(res, token);

    res.send({
      success: true,
      token,
      user: { id: user._id, username: user.username, email: user.email, role: user.role }
    });
  } catch (err) {
    return res.status(500).send({ error: err.message });
  }
};

exports.logout = async (req, res) => {
  try {
    res.clearCookie('token');
    res.send({ success: true, message: 'Logged out successfully.' });
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
};

exports.me = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).send({ error: 'Not authenticated.' });
    }
    res.send({
      success: true,
      user: {
        id: req.user._id,
        username: req.user.username,
        email: req.user.email,
        role: req.user.role,
        devices: req.user.devices
      }
    });
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
};

exports.setupStatus = async (req, res) => {
  try {
    const userCount = await User.countDocuments();
    res.send({ success: true, setupRequired: userCount === 0 });
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
};
