const mongoose = require('mongoose');

const walletWithdrawalRequestSchema = new mongoose.Schema({
  requestId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  walletType: {
    type: String,
    enum: ['customer', 'driver', 'donation'],
    required: true,
    index: true
  },
  ownerId: {
    type: String,
    required: true,
    trim: true,
    index: true
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
  method: {
    type: String,
    required: true,
    trim: true
  },
  methodLabel: {
    type: String,
    required: true,
    trim: true
  },
  destination: {
    type: String,
    required: true,
    trim: true
  },
  notes: {
    type: String,
    trim: true,
    default: ''
  },
  status: {
    type: String,
    enum: ['pending_admin_approval', 'approved', 'rejected'],
    default: 'pending_admin_approval',
    index: true
  },
  reviewedAt: {
    type: Date,
    default: null
  },
  reviewedBy: {
    type: String,
    trim: true,
    default: null
  },
  remarks: {
    type: String,
    trim: true,
    default: ''
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true,
  strict: true
});

walletWithdrawalRequestSchema.index({ walletType: 1, ownerId: 1, createdAt: -1 });

module.exports = mongoose.model('WalletWithdrawalRequest', walletWithdrawalRequestSchema);
