const User = require('../models/User');
const jwt = require('jsonwebtoken');

const register = async (req, res) => {
    try {
        const { email, password, name } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'User with this email already exists' });
        }

        // Create new user
        const user = new User({
            email,
            passwordHash: password,
            name: name || ''
        });

        await user.save();

        // Generate JWT
        const secret = process.env.JWT_SECRET || 'default_jwt_secret_key_change_in_production_12345';
        const expiry = process.env.JWT_EXPIRY || '24h';
        const token = jwt.sign(
            { userId: user._id, email: user.email },
            secret,
            { expiresIn: expiry }
        );

        return res.status(201).json({
            success: true,
            token,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                devices: user.devices
            }
        });
    } catch (err) {
        console.error('[AUTH REGISTER ERROR]', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Compare password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Generate JWT
        const secret = process.env.JWT_SECRET || 'default_jwt_secret_key_change_in_production_12345';
        const expiry = process.env.JWT_EXPIRY || '24h';
        const token = jwt.sign(
            { userId: user._id, email: user.email },
            secret,
            { expiresIn: expiry }
        );

        return res.status(200).json({
            success: true,
            token,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                devices: user.devices
            }
        });
    } catch (err) {
        console.error('[AUTH LOGIN ERROR]', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { register, login };
