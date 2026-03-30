const mongoose = require('mongoose');

const securityRouteGuardPolicySchema = new mongoose.Schema({
  routePrefix: { type: String, required: true, trim: true, lowercase: true, index: true },
  methods: [{ type: String, required: true, uppercase: true, trim: true }],
  mode: {
    type: String,
    enum: ['block'],
    default: 'block',
    index: true
  },
  status: {
    type: String,
    enum: ['active', 'released'],
    default: 'active',
    index: true
  },
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

securityRouteGuardPolicySchema.index({ status: 1, activeFrom: 1, activeUntil: 1, priority: -1 });
securityRouteGuardPolicySchema.index({ routePrefix: 1, priority: -1, updatedAt: -1 });

module.exports = mongoose.model('SecurityRouteGuardPolicy', securityRouteGuardPolicySchema);
