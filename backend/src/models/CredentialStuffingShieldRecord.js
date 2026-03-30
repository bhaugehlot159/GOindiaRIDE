const mongoose = require('mongoose');

const credentialStuffingShieldRecordSchema = new mongoose.Schema({
  ipHash: { type: String, required: true, index: true },
  pathGroup: { type: String, required: true, default: 'auth', trim: true, lowercase: true, index: true },
  status: {
    type: String,
    enum: ['active', 'quarantined', 'released'],
    default: 'active',
    index: true
  },
  escalationLevel: { type: Number, min: 0, default: 0 },
  windowStartAt: { type: Date, default: null, index: true },
  windowFailureCount: { type: Number, min: 0, default: 0 },
  windowPrincipalHashes: [{ type: String }],
  totalFailureCount: { type: Number, min: 0, default: 0 },
  suspiciousCount: { type: Number, min: 0, default: 0 },
  quarantineUntil: { type: Date, default: null, index: true },
  lastFailureAt: { type: Date, default: null, index: true },
  lastIp: { type: String, default: '', trim: true },
  lastReason: { type: String, default: '', trim: true },
  metadata: { type: Object, default: {} },
  expiresAt: { type: Date, required: true, index: true }
}, {
  timestamps: true,
  strict: true
});

credentialStuffingShieldRecordSchema.index({ ipHash: 1, pathGroup: 1 }, { unique: true });
credentialStuffingShieldRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
credentialStuffingShieldRecordSchema.index({ status: 1, quarantineUntil: -1, updatedAt: -1 });

module.exports = mongoose.model('CredentialStuffingShieldRecord', credentialStuffingShieldRecordSchema);
