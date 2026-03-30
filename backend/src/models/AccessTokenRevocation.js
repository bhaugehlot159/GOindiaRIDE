const mongoose = require('mongoose');

const accessTokenRevocationSchema = new mongoose.Schema({
  jtiHash: { type: String, required: true, unique: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  reason: { type: String, default: 'manual_revocation', trim: true },
  source: {
    type: String,
    enum: ['admin', 'system', 'security_event'],
    default: 'admin'
  },
  status: {
    type: String,
    enum: ['active', 'expired'],
    default: 'active',
    index: true
  },
  revokedAt: { type: Date, default: Date.now, index: true },
  revokedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  revokedByIp: { type: String, default: '', trim: true },
  metadata: { type: Object, default: {} },
  expiresAt: { type: Date, required: true, index: true }
}, {
  timestamps: true,
  strict: true
});

accessTokenRevocationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
accessTokenRevocationSchema.index({ userId: 1, revokedAt: -1 });

module.exports = mongoose.model('AccessTokenRevocation', accessTokenRevocationSchema);
