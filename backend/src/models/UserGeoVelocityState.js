const mongoose = require('mongoose');

const userGeoVelocityStateSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  status: {
    type: String,
    enum: ['active', 'quarantined', 'released'],
    default: 'active',
    index: true
  },
  escalationLevel: { type: Number, min: 0, default: 0 },
  suspiciousCount: { type: Number, min: 0, default: 0 },
  quarantineUntil: { type: Date, default: null, index: true },
  lastSeenAt: { type: Date, default: null, index: true },
  lastCountry: { type: String, default: '', trim: true, index: true },
  lastIp: { type: String, default: '', trim: true, index: true },
  lastFingerprint: { type: String, default: '', trim: true },
  lastUserAgent: { type: String, default: '', trim: true },
  lastReason: { type: String, default: '', trim: true },
  metadata: { type: Object, default: {} }
}, {
  timestamps: true,
  strict: true
});

userGeoVelocityStateSchema.index({ updatedAt: -1 });
userGeoVelocityStateSchema.index({ quarantineUntil: -1 });

module.exports = mongoose.model('UserGeoVelocityState', userGeoVelocityStateSchema);
