const mongoose = require('mongoose');

const sidLedgerEntrySchema = new mongoose.Schema({
  sidHash: { type: String, required: true, trim: true },
  lastIatSec: { type: Number, min: 0, default: 0 },
  lastExpSec: { type: Number, min: 0, default: 0 },
  lastJtiHash: { type: String, default: '', trim: true },
  lastSeenAt: { type: Date, default: null },
  seenCount: { type: Number, min: 0, default: 0 }
}, {
  _id: false,
  strict: true
});

const userTokenRotationContinuityStateSchema = new mongoose.Schema({
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
  sidLedger: { type: [sidLedgerEntrySchema], default: [] },
  lastSeenAt: { type: Date, default: null, index: true },
  lastPath: { type: String, default: '', trim: true },
  lastMethod: { type: String, default: '', trim: true },
  lastSidHash: { type: String, default: '', trim: true },
  lastJtiHash: { type: String, default: '', trim: true },
  lastIatSec: { type: Number, min: 0, default: 0 },
  lastExpSec: { type: Number, min: 0, default: 0 },
  lastReason: { type: String, default: '', trim: true },
  metadata: { type: Object, default: {} },
  expiresAt: { type: Date, required: true, index: true }
}, {
  timestamps: true,
  strict: true
});

userTokenRotationContinuityStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
userTokenRotationContinuityStateSchema.index({ status: 1, updatedAt: -1 });

module.exports = mongoose.model('UserTokenRotationContinuityState', userTokenRotationContinuityStateSchema);
