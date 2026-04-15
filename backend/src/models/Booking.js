const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  bookingId: { type: String, required: true, unique: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  cardHash: { type: String, required: true },
  ip: { type: String, required: true },
  distanceKm: { type: Number, default: 0, min: 0 },
  amount: { type: Number, default: 0, min: 0 },
  referralCode: { type: String, trim: true },
  pickupLocation: { type: String, default: '', trim: true, maxlength: 180 },
  dropLocation: { type: String, default: '', trim: true, maxlength: 180 },
  rideDate: { type: String, default: '', trim: true, maxlength: 40 },
  rideTime: { type: String, default: '', trim: true, maxlength: 40 },
  returnDate: { type: String, default: '', trim: true, maxlength: 40 },
  returnTime: { type: String, default: '', trim: true, maxlength: 40 },
  tripPlan: { type: String, default: '', trim: true, maxlength: 80 },
  paymentMethod: { type: String, default: '', trim: true, maxlength: 80 },
  vehicleType: { type: String, default: '', trim: true, maxlength: 80 },
  passengers: { type: Number, default: 1, min: 1, max: 20 },
  luggage: { type: String, default: '', trim: true, maxlength: 80 },
  notes: { type: String, default: '', trim: true, maxlength: 600 },
  stops: [{ type: String, trim: true, maxlength: 180 }],
  specialRequests: { type: mongoose.Schema.Types.Mixed, default: {} },
  safetyAccessibility: { type: mongoose.Schema.Types.Mixed, default: {} },
  customerSnapshot: {
    name: { type: String, default: '', trim: true, maxlength: 140 },
    email: { type: String, default: '', trim: true, maxlength: 180 },
    phone: { type: String, default: '', trim: true, maxlength: 40 }
  },
  driverId: { type: String, default: null, trim: true, index: true },
  completedByAccountType: { type: String, enum: ['customer', 'driver', 'admin', null], default: null },
  completedByUserId: { type: String, default: null, trim: true },
  settlementReference: { type: String, default: null, trim: true },
  customerPaymentSettledAt: { type: Date, default: null },
  driverPaymentSettledAt: { type: Date, default: null },
  adminReviewStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    index: true
  },
  adminReviewedBy: { type: String, default: null, trim: true, index: true },
  adminReviewedAt: { type: Date, default: null, index: true },
  adminReviewNote: { type: String, default: null, trim: true, maxlength: 280 },
  status: { type: String, enum: ['created', 'cancelled', 'completed'], default: 'created' }
}, {
  timestamps: true,
  strict: true
});

bookingSchema.index({ userId: 1, createdAt: -1 });
bookingSchema.index({ driverId: 1, createdAt: -1 });
bookingSchema.index({ ip: 1, createdAt: -1 });
bookingSchema.index({ adminReviewStatus: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('Booking', bookingSchema);

