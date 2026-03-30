const mongoose = require('mongoose');

const accessTokenReplayRecordSchema = new mongoose.Schema({
  jtiHash: { type: String, required: true, unique: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  sessionId: { type: String, default: '', trim: true, index: true },
  firstSeenAt: { type: Date, required: true, default: Date.now, index: true },
  lastSeenAt: { type: Date, required: true, default: Date.now, index: true },
  firstIp: { type: String, default: '', trim: true },
  lastIp: { type: String, default: '', trim: true, index: true },
  firstFingerprint: { type: String, default: '', trim: true },
  lastFingerprint: { type: String, default: '', trim: true, index: true },
  firstUserAgent: { type: String, default: '', trim: true },
  lastUserAgent: { type: String, default: '', trim: true },
  firstCountry: { type: String, default: '', trim: true },
  lastCountry: { type: String, default: '', trim: true },
  seenCount: { type: Number, min: 0, default: 1 },
  suspiciousCount: { type: Number, min: 0, default: 0 },
  status: {
    type: String,
    enum: ['active', 'suspicious', 'compromised', 'released'],
    default: 'active',
    index: true
  },
  lastReason: { type: String, default: '', trim: true },
  metadata: { type: Object, default: {} },
  expiresAt: { type: Date, required: true, index: true }
}, {
  timestamps: true,
  strict: true
});

accessTokenReplayRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
accessTokenReplayRecordSchema.index({ userId: 1, updatedAt: -1 });
accessTokenReplayRecordSchema.index({ status: 1, updatedAt: -1 });

module.exports = mongoose.model('AccessTokenReplayRecord', accessTokenReplayRecordSchema);
