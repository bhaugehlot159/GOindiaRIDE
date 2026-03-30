const mongoose = require('mongoose');

const idempotencyShieldRecordSchema = new mongoose.Schema({
  scope: { type: String, required: true, trim: true, index: true },
  actorKey: { type: String, required: true, trim: true, index: true },
  keyHash: { type: String, required: true, trim: true, index: true },
  keyPrefix: { type: String, default: '', trim: true },
  method: { type: String, required: true, trim: true },
  path: { type: String, required: true, trim: true, index: true },
  requestHash: { type: String, required: true, trim: true },
  bodyHash: { type: String, required: true, trim: true },
  status: {
    type: String,
    enum: ['processing', 'completed', 'failed'],
    default: 'processing',
    index: true
  },
  lockUntil: { type: Date, default: null, index: true },
  firstSeenAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
  hitCount: { type: Number, min: 1, default: 1 },
  lastStatusCode: { type: Number, default: null },
  lastReason: { type: String, default: '', trim: true },
  expiresAt: { type: Date, required: true, index: true }
}, {
  timestamps: true,
  strict: true
});

idempotencyShieldRecordSchema.index(
  { scope: 1, actorKey: 1, keyHash: 1 },
  { unique: true, name: 'uq_idempotency_scope_actor_keyhash' }
);
idempotencyShieldRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
idempotencyShieldRecordSchema.index({ scope: 1, status: 1, updatedAt: -1 });

module.exports = mongoose.model('IdempotencyShieldRecord', idempotencyShieldRecordSchema);
