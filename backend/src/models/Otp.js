const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  accountType: {
    type: String,
    enum: ['customer', 'driver', 'admin'],
    required: true,
    index: true
  },
  purpose: {
    type: String,
    enum: ['login', 'password_reset'],
    default: 'login',
    index: true
  },
  channel: {
    type: String,
    enum: ['email', 'sms'],
    required: true,
    index: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    index: true,
    default: null
  },
  phone: {
    type: String,
    trim: true,
    index: true,
    match: [/^[6-9]\d{9}$/, 'Invalid Indian phone number format'],
    default: null
  },
  identifier: {
    type: String,
    required: true,
    index: true
  },
  otpHash: {
    type: String,
    required: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  attempts: {
    type: Number,
    default: 0,
    min: 0
  },
  lastSentAt: {
    type: Date,
    default: null
  },
  sendCount: {
    type: Number,
    default: 0,
    min: 0
  },
  ip: { type: String, default: null },
  deviceFingerprint: { type: String, default: null },
  verifiedAt: { type: Date, default: null }
}, { timestamps: true });

otpSchema.pre('validate', function preValidate(next) {
  if (this.channel === 'email') {
    if (!this.email) return next(new Error('Email is required for email OTP'));
    this.identifier = this.email.toLowerCase().trim();
    this.phone = null;
  }

  if (this.channel === 'sms') {
    if (!this.phone) return next(new Error('Phone is required for sms OTP'));
    this.identifier = String(this.phone).trim();
    this.email = null;
  }

  return next();
});

otpSchema.index(
  { identifier: 1, channel: 1, accountType: 1, purpose: 1 },
  { unique: true }
);

otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Otp', otpSchema);


