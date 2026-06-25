const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { pool } = require('../database/postgres');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

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
      'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role',
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

    const ownedDevicesResult = await pool.query(
      'SELECT device_id FROM device_ownership WHERE user_id = $1',
      [req.user.id]
    );
    const devices = ownedDevicesResult.rows.map(r => r.device_id);

    res.send({
      success: true,
      user: {
        id: req.user.id,
        username: req.user.username,
        email: req.user.email,
        role: req.user.role,
        devices: devices
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

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required." });
    }

    const result = await pool.query('SELECT id, email FROM users WHERE email = $1', [email.toLowerCase()]);
    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 1000 * 60 * 15); // 15 mins

    await pool.query(
      'UPDATE users SET reset_password_token = $1, reset_password_expires = $2 WHERE id = $3',
      [token, expires, user.id]
    );

    const frontendUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
    const resetLink = `${frontendUrl}/reset-password/${token}`;

    console.log(`[PASSWORD RESET] Link generated for user ${user.email}: ${resetLink}`);

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      to: user.email,
      subject: "Password Reset",
      html: `<p>Click below to reset password:</p>
             <a href="${resetLink}">${resetLink}</a>`,
    });

    res.json({ message: "Reset email sent" });
  } catch (err) {
    console.error("FORGOT PASSWORD ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: "Password is required." });
    }

    const result = await pool.query(
      'SELECT id FROM users WHERE reset_password_token = $1 AND reset_password_expires > $2',
      [token, new Date()]
    );
    const user = result.rows[0];

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired token" });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    await pool.query(
      'UPDATE users SET password_hash = $1, reset_password_token = NULL, reset_password_expires = NULL WHERE id = $2',
      [passwordHash, user.id]
    );

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("RESET PASSWORD ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.checkEmail = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).send({ error: 'Email is required.' });
    }
    const result = await pool.query('SELECT 1 FROM users WHERE email = $1', [email.toLowerCase()]);
    return res.send({
      success: true,
      exists: result.rows.length > 0
    });
  } catch (err) {
    console.error("CHECK EMAIL ERROR:", err);
    return res.status(500).send({ error: err.message });
  }
};

