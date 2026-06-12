const mongoose = require('mongoose');

const liveLocationHistorySchema = new mongoose.Schema({
  lat: { type: Number, required: true, min: -90, max: 90 },
  lng: { type: Number, required: true, min: -180, max: 180 },
  accuracy: { type: Number, default: null, min: 0 },
  speed: { type: Number, default: null },
  heading: { type: Number, default: null, min: 0, max: 360 },
  altitude: { type: Number, default: null },
  capturedAt: { type: Date, default: Date.now },
  receivedAt: { type: Date, default: Date.now }
}, {
  _id: false
});

const liveLocationSchema = new mongoose.Schema({
  subjectType: {
    type: String,
    enum: ['customer', 'driver', 'admin'],
    required: true,
    index: true
  },
  userId: { type: String, required: true, trim: true, maxlength: 140, index: true },
  bookingId: { type: String, default: '', trim: true, uppercase: true, maxlength: 120, index: true },
  sessionId: { type: String, required: true, trim: true, maxlength: 160, index: true },
  lat: { type: Number, required: true, min: -90, max: 90 },
  lng: { type: Number, required: true, min: -180, max: 180 },
  accuracy: { type: Number, default: null, min: 0 },
  speed: { type: Number, default: null },
  heading: { type: Number, default: null, min: 0, max: 360 },
  altitude: { type: Number, default: null },
  status: {
    type: String,
    enum: ['tracking', 'stopped'],
    default: 'tracking',
    index: true
  },
  source: { type: String, default: 'web_geolocation', trim: true, maxlength: 120 },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  ip: { type: String, default: '', trim: true, maxlength: 80 },
  userAgent: { type: String, default: '', trim: true, maxlength: 300 },
  capturedAt: { type: Date, default: Date.now, index: true },
  lastReportedAt: { type: Date, default: Date.now, index: true },
  history: { type: [liveLocationHistorySchema], default: [] }
}, {
  timestamps: true,
  strict: true
});

liveLocationSchema.index({ subjectType: 1, userId: 1, sessionId: 1, bookingId: 1 });
liveLocationSchema.index({ bookingId: 1, updatedAt: -1 });
liveLocationSchema.index({ status: 1, updatedAt: -1 });

module.exports = mongoose.model('LiveLocation', liveLocationSchema);
