const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  cardHash: { type: String, required: true },
  ip: { type: String },
  status: { type: String, enum: ['created', 'cancelled', 'completed'], default: 'created' }
}, { timestamps: true });

module.exports = mongoose.model('Booking', bookingSchema);
