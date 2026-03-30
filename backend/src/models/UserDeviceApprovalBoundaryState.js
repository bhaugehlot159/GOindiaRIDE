const mongoose = require('mongoose');

const userDeviceApprovalBoundaryStateSchema = new mongoose.Schema({
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
  quarantineUntil: { type: Date, default: null, index: true },
  lastSeenAt: { type: Date, default: null, index: true },
  lastPath: { type: String, default: '', trim: true },
  lastMethod: { type: String, default: '', trim: true },
  lastDeviceFingerprint: { type: String, default: '', trim: true },
  lastDeviceStatus: { type: String, default: '', trim: true },
  lastReason: { type: String, default: '', trim: true },
  metadata: { type: Object, default: {} },
  expiresAt: { type: Date, required: true, index: true }
}, {
  timestamps: true,
  strict: true
});

userDeviceApprovalBoundaryStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
userDeviceApprovalBoundaryStateSchema.index({ status: 1, updatedAt: -1 });

module.exports = mongoose.model('UserDeviceApprovalBoundaryState', userDeviceApprovalBoundaryStateSchema);
