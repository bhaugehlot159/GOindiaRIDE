const mongoose = require('mongoose');

const walletTopupOrderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  walletType: {
    type: String,
    enum: ['customer', 'driver', 'donation', 'customer_commission', 'driver_commission'],
    required: true,
    index: true
  },
  ownerId: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  donorUserId: {
    type: String,
    trim: true,
    default: null
  },
  donorAccountType: {
    type: String,
    enum: ['customer', 'driver', 'admin', null],
    default: null
  },
  donorNote: {
    type: String,
    trim: true,
    default: null
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'INR',
    uppercase: true,
    trim: true
  },
  paymentMode: {
    type: String,
    required: true,
    trim: true
  },
  paymentModeLabel: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'failed', 'expired'],
    default: 'pending',
    index: true
  },
  clientReference: {
    type: String,
    trim: true,
    default: null,
    index: true
  },
  providerReference: {
    type: String,
    trim: true,
    default: null
  },
  initiatedBy: {
    type: String,
    trim: true,
    default: null
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true,
  strict: true
});

walletTopupOrderSchema.index({ walletType: 1, ownerId: 1, createdAt: -1 });

module.exports = mongoose.model('WalletTopupOrder', walletTopupOrderSchema);


