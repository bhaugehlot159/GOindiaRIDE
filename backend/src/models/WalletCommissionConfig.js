const mongoose = require('mongoose');

const walletCommissionConfigSchema = new mongoose.Schema({
  configId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  enabled: {
    type: Boolean,
    default: true
  },
  autoSettlementEnabled: {
    type: Boolean,
    default: true
  },
  requireProviderReference: {
    type: Boolean,
    default: true
  },
  indiaCommissionPercent: {
    type: Number,
    default: 12,
    min: 0,
    max: 100
  },
  internationalCommissionPercent: {
    type: Number,
    default: 15,
    min: 0,
    max: 100
  },
  indiaWalletOwnerId: {
    type: String,
    default: 'india_pool',
    trim: true
  },
  internationalWalletOwnerId: {
    type: String,
    default: 'international_pool',
    trim: true
  },
  minGrossAmount: {
    type: Number,
    default: 1,
    min: 0
  },
  maxGrossAmount: {
    type: Number,
    default: 1000000,
    min: 0
  },
  minCommissionAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  maxCommissionAmount: {
    type: Number,
    default: 1000000,
    min: 0
  },
  supportedCurrencies: [{
    type: String,
    trim: true,
    uppercase: true
  }],
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true,
  strict: true
});

module.exports = mongoose.model('WalletCommissionConfig', walletCommissionConfigSchema);

