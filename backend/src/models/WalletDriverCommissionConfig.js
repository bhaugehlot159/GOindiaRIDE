const mongoose = require('mongoose');

const walletDriverCommissionConfigSchema = new mongoose.Schema({
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
  indiaAdminCommissionPercent: {
    type: Number,
    default: 10,
    min: 0,
    max: 100
  },
  internationalAdminCommissionPercent: {
    type: Number,
    default: 12,
    min: 0,
    max: 100
  },
  indiaCustomerCommissionPercent: {
    type: Number,
    default: 2,
    min: 0,
    max: 100
  },
  internationalCustomerCommissionPercent: {
    type: Number,
    default: 3,
    min: 0,
    max: 100
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
  minDriverPayoutAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  maxDriverPayoutAmount: {
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

module.exports = mongoose.model('WalletDriverCommissionConfig', walletDriverCommissionConfigSchema);
