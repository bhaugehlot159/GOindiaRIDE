const mongoose = require('mongoose');

const securityDenylistEntrySchema = new mongoose.Schema({
  targetType: {
    type: String,
    enum: ['ip', 'user', 'device', 'email'],
    required: true,
    index: true
  },
  targetHash: { type: String, required: true, index: true },
  targetPreview: { type: String, default: '', trim: true },
  scope: {
    type: String,
    enum: ['all', 'auth', 'wallet', 'booking', 'security', 'admin', 'sensitive'],
    default: 'all',
    index: true
  },
  status: {
    type: String,
    enum: ['active', 'disabled'],
    default: 'active',
    index: true
  },
  reason: { type: String, default: 'manual_denylist_entry', trim: true },
  source: {
    type: String,
    enum: ['admin', 'system', 'security_event'],
    default: 'admin'
  },
  activeFrom: { type: Date, default: Date.now, index: true },
  activeUntil: { type: Date, default: null, index: true },
  hitCount: { type: Number, min: 0, default: 0 },
  lastHitAt: { type: Date, default: null, index: true },
  lastHitPath: { type: String, default: '', trim: true },
  lastHitIp: { type: String, default: '', trim: true },
  lastHitUserId: { type: String, default: '', trim: true },
  createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdByIp: { type: String, default: '', trim: true },
  updatedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedByIp: { type: String, default: '', trim: true },
  metadata: { type: Object, default: {} }
}, {
  timestamps: true,
  strict: true
});

securityDenylistEntrySchema.index(
  { targetType: 1, targetHash: 1, scope: 1 },
  { unique: true, name: 'uq_security_denylist_target_scope' }
);
securityDenylistEntrySchema.index({ status: 1, scope: 1, updatedAt: -1 });
securityDenylistEntrySchema.index({ activeFrom: 1, activeUntil: 1 });

module.exports = mongoose.model('SecurityDenylistEntry', securityDenylistEntrySchema);
