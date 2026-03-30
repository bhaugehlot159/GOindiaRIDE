const mongoose = require('mongoose');

const attackPatternQuarantineRecordSchema = new mongoose.Schema({
  keyHash: { type: String, required: true, unique: true, index: true },
  ipHash: { type: String, required: true, index: true },
  fingerprintHash: { type: String, required: true, index: true },
  pathGroup: { type: String, required: true, trim: true, index: true },
  status: {
    type: String,
    enum: ['active', 'released'],
    default: 'active',
    index: true
  },
  firstSeenAt: { type: Date, required: true, default: Date.now, index: true },
  lastSeenAt: { type: Date, required: true, default: Date.now, index: true },
  windowStartAt: { type: Date, required: true, default: Date.now, index: true },
  hitCount: { type: Number, min: 0, default: 0 },
  escalationLevel: { type: Number, min: 0, default: 0 },
  quarantinedUntil: { type: Date, default: null, index: true },
  lastPath: { type: String, default: '', trim: true },
  lastMethod: { type: String, default: '', trim: true },
  lastReason: { type: String, default: '', trim: true },
  lastIp: { type: String, default: '', trim: true },
  lastUserId: { type: String, default: '', trim: true },
  patternFamilies: [{ type: String }],
  patternCount: { type: Number, min: 0, default: 0 },
  metadata: { type: Object, default: {} },
  expiresAt: { type: Date, required: true, index: true }
}, {
  timestamps: true,
  strict: true
});

attackPatternQuarantineRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
attackPatternQuarantineRecordSchema.index({ status: 1, quarantinedUntil: -1 });
attackPatternQuarantineRecordSchema.index({ pathGroup: 1, updatedAt: -1 });

module.exports = mongoose.model('AttackPatternQuarantineRecord', attackPatternQuarantineRecordSchema);
