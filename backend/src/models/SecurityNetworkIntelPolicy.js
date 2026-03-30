const mongoose = require('mongoose');

const SCOPE_SET = ['all', 'auth', 'wallet', 'booking', 'security', 'admin', 'sensitive'];
const TARGET_TYPE_SET = ['ip_prefix', 'asn_hint', 'country_code'];

const securityNetworkIntelPolicySchema = new mongoose.Schema({
  targetType: { type: String, enum: TARGET_TYPE_SET, required: true, index: true },
  matchValue: { type: String, required: true, trim: true, lowercase: true, index: true },
  scope: { type: String, enum: SCOPE_SET, default: 'all', index: true },
  status: { type: String, enum: ['active', 'released'], default: 'active', index: true },
  priority: { type: Number, min: 0, max: 1000, default: 100, index: true },
  reason: { type: String, default: '', trim: true },
  source: { type: String, default: 'admin', trim: true, lowercase: true },
  activeFrom: { type: Date, default: Date.now, index: true },
  activeUntil: { type: Date, default: null, index: true },
  metadata: { type: Object, default: {} },
  hitCount: { type: Number, min: 0, default: 0 },
  lastHitAt: { type: Date, default: null },
  lastHitPath: { type: String, default: '', trim: true },
  lastHitMethod: { type: String, default: '', trim: true, uppercase: true },
  lastHitIp: { type: String, default: '', trim: true },
  lastHitUserId: { type: String, default: '', trim: true },
  createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdByIp: { type: String, default: '', trim: true },
  updatedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedByIp: { type: String, default: '', trim: true }
}, {
  timestamps: true,
  strict: true
});

securityNetworkIntelPolicySchema.index({ targetType: 1, matchValue: 1, scope: 1 }, { unique: true });
securityNetworkIntelPolicySchema.index({ status: 1, scope: 1, activeFrom: 1, activeUntil: 1, priority: -1 });

module.exports = mongoose.model('SecurityNetworkIntelPolicy', securityNetworkIntelPolicySchema);
