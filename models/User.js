const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    unique: true,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    unique: true,
    required: true,
    lowercase: true,
    trim: true,
  },
  passwordHash: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['admin', 'user'],
    default: 'user',
  },
  devices: [String],
  createdAt: {
    type: Date,
    default: Date.now,
  }
});

// Pre-save hook to hash password before saving
UserSchema.pre('save', async function () {
  if (!this.isModified('passwordHash')) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
});

// Method to compare password for login
UserSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

module.exports = mongoose.model('User', UserSchema);
