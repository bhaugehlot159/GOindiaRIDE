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

  accountType: {
  type: String,
  enum: ["customer", "driver", "admin"],
  default: "customer",
},

isPhoneVerified: {
  type: Boolean,
  default: false,
},

  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'user'], default: 'user' },
  failedLoginAttempts: { type: Number, default: 0, min: 0 },
  accountLockedUntil: { type: Date, default: null },
  knownDevices: [{ type: String }],
  lastLoginIp: { type: String },
  refreshToken: { type: String },
  
  refreshTokens: [{
  tokenHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date },
  ip: { type: String },
  deviceFingerprint: { type: String, default: null },
  userAgent: { type: String },
  lastUsedAt: { type: Date },
  sessionId: { type: String },
  sessionStartedAt: { type: Date },
}],

  twoFactorSecret: { type: String, default: null },
  isTwoFactorEnabled: { type: Boolean, default: false },

  riskScore: { type: Number, default: 0, min: 0, max: 100 },
  lastRiskUpdate: { type: Date, default: Date.now },
  
  trustedDevices: [{
  fingerprint: { type: String, required: true },
  trustScore: { type: Number, default: 50, min: 0, max: 100 },
  firstSeenAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
  approvedAt: { type: Date, default: null },
  label: { type: String, default: null },
  ip: { type: String, default: null },
  userAgent: { type: String, default: null },
  isBlocked: { type: Boolean, default: false },

  blockedAt: { type: Date, default: null },

approvalStatus: {
  type: String,
  enum: ["approved", "pending", "rejected"],
  default: "approved"
},
approvalRequired: {
  type: Boolean,
  default: false
},
approvalRequestedAt: {
  type: Date,
  default: null
},
approvedBySessionId: {
  type: String,
  default: null
},
approvalMethod: {
  type: String,
  enum: ["legacy_auto", "manual", "admin"],
  default: "legacy_auto"
},
rejectedAt: {
  type: Date,
  default: null
},
rejectionReason: {
  type: String,
  default: null
},
}],

isTemporarilyBannedUntil: { type: Date, default: null }
}, {
  timestamps: true,
  strict: true
});

userSchema.index({ phone: 1 });
userSchema.index({ email: 1, phone: 1 });

module.exports = mongoose.model('User', userSchema);
