const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { pool } = require('../database/postgres');

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

    const emailCheck = await pool.query('SELECT 1 FROM users WHERE email = $1', [email.toLowerCase()]);
    if (emailCheck.rows.length > 0) {
      return res.status(422).send({ error: 'Email is in use.' });
    }

    const usernameCheck = await pool.query('SELECT 1 FROM users WHERE username = $1', [username]);
    if (usernameCheck.rows.length > 0) {
      return res.status(422).send({ error: 'Username is in use.' });
    }

    // First user is automatically admin
    const countResult = await pool.query('SELECT COUNT(*) FROM users');
    const userCount = parseInt(countResult.rows[0].count, 10);
    const role = userCount === 0 ? 'admin' : 'user';

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const insertResult = await pool.query(
      'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role, devices',
      [username, email.toLowerCase(), passwordHash, role]
    );
    const user = insertResult.rows[0];

    const token = generateToken(user.id);
    setCookie(res, token);

    res.status(201).send({
      success: true,
      token,
      user: { id: user.id, username: user.username, email: user.email, role: user.role }
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
    const result = await pool.query(
      'SELECT id, username, email, password_hash, role FROM users WHERE email = $1 OR username = $1',
      [loginIdentifier.toLowerCase()]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(401).send({ error: 'Invalid username/email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).send({ error: 'Invalid username/email or password.' });
    }

    const token = generateToken(user.id);
    setCookie(res, token);

    res.send({
      success: true,
      token,
      user: { id: user.id, username: user.username, email: user.email, role: user.role }
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
        id: req.user.id,
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
    const countResult = await pool.query('SELECT COUNT(*) FROM users');
    const userCount = parseInt(countResult.rows[0].count, 10);
    res.send({ success: true, setupRequired: userCount === 0 });
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
};
