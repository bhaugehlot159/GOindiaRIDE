const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  phone: {
    type: String,
    required: true,
    trim: true,
    match: [/^[6-9]\d{9}$/, 'Invalid Indian phone number format'],
    index: true
  },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'user'], default: 'user' },
  failedLoginAttempts: { type: Number, default: 0, min: 0 },
  accountLockedUntil: { type: Date, default: null },
  knownDevices: [{ type: String }],
  lastLoginIp: { type: String },
  refreshToken: { type: String },
  riskScore: { type: Number, default: 0, min: 0, max: 100 },
  lastRiskUpdate: { type: Date, default: Date.now },
  trustedDevices: [{
    fingerprint: { type: String, required: true },
    trustScore: { type: Number, default: 50, min: 0, max: 100 },
    approvalStatus: { type: String, enum: ['pending', 'approved'], default: 'approved' },
    approvalRequired: { type: Boolean, default: false },
    approvedAt: { type: Date, default: null },
    isBlocked: { type: Boolean, default: false },
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now }
  }],
  isTemporarilyBannedUntil: { type: Date, default: null }
}, {
  timestamps: true,
  strict: true
});

userSchema.index({ email: 1, phone: 1 });

module.exports = mongoose.model('User', userSchema);
