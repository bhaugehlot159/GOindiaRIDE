const mongoose = require('mongoose');

const adminAuditChainEntrySchema = new mongoose.Schema({
  auditTimestamp: { type: Date, required: true, default: Date.now, index: true },
  prevHash: { type: String, required: true, trim: true, index: true },
  entryHash: { type: String, required: true, unique: true, trim: true, index: true },
  entrySignature: { type: String, required: true, trim: true },
  action: { type: String, required: true, trim: true, index: true },
  routePath: { type: String, required: true, trim: true, index: true },
  method: { type: String, required: true, trim: true },
  actorUserId: { type: String, default: '', trim: true, index: true },
  actorRole: { type: String, default: '', trim: true, index: true },
  actorEmail: { type: String, default: '', trim: true },
  actorIp: { type: String, default: '', trim: true },
  requestId: { type: String, default: '', trim: true },
  payloadHash: { type: String, required: true, trim: true },
  statusCode: { type: Number, default: null, index: true },
  outcome: { type: String, default: '', trim: true, index: true },
  metadata: { type: Object, default: {} }
}, {
  timestamps: true,
  strict: true
});

adminAuditChainEntrySchema.index({ auditTimestamp: -1, _id: -1 });
adminAuditChainEntrySchema.index({ actorUserId: 1, auditTimestamp: -1 });
adminAuditChainEntrySchema.index({ action: 1, auditTimestamp: -1 });

module.exports = mongoose.model('AdminAuditChainEntry', adminAuditChainEntrySchema);
