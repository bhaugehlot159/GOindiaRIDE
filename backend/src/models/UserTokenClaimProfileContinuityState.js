const mongoose = require('mongoose');

const sidClaimProfileSchema = new mongoose.Schema({
  sidHash: { type: String, required: true, trim: true },
  issuer: { type: String, default: '', trim: true },
  audience: { type: String, default: '', trim: true },
  role: { type: String, default: '', trim: true },
  accountType: { type: String, default: '', trim: true },
  tokenType: { type: String, default: '', trim: true },
  scopeFingerprint: { type: String, default: '', trim: true },
  scopeValueCount: { type: Number, min: 0, default: 0 },
  lastIatSec: { type: Number, min: 0, default: 0 },
  lastJtiHash: { type: String, default: '', trim: true },
  lastSeenAt: { type: Date, default: null },
  seenCount: { type: Number, min: 0, default: 0 }
}, {
  _id: false,
  strict: true
});

const userTokenClaimProfileContinuityStateSchema = new mongoose.Schema({
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
  windowViolationCount: { type: Number, min: 0, default: 0 },
  windowMissingClaimCount: { type: Number, min: 0, default: 0 },
  quarantineUntil: { type: Date, default: null, index: true },
  sidProfiles: { type: [sidClaimProfileSchema], default: [] },
  lastSeenAt: { type: Date, default: null, index: true },
  lastPath: { type: String, default: '', trim: true },
  lastMethod: { type: String, default: '', trim: true },
  lastSidHash: { type: String, default: '', trim: true },
  lastClaimProfileHash: { type: String, default: '', trim: true },
  lastReason: { type: String, default: '', trim: true },
  metadata: { type: Object, default: {} },
  expiresAt: { type: Date, required: true, index: true }
}, {
  timestamps: true,
  strict: true
});

userTokenClaimProfileContinuityStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
userTokenClaimProfileContinuityStateSchema.index({ status: 1, updatedAt: -1 });

module.exports = mongoose.model('UserTokenClaimProfileContinuityState', userTokenClaimProfileContinuityStateSchema);
