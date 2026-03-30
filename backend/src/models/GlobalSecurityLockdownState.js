const mongoose = require('mongoose');

const globalSecurityLockdownStateSchema = new mongoose.Schema({
  lockKey: { type: String, required: true, unique: true, index: true, default: 'global' },
  status: {
    type: String,
    enum: ['active', 'released'],
    default: 'released',
    index: true
  },
  activeFrom: { type: Date, default: null, index: true },
  activeUntil: { type: Date, default: null, index: true },
  reason: { type: String, default: '', trim: true },
  source: {
    type: String,
    enum: ['admin', 'system', 'security_event'],
    default: 'admin'
  },
  updatedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedByIp: { type: String, default: '', trim: true },
  blockCount: { type: Number, min: 0, default: 0 },
  lastBlockedAt: { type: Date, default: null, index: true },
  lastBlockedIp: { type: String, default: '', trim: true },
  lastBlockedPath: { type: String, default: '', trim: true },
  metadata: { type: Object, default: {} }
}, {
  timestamps: true,
  strict: true
});

globalSecurityLockdownStateSchema.index({ updatedAt: -1 });

module.exports = mongoose.model('GlobalSecurityLockdownState', globalSecurityLockdownStateSchema);
