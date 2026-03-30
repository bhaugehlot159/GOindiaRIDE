const mongoose = require('mongoose');

const userTokenTemporalIntegrityStateSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  status: {
    type: String,
    enum: ['active', 'quarantined', 'released'],
    default: 'active',
    index: true
  },
  escalationLevel: { type: Number, min: 0, default: 0 },
  suspiciousCount: { type: Number, min: 0, default: 0 },
  windowStartAt: { type: Date, default: null, index: true },
  windowAnomalyCount: { type: Number, min: 0, default: 0 },
  windowMissingClaimCount: { type: Number, min: 0, default: 0 },
  quarantineUntil: { type: Date, default: null, index: true },
  lastSeenAt: { type: Date, default: null, index: true },
  lastTokenIssuedAt: { type: Date, default: null },
  lastTokenExpiresAt: { type: Date, default: null },
  lastTokenNotBeforeAt: { type: Date, default: null },
  lastPath: { type: String, default: '', trim: true },
  lastIp: { type: String, default: '', trim: true, index: true },
  lastReason: { type: String, default: '', trim: true },
  metadata: { type: Object, default: {} },
  expiresAt: { type: Date, required: true, index: true }
}, {
  timestamps: true,
  strict: true
});

userTokenTemporalIntegrityStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
userTokenTemporalIntegrityStateSchema.index({ status: 1, updatedAt: -1 });

module.exports = mongoose.model('UserTokenTemporalIntegrityState', userTokenTemporalIntegrityStateSchema);
