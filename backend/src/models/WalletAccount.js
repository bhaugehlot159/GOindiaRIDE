const mongoose = require('mongoose');

const walletAccountSchema = new mongoose.Schema({
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
  currency: {
    type: String,
    default: 'INR',
    uppercase: true,
    trim: true
  },
  balance: {
    type: Number,
    default: 0,
    min: 0
  },
  status: {
    type: String,
    enum: ['active', 'frozen', 'closed'],
    default: 'active'
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true,
  strict: true
});

walletAccountSchema.index({ walletType: 1, ownerId: 1 }, { unique: true });

module.exports = mongoose.model('WalletAccount', walletAccountSchema);
