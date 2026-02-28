const mongoose = require('mongoose');

const loginLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  email: { type: String, required: true },
  ip: { type: String },
  userAgent: { type: String },
  os: { type: String },
  browser: { type: String },
  country: { type: String },
  status: { type: String, enum: ['success', 'fail'], required: true },
  reason: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('LoginLog', loginLogSchema);
