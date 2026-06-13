const mongoose = require('mongoose');

const gdprRequestSchema = new mongoose.Schema({
  requestId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: () => `GDPR-${Date.now()}-${Math.floor(Math.random() * 1000000)}`
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  email: { type: String, default: '', trim: true, lowercase: true, index: true },
  requestType: {
    type: String,
    enum: ['access', 'rectification', 'erasure', 'restriction', 'objection', 'portability', 'consent_withdrawal'],
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['received', 'verifying_identity', 'under_review', 'fulfilled', 'rejected', 'cancelled'],
    default: 'received',
    index: true
  },
  channel: { type: String, default: 'self_service', trim: true, maxlength: 80 },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  dueAt: { type: Date, required: true, index: true },
  completedAt: { type: Date, default: null, index: true },
  legalHoldReason: { type: String, default: '', trim: true, maxlength: 280 },
  verifiedAt: { type: Date, default: null },
  reviewedBy: { type: String, default: '', trim: true, maxlength: 120 },
  timeline: [{
    action: { type: String, trim: true, maxlength: 80 },
    note: { type: String, trim: true, maxlength: 280 },
    actorId: { type: String, trim: true, maxlength: 120, default: '' },
    createdAt: { type: Date, default: Date.now }
  }],
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, {
  timestamps: true,
  strict: true
});

gdprRequestSchema.index({ userId: 1, createdAt: -1 });
gdprRequestSchema.index({ status: 1, dueAt: 1 });
gdprRequestSchema.index({ requestType: 1, createdAt: -1 });

module.exports = mongoose.model('GdprRequest', gdprRequestSchema);
