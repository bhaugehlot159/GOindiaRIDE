const mongoose = require('mongoose');

const userActionVelocityStateSchema = new mongoose.Schema({
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
  windowActionCount: { type: Number, min: 0, default: 0 },
  windowHighRiskActionCount: { type: Number, min: 0, default: 0 },
  windowRouteHashes: [{ type: String }],
  windowIpHashes: [{ type: String }],
  quarantineUntil: { type: Date, default: null, index: true },
  lastSeenAt: { type: Date, default: null, index: true },
  lastMethod: { type: String, default: '', trim: true },
  lastPath: { type: String, default: '', trim: true },
  lastCountry: { type: String, default: '', trim: true, index: true },
  lastIp: { type: String, default: '', trim: true, index: true },
  lastFingerprint: { type: String, default: '', trim: true },
  lastReason: { type: String, default: '', trim: true },
  metadata: { type: Object, default: {} },
  expiresAt: { type: Date, required: true, index: true }
}, {
  timestamps: true,
  strict: true
});

userActionVelocityStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
userActionVelocityStateSchema.index({ status: 1, updatedAt: -1 });

module.exports = mongoose.model('UserActionVelocityState', userActionVelocityStateSchema);
