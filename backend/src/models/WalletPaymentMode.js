const mongoose = require('mongoose');

const walletPaymentModeSchema = new mongoose.Schema({
  modeId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  label: {
    type: String,
    required: true,
    trim: true
  },
  region: {
    type: String,
    enum: ['india', 'international', 'global'],
    default: 'india'
  },
  enabled: {
    type: Boolean,
    default: true,
    index: true
  },
  flows: [{
    type: String,
    enum: ['add_money', 'ride_payment', 'withdrawal', 'refund']
  }],
  displayOrder: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  strict: true
});

walletPaymentModeSchema.index({ enabled: 1, displayOrder: 1 });

module.exports = mongoose.model('WalletPaymentMode', walletPaymentModeSchema);
