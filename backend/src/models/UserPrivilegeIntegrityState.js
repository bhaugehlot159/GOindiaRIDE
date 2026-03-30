const mongoose = require('mongoose');

const userPrivilegeIntegrityStateSchema = new mongoose.Schema({
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
  windowMismatchCount: { type: Number, min: 0, default: 0 },
  quarantineUntil: { type: Date, default: null, index: true },
  lastSeenAt: { type: Date, default: null, index: true },
  lastTokenRole: { type: String, default: '', trim: true },
  lastDbRole: { type: String, default: '', trim: true },
  lastTokenAccountType: { type: String, default: '', trim: true },
  lastDbAccountType: { type: String, default: '', trim: true },
  lastReason: { type: String, default: '', trim: true },
  metadata: { type: Object, default: {} },
  expiresAt: { type: Date, required: true, index: true }
}, {
  timestamps: true,
  strict: true
});

userPrivilegeIntegrityStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
userPrivilegeIntegrityStateSchema.index({ status: 1, updatedAt: -1 });

module.exports = mongoose.model('UserPrivilegeIntegrityState', userPrivilegeIntegrityStateSchema);
