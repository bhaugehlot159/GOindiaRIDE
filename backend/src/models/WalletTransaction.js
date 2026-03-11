const mongoose = require('mongoose');

const walletTransactionSchema = new mongoose.Schema({
  transactionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  walletType: {
    type: String,
    enum: ['customer', 'driver', 'admin', 'donation'],
    required: true,
    index: true
  },
  ownerId: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  direction: {
    type: String,
    enum: ['credit', 'debit', 'hold', 'release'],
    required: true
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
  source: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'settled', 'failed', 'cancelled'],
    default: 'settled'
  },
  paymentMode: {
    type: String,
    trim: true,
    default: null
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
  relatedRequestId: {
    type: String,
    trim: true,
    default: null
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  actorRole: {
    type: String,
    trim: true,
    default: 'system'
  },
  actorId: {
    type: String,
    trim: true,
    default: 'system'
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true,
  strict: true
});

walletTransactionSchema.index({ walletType: 1, ownerId: 1, createdAt: -1 });

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
