const mongoose = require('mongoose');

const adminActionLogSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, required: true },
  ip: { type: String },
  meta: { type: Object }
}, { timestamps: true });

module.exports = mongoose.model('AdminActionLog', adminActionLogSchema);
