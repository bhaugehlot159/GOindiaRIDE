const mongoose = require('mongoose');

const behaviorEventSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  eventType: {
    type: String,
    enum: ['login', 'booking_create', 'booking_cancel', 'payment', 'profile_change'],
    required: true
  },
  ip: { type: String },
  city: { type: String },
  deviceFingerprint: { type: String },
  metadata: { type: Object, default: {} }
}, {
  timestamps: true,
  strict: true
});

behaviorEventSchema.index({ userId: 1, eventType: 1, createdAt: -1 });

module.exports = mongoose.model('BehaviorEvent', behaviorEventSchema);
