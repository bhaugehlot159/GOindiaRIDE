const mongoose = require('mongoose');

const pushSubscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  audience: {
    type: String,
    enum: ['admin', 'driver', 'customer'],
    required: true,
    index: true
  },
  endpoint: {
    type: String,
    required: true,
    trim: true,
    select: false
  },
  endpointHash: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  keys: {
    p256dh: {
      type: String,
      required: true,
      trim: true,
      select: false
    },
    auth: {
      type: String,
      required: true,
      trim: true,
      select: false
    }
  },
  expirationTime: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    enum: ['active', 'disabled', 'failed'],
    default: 'active',
    index: true
  },
  failureCount: {
    type: Number,
    default: 0,
    min: 0
  },
  lastSuccessAt: {
    type: Date,
    default: null
  },
  lastFailureAt: {
    type: Date,
    default: null
  },
  lastError: {
    type: String,
    default: '',
    trim: true,
    maxlength: 240
  },
  userAgent: {
    type: String,
    default: '',
    trim: true,
    maxlength: 260
  },
  ipAddress: {
    type: String,
    default: '',
    trim: true,
    maxlength: 80,
    select: false
  },
  consentSource: {
    type: String,
    default: 'browser_permission',
    trim: true,
    maxlength: 80
  }
}, {
  timestamps: true,
  strict: true
});

pushSubscriptionSchema.index({ userId: 1, status: 1, updatedAt: -1 });
pushSubscriptionSchema.index({ audience: 1, status: 1, updatedAt: -1 });
pushSubscriptionSchema.index({ status: 1, failureCount: 1 });
pushSubscriptionSchema.index({ expirationTime: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
