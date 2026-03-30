const mongoose = require('mongoose');

const refreshTokenReplayStateSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  status: {
    type: String,
    enum: ['active', 'compromised', 'released'],
    default: 'active',
    index: true
  },
  seenCount: { type: Number, min: 0, default: 0 },
  suspiciousCount: { type: Number, min: 0, default: 0 },
  firstSeenAt: { type: Date, default: Date.now, index: true },
  lastSeenAt: { type: Date, default: Date.now, index: true },
  firstIp: { type: String, default: '', trim: true },
  lastIp: { type: String, default: '', trim: true, index: true },
  firstCountry: { type: String, default: '', trim: true },
  lastCountry: { type: String, default: '', trim: true, index: true },
  firstFingerprint: { type: String, default: '', trim: true },
  lastFingerprint: { type: String, default: '', trim: true },
  firstUserAgent: { type: String, default: '', trim: true },
  lastUserAgent: { type: String, default: '', trim: true },
  lastReason: { type: String, default: '', trim: true },
  metadata: { type: Object, default: {} },
  expiresAt: { type: Date, required: true, index: true }
}, {
  timestamps: true,
  strict: true
});

refreshTokenReplayStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
refreshTokenReplayStateSchema.index({ status: 1, updatedAt: -1 });

module.exports = mongoose.model('RefreshTokenReplayState', refreshTokenReplayStateSchema);
