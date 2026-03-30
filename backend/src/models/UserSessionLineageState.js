const mongoose = require('mongoose');

const userSessionLineageStateSchema = new mongoose.Schema({
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
  windowSidHashes: [{ type: String }],
  windowJtiHashes: [{ type: String }],
  windowIpHashes: [{ type: String }],
  windowCountries: [{ type: String }],
  windowMissingSidCount: { type: Number, min: 0, default: 0 },
  quarantineUntil: { type: Date, default: null, index: true },
  lastSeenAt: { type: Date, default: null, index: true },
  lastSidHash: { type: String, default: '', trim: true },
  lastJtiHash: { type: String, default: '', trim: true },
  lastPath: { type: String, default: '', trim: true },
  lastCountry: { type: String, default: '', trim: true, index: true },
  lastIp: { type: String, default: '', trim: true, index: true },
  lastReason: { type: String, default: '', trim: true },
  metadata: { type: Object, default: {} },
  expiresAt: { type: Date, required: true, index: true }
}, {
  timestamps: true,
  strict: true
});

userSessionLineageStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
userSessionLineageStateSchema.index({ status: 1, updatedAt: -1 });

module.exports = mongoose.model('UserSessionLineageState', userSessionLineageStateSchema);
