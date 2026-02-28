const mongoose = require('mongoose');

const securityLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  action: { type: String, required: true, index: true },
  ip: { type: String, index: true },
  riskScore: { type: Number, default: 0 },
  result: { type: String, enum: ['allowed', 'blocked', 'flagged'], required: true },
  metadata: { type: Object, default: {} }
}, {
  timestamps: true,
  strict: true
});

securityLogSchema.index({ createdAt: -1, action: 1 });

module.exports = mongoose.model('SecurityLog', securityLogSchema);
