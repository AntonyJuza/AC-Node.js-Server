const mongoose = require('mongoose');

const connectDB = async () => {
    const uri = process.env.MONGO_URI;
    if (!uri) {
        console.error('[MONGO] MONGO_URI is not defined in environment variables.');
        process.exit(1);
    }

    try {
        await mongoose.connect(uri);
        console.log('[MONGO] Connected to MongoDB successfully.');
    } catch (err) {
        console.error('[MONGO] Connection failed:', err.message);
        process.exit(1);
    }
};

module.exports = connectDB;
