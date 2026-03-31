const mongoose = require('mongoose');

const userTokenSessionInteractionBindingStateSchema = new mongoose.Schema({
  sidHash: { type: String, required: true, unique: true, index: true, trim: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  boundInteractionHash: { type: String, default: '', trim: true },
  boundInteractionVersionTag: { type: String, default: '', trim: true },
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
  lastSeenAt: { type: Date, default: null, index: true },
  lastPath: { type: String, default: '', trim: true },
  lastMethod: { type: String, default: '', trim: true },
  lastUserId: { type: String, default: '', trim: true },
  lastInteractionHash: { type: String, default: '', trim: true },
  lastInteractionVersionTag: { type: String, default: '', trim: true },
  lastJtiHash: { type: String, default: '', trim: true },
  lastReason: { type: String, default: '', trim: true },
  metadata: { type: Object, default: {} },
  expiresAt: { type: Date, required: true, index: true }
}, {
  timestamps: true,
  strict: true
});

userTokenSessionInteractionBindingStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
userTokenSessionInteractionBindingStateSchema.index({ status: 1, updatedAt: -1 });
userTokenSessionInteractionBindingStateSchema.index({ userId: 1, status: 1, updatedAt: -1 });

module.exports = mongoose.model('UserTokenSessionInteractionBindingState', userTokenSessionInteractionBindingStateSchema);
