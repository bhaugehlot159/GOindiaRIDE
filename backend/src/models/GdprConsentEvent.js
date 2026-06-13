const mongoose = require('mongoose');

const gdprConsentEventSchema = new mongoose.Schema({
  eventId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: () => `CONSENT-${Date.now()}-${Math.floor(Math.random() * 1000000)}`
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  email: { type: String, default: '', trim: true, lowercase: true, index: true },
  consentType: {
    type: String,
    enum: ['marketing', 'analytics', 'location', 'cookies', 'support'],
    required: true,
    index: true
  },
  granted: { type: Boolean, required: true, index: true },
  source: { type: String, default: 'self_service', trim: true, maxlength: 80 },
  ip: { type: String, default: '', trim: true, maxlength: 80 },
  userAgent: { type: String, default: '', trim: true, maxlength: 300 },
  policyVersion: { type: String, default: '2026-06-13-gdpr-phase2', trim: true, maxlength: 80 },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, {
  timestamps: true,
  strict: true
});

gdprConsentEventSchema.index({ userId: 1, consentType: 1, createdAt: -1 });
gdprConsentEventSchema.index({ createdAt: -1 });

module.exports = mongoose.model('GdprConsentEvent', gdprConsentEventSchema);
