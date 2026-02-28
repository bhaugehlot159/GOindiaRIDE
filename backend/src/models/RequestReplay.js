const mongoose = require('mongoose');

const requestReplaySchema = new mongoose.Schema({
  signature: { type: String, required: true, unique: true, index: true },
  timestamp: { type: Number, required: true },
  ip: { type: String }
}, {
  timestamps: true,
  strict: true
});

requestReplaySchema.index({ createdAt: 1 }, { expireAfterSeconds: 600 });

module.exports = mongoose.model('RequestReplay', requestReplaySchema);
