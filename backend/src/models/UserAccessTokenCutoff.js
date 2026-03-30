const mongoose = require('mongoose');

const userAccessTokenCutoffSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  revokeBefore: { type: Date, required: true, index: true },
  reason: { type: String, default: 'manual_user_session_revocation', trim: true },
  source: {
    type: String,
    enum: ['admin', 'system', 'security_event'],
    default: 'admin'
  },
  updatedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedByIp: { type: String, default: '', trim: true },
  metadata: { type: Object, default: {} }
}, {
  timestamps: true,
  strict: true
});

userAccessTokenCutoffSchema.index({ revokeBefore: -1 });

module.exports = mongoose.model('UserAccessTokenCutoff', userAccessTokenCutoffSchema);
