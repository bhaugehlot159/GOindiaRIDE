const mongoose = require('mongoose');

const securityIncidentSchema = new mongoose.Schema({
  incidentId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: () => `INC-${Date.now()}-${Math.floor(Math.random() * 1000000)}`
  },
  source: {
    type: String,
    enum: ['client', 'server', 'gateway', 'admin'],
    default: 'server'
  },
  eventType: { type: String, required: true, trim: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  email: { type: String, trim: true, lowercase: true },
  ip: { type: String, trim: true },
  city: { type: String, trim: true },
  deviceFingerprint: { type: String, trim: true },
  riskScore: { type: Number, min: 0, max: 100, required: true },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    required: true
  },
  recommendedAction: { type: String, trim: true, required: true },
  autoResponse: {
    action: { type: String, trim: true, default: 'none' },
    applied: { type: Boolean, default: false },
    note: { type: String, trim: true, default: '' }
  },
  signals: { type: Object, default: {} },
  metadata: { type: Object, default: {} },
  status: {
    type: String,
    enum: ['open', 'investigating', 'mitigated', 'false_positive'],
    default: 'open',
    index: true
  },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  timeline: [
    {
      action: { type: String, trim: true },
      note: { type: String, trim: true },
      actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      createdAt: { type: Date, default: Date.now }
    }
  ]
}, {
  timestamps: true,
  strict: true
});

securityIncidentSchema.index({ createdAt: -1, riskScore: -1 });
securityIncidentSchema.index({ eventType: 1, createdAt: -1 });
securityIncidentSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('SecurityIncident', securityIncidentSchema);
