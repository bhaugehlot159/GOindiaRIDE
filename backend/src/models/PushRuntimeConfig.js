const mongoose = require('mongoose');

const pushRuntimeConfigSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true
  },
  publicKey: {
    type: String,
    required: true,
    trim: true
  },
  privateKey: {
    type: String,
    required: true,
    trim: true,
    select: false
  },
  subject: {
    type: String,
    required: true,
    trim: true
  },
  source: {
    type: String,
    enum: ['environment', 'database_auto_provision'],
    default: 'database_auto_provision',
    index: true
  },
  rotatedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  strict: true
});

module.exports = mongoose.model('PushRuntimeConfig', pushRuntimeConfigSchema);
