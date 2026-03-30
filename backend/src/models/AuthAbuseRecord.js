const mongoose = require('mongoose');

const authAbuseRecordSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, index: true },
  keyType: { type: String, enum: ['principal', 'ip'], required: true, index: true },
  path: { type: String, required: true, trim: true },
  principalHash: { type: String, default: null, index: true },
  ipHash: { type: String, default: null, index: true },
  failureCount: { type: Number, min: 0, default: 0 },
  escalationLevel: { type: Number, min: 0, default: 0 },
  blockedUntil: { type: Date, default: null, index: true },
  lastFailureAt: { type: Date, default: null, index: true },
  lastStatusCode: { type: Number, default: null },
  lastReason: { type: String, default: '', trim: true },
  lastIp: { type: String, default: '', trim: true },
  lastUserId: { type: String, default: '', trim: true },
  expiresAt: { type: Date, required: true, index: true }
}, {
  timestamps: true,
  strict: true
});

authAbuseRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
authAbuseRecordSchema.index({ keyType: 1, blockedUntil: -1 });
authAbuseRecordSchema.index({ keyType: 1, lastFailureAt: -1 });

module.exports = mongoose.model('AuthAbuseRecord', authAbuseRecordSchema);
