const mongoose = require('mongoose');

const userSessionFanoutStateSchema = new mongoose.Schema({
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
  windowContextHashes: [{ type: String }],
  windowIpHashes: [{ type: String }],
  windowCountries: [{ type: String }],
  quarantineUntil: { type: Date, default: null, index: true },
  lastSeenAt: { type: Date, default: null, index: true },
  lastCountry: { type: String, default: '', trim: true, index: true },
  lastIp: { type: String, default: '', trim: true, index: true },
  lastFingerprint: { type: String, default: '', trim: true },
  lastUserAgent: { type: String, default: '', trim: true },
  lastReason: { type: String, default: '', trim: true },
  metadata: { type: Object, default: {} },
  expiresAt: { type: Date, required: true, index: true }
}, {
  timestamps: true,
  strict: true
});

userSessionFanoutStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
userSessionFanoutStateSchema.index({ status: 1, updatedAt: -1 });

module.exports = mongoose.model('UserSessionFanoutState', userSessionFanoutStateSchema);
