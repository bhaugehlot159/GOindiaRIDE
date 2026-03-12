
const WalletAccount = require('../models/WalletAccount');
const WalletDriverCommissionConfig = require('../models/WalletDriverCommissionConfig');
const WalletPaymentMode = require('../models/WalletPaymentMode');
const WalletTransaction = require('../models/WalletTransaction');
const {
  COMMISSION_WALLET_TYPE: CUSTOMER_COMMISSION_WALLET_TYPE,
  ensureCommissionConfig,
  resolveCommissionRegion
} = require('./commissionWalletService');

const DRIVER_COMMISSION_WALLET_TYPE = 'driver_commission';
const DRIVER_COMMISSION_CONFIG_ID = 'driver_commission_default';
const INDIA_REGION = 'india';
const INTERNATIONAL_REGION = 'international';
const DEFAULT_SUPPORTED_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'CAD', 'AUD'];

function sanitizeText(value, maxLen = 180) {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function toAmount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return NaN;
  return Number(parsed.toFixed(2));
}

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
}

function resolveDriverCommissionRegion(region, currency) {
  const normalizedRegion = sanitizeText(region, 40).toLowerCase();
  if (normalizedRegion === INDIA_REGION || normalizedRegion === INTERNATIONAL_REGION) {
    return normalizedRegion;
  }
  return resolveCommissionRegion(region, currency);
}

function validatePercent(value, fieldName) {
  const parsed = toAmount(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    const error = new Error(`${fieldName} must be between 0 and 100`);
    error.statusCode = 400;
    throw error;
  }
  return parsed;
}

async function ensureDriverCommissionConfig() {
  const config = await WalletDriverCommissionConfig.findOneAndUpdate(
    { configId: DRIVER_COMMISSION_CONFIG_ID },
    {
      $setOnInsert: {
        configId: DRIVER_COMMISSION_CONFIG_ID,
        enabled: true,
        autoSettlementEnabled: true,
        requireProviderReference: true,
        indiaAdminCommissionPercent: 10,
        internationalAdminCommissionPercent: 12,
        indiaCustomerCommissionPercent: 2,
        internationalCustomerCommissionPercent: 3,
        minGrossAmount: 1,
        maxGrossAmount: 1000000,
        minDriverPayoutAmount: 0,
        maxDriverPayoutAmount: 1000000,
        supportedCurrencies: DEFAULT_SUPPORTED_CURRENCIES,
        metadata: {}
      }
    },
    { new: true, upsert: true }
  );

  if (!Array.isArray(config.supportedCurrencies) || !config.supportedCurrencies.length) {
    config.supportedCurrencies = DEFAULT_SUPPORTED_CURRENCIES;
    await config.save();
  }

  return config;
}

async function updateDriverCommissionConfig(patch = {}) {
  const config = await ensureDriverCommissionConfig();

  if (Object.prototype.hasOwnProperty.call(patch, 'enabled')) {
    config.enabled = Boolean(patch.enabled);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'autoSettlementEnabled')) {
    config.autoSettlementEnabled = Boolean(patch.autoSettlementEnabled);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'requireProviderReference')) {
    config.requireProviderReference = Boolean(patch.requireProviderReference);
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'indiaAdminCommissionPercent')) {
    config.indiaAdminCommissionPercent = validatePercent(patch.indiaAdminCommissionPercent, 'indiaAdminCommissionPercent');
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'internationalAdminCommissionPercent')) {
    config.internationalAdminCommissionPercent = validatePercent(patch.internationalAdminCommissionPercent, 'internationalAdminCommissionPercent');
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'indiaCustomerCommissionPercent')) {
    config.indiaCustomerCommissionPercent = validatePercent(patch.indiaCustomerCommissionPercent, 'indiaCustomerCommissionPercent');
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'internationalCustomerCommissionPercent')) {
    config.internationalCustomerCommissionPercent = validatePercent(patch.internationalCustomerCommissionPercent, 'internationalCustomerCommissionPercent');
  }

  if (Number(config.indiaAdminCommissionPercent || 0) + Number(config.indiaCustomerCommissionPercent || 0) > 100) {
    const error = new Error('India admin + customer commission percent cannot exceed 100');
    error.statusCode = 400;
    throw error;
  }

  if (Number(config.internationalAdminCommissionPercent || 0) + Number(config.internationalCustomerCommissionPercent || 0) > 100) {
    const error = new Error('International admin + customer commission percent cannot exceed 100');
    error.statusCode = 400;
    throw error;
  }

  const minGrossAmount = toAmount(patch.minGrossAmount);
  if (Number.isFinite(minGrossAmount)) {
    config.minGrossAmount = Math.max(0, minGrossAmount);
  }

  const maxGrossAmount = toAmount(patch.maxGrossAmount);
  if (Number.isFinite(maxGrossAmount)) {
    config.maxGrossAmount = Math.max(0, maxGrossAmount);
  }

  const minDriverPayoutAmount = toAmount(patch.minDriverPayoutAmount);
  if (Number.isFinite(minDriverPayoutAmount)) {
    config.minDriverPayoutAmount = Math.max(0, minDriverPayoutAmount);
  }

  const maxDriverPayoutAmount = toAmount(patch.maxDriverPayoutAmount);
  if (Number.isFinite(maxDriverPayoutAmount)) {
    config.maxDriverPayoutAmount = Math.max(0, maxDriverPayoutAmount);
  }

  if (config.maxGrossAmount < config.minGrossAmount) {
    const error = new Error('maxGrossAmount must be >= minGrossAmount');
    error.statusCode = 400;
    throw error;
  }

  if (config.maxDriverPayoutAmount < config.minDriverPayoutAmount) {
    const error = new Error('maxDriverPayoutAmount must be >= minDriverPayoutAmount');
    error.statusCode = 400;
    throw error;
  }

  if (Array.isArray(patch.supportedCurrencies) && patch.supportedCurrencies.length) {
    config.supportedCurrencies = patch.supportedCurrencies
      .map((item) => sanitizeText(item, 10).toUpperCase())
      .filter(Boolean);
  }

  config.metadata = {
    ...(config.metadata || {}),
    ...(patch.metadata && typeof patch.metadata === 'object' ? patch.metadata : {})
  };

  await config.save();
  return config;
}

function buildSettlementBreakdown(grossAmount, region, config) {
  const gross = toAmount(grossAmount);

  const adminRate = region === INTERNATIONAL_REGION
    ? Number(config.internationalAdminCommissionPercent || 0)
    : Number(config.indiaAdminCommissionPercent || 0);

  const customerRate = region === INTERNATIONAL_REGION
    ? Number(config.internationalCustomerCommissionPercent || 0)
    : Number(config.indiaCustomerCommissionPercent || 0);

  let adminCommissionAmount = Number(((gross * adminRate) / 100).toFixed(2));
  let customerCommissionAmount = Number(((gross * customerRate) / 100).toFixed(2));

  if (adminCommissionAmount + customerCommissionAmount > gross) {
    const ratio = gross / (adminCommissionAmount + customerCommissionAmount);
    adminCommissionAmount = Number((adminCommissionAmount * ratio).toFixed(2));
    customerCommissionAmount = Number((customerCommissionAmount * ratio).toFixed(2));
  }

  const driverNetAmount = Number((gross - adminCommissionAmount - customerCommissionAmount).toFixed(2));

  if (driverNetAmount < Number(config.minDriverPayoutAmount || 0)) {
    const error = new Error(`Driver payout cannot be below ${config.minDriverPayoutAmount}`);
    error.statusCode = 400;
    throw error;
  }

  if (driverNetAmount > Number(config.maxDriverPayoutAmount || Number.MAX_SAFE_INTEGER)) {
    const error = new Error(`Driver payout cannot exceed ${config.maxDriverPayoutAmount}`);
    error.statusCode = 400;
    throw error;
  }

  return {
    grossAmount: gross,
    adminCommissionPercent: Number(adminRate.toFixed(2)),
    customerCommissionPercent: Number(customerRate.toFixed(2)),
    adminCommissionAmount,
    customerCommissionAmount,
    totalCommissionAmount: Number((adminCommissionAmount + customerCommissionAmount).toFixed(2)),
    driverNetAmount
  };
}

async function createTransaction(payload) {
  return WalletTransaction.create({
    transactionId: generateId('WTX'),
    ...payload
  });
}

async function ensureDriverCommissionWallet(driverId, currency = 'INR', region = INDIA_REGION) {
  const ownerId = sanitizeText(driverId, 120);
  if (!ownerId) {
    const error = new Error('driverId is required');
    error.statusCode = 400;
    throw error;
  }

  const normalizedRegion = resolveDriverCommissionRegion(region, currency);

  return WalletAccount.findOneAndUpdate(
    { walletType: DRIVER_COMMISSION_WALLET_TYPE, ownerId },
    {
      $setOnInsert: {
        walletType: DRIVER_COMMISSION_WALLET_TYPE,
        ownerId,
        currency: sanitizeText(currency || 'INR', 8).toUpperCase(),
        balance: 0,
        status: 'active',
        metadata: {
          region: normalizedRegion,
          controlledBy: 'admin'
        }
      },
      $set: {
        currency: sanitizeText(currency || 'INR', 8).toUpperCase(),
        'metadata.region': normalizedRegion,
        'metadata.controlledBy': 'admin'
      }
    },
    { new: true, upsert: true }
  );
}

async function creditWallet(walletType, ownerId, amount, currency, metadata = {}) {
  const value = toAmount(amount);
  if (!Number.isFinite(value) || value <= 0) {
    return WalletAccount.findOne({ walletType, ownerId });
  }

  const existing = await WalletAccount.findOne({ walletType, ownerId }).lean();
  if (existing && existing.status !== 'active') {
    const error = new Error(`Wallet is not active: ${walletType}:${ownerId}`);
    error.statusCode = 403;
    throw error;
  }

  const updateSet = {
    currency: sanitizeText(currency || 'INR', 8).toUpperCase()
  };

  Object.entries(metadata || {}).forEach(([key, val]) => {
    updateSet[`metadata.${sanitizeText(key, 60)}`] = val;
  });

  const wallet = await WalletAccount.findOneAndUpdate(
    { walletType, ownerId },
    {
      $setOnInsert: {
        walletType,
        ownerId,
        currency: sanitizeText(currency || 'INR', 8).toUpperCase(),
        balance: 0,
        status: 'active',
        metadata: {}
      },
      $set: updateSet,
      $inc: { balance: value }
    },
    { new: true, upsert: true }
  );

  if (!wallet || wallet.status !== 'active') {
    const error = new Error(`Wallet is not active: ${walletType}:${ownerId}`);
    error.statusCode = 403;
    throw error;
  }

  return wallet;
}

async function debitWallet(walletType, ownerId, amount, currency, metadata = {}) {
  const value = toAmount(amount);
  if (!Number.isFinite(value) || value <= 0) {
    return WalletAccount.findOne({ walletType, ownerId });
  }

  const updateSet = {
    currency: sanitizeText(currency || 'INR', 8).toUpperCase()
  };

  Object.entries(metadata || {}).forEach(([key, val]) => {
    updateSet[`metadata.${sanitizeText(key, 60)}`] = val;
  });

  const wallet = await WalletAccount.findOneAndUpdate(
    {
      walletType,
      ownerId,
      status: 'active',
      balance: { $gte: value }
    },
    {
      $set: updateSet,
      $inc: { balance: -value }
    },
    { new: true }
  );

  if (!wallet) {
    const error = new Error(`Insufficient balance in wallet ${walletType}:${ownerId}`);
    error.statusCode = 400;
    throw error;
  }

  return wallet;
}

async function resolveSettlementMode(modeId, region, refund = false) {
  const normalized = sanitizeText(modeId, 80).toLowerCase();
  const flowFilter = refund ? ['refund', 'commission'] : ['commission', 'ride_payment'];

  if (normalized) {
    const direct = await WalletPaymentMode.findOne({
      modeId: normalized,
      enabled: true,
      flows: { $in: flowFilter },
      region: { $in: ['global', region] }
    }).lean();

    if (direct) return direct;
  }

  return WalletPaymentMode
    .findOne({ enabled: true, flows: { $in: flowFilter }, region: { $in: ['global', region] } })
    .sort({ displayOrder: 1, label: 1 })
    .lean();
}

function resolveCustomerCommissionOwner(region, customerCommissionConfig) {
  if (region === INTERNATIONAL_REGION) {
    return sanitizeText(customerCommissionConfig?.internationalWalletOwnerId || 'international_pool', 120) || 'international_pool';
  }
  return sanitizeText(customerCommissionConfig?.indiaWalletOwnerId || 'india_pool', 120) || 'india_pool';
}

async function processDriverRideSettlement(options = {}) {
  const bookingId = sanitizeText(options.bookingId, 140);
  const driverId = sanitizeText(options.driverId, 120);
  const customerId = sanitizeText(options.customerId, 120);
  const currency = sanitizeText(options.currency || 'INR', 8).toUpperCase() || 'INR';
  const grossAmount = toAmount(options.grossAmount);

  if (!bookingId || !driverId || !customerId) {
    const error = new Error('bookingId, driverId, and customerId are required');
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isFinite(grossAmount) || grossAmount <= 0) {
    const error = new Error('grossAmount must be greater than 0');
    error.statusCode = 400;
    throw error;
  }

  const config = await ensureDriverCommissionConfig();
  if (!config.enabled) {
    const error = new Error('Driver commission wallet is disabled by admin');
    error.statusCode = 403;
    throw error;
  }

  if (!config.autoSettlementEnabled && !options.forceSettle) {
    const error = new Error('Driver auto settlement is disabled by admin configuration');
    error.statusCode = 403;
    throw error;
  }

  if (grossAmount < Number(config.minGrossAmount || 0) || grossAmount > Number(config.maxGrossAmount || Number.MAX_SAFE_INTEGER)) {
    const error = new Error(`grossAmount must be between ${config.minGrossAmount} and ${config.maxGrossAmount}`);
    error.statusCode = 400;
    throw error;
  }

  const supported = new Set((config.supportedCurrencies || []).map((value) => sanitizeText(value, 8).toUpperCase()));
  if (supported.size && !supported.has(currency)) {
    const error = new Error(`Currency ${currency} is not enabled for driver settlement`);
    error.statusCode = 400;
    throw error;
  }

  const existing = await WalletTransaction.findOne({
    walletType: DRIVER_COMMISSION_WALLET_TYPE,
    ownerId: driverId,
    source: 'driver_ride_settlement',
    direction: 'credit',
    status: { $ne: 'failed' },
    'metadata.bookingId': bookingId
  }).lean();

  if (existing) {
    return {
      reused: true,
      wallet: await WalletAccount.findOne({ walletType: DRIVER_COMMISSION_WALLET_TYPE, ownerId: driverId }),
      region: existing?.metadata?.region,
      paymentMode: existing.paymentMode,
      paymentModeLabel: existing?.metadata?.paymentModeLabel || existing.paymentMode,
      providerReference: existing.providerReference,
      clientReference: existing.clientReference,
      breakdown: {
        grossAmount: Number(existing?.metadata?.grossAmount || 0),
        adminCommissionPercent: Number(existing?.metadata?.adminCommissionPercent || 0),
        customerCommissionPercent: Number(existing?.metadata?.customerCommissionPercent || 0),
        adminCommissionAmount: Number(existing?.metadata?.adminCommissionAmount || 0),
        customerCommissionAmount: Number(existing?.metadata?.customerCommissionAmount || 0),
        totalCommissionAmount: Number(existing?.metadata?.totalCommissionAmount || 0),
        driverNetAmount: Number(existing?.amount || 0)
      },
      config
    };
  }

  const region = resolveDriverCommissionRegion(options.customerRegion, currency);
  const mode = await resolveSettlementMode(options.paymentMode, region, false);
  if (!mode) {
    const error = new Error('No driver settlement payment mode is enabled by admin');
    error.statusCode = 400;
    throw error;
  }

  const requireProviderReference = config.requireProviderReference && !options.allowAutoProviderReference;
  let providerReference = sanitizeText(options.providerReference, 180);
  let autoGeneratedReference = false;

  if (!providerReference || providerReference.length < 5) {
    if (requireProviderReference) {
      const error = new Error('providerReference is required for secure driver settlement');
      error.statusCode = 400;
      throw error;
    }

    providerReference = `AUTO_DRV_${bookingId}_${Date.now()}`;
    autoGeneratedReference = true;
  }

  const clientReference = sanitizeText(options.clientReference, 140) || `DRV_${bookingId}_${driverId}`;
  const breakdown = buildSettlementBreakdown(grossAmount, region, config);

  const customerCommissionConfig = await ensureCommissionConfig();
  const customerCommissionWalletOwnerId = resolveCustomerCommissionOwner(region, customerCommissionConfig);

  const driverWallet = await creditWallet(DRIVER_COMMISSION_WALLET_TYPE, driverId, breakdown.driverNetAmount, currency, {
    region,
    lastSettlementBookingId: bookingId,
    lastSettlementAt: new Date()
  });

  const adminWallet = await creditWallet('admin', 'platform', breakdown.adminCommissionAmount, currency, {
    lastDriverSettlementBookingId: bookingId,
    lastDriverSettlementAt: new Date()
  });

  const customerCommissionWallet = await creditWallet(CUSTOMER_COMMISSION_WALLET_TYPE, customerCommissionWalletOwnerId, breakdown.customerCommissionAmount, currency, {
    region,
    source: 'driver_settlement',
    bookingId
  });

  await createTransaction({
    walletType: DRIVER_COMMISSION_WALLET_TYPE,
    ownerId: driverId,
    direction: 'credit',
    amount: breakdown.driverNetAmount,
    currency,
    source: 'driver_ride_settlement',
    status: 'settled',
    paymentMode: mode.modeId,
    clientReference,
    providerReference,
    description: `Driver settlement for booking ${bookingId}`,
    actorRole: sanitizeText(options.actorRole, 60) || 'system',
    actorId: sanitizeText(options.actorId, 120) || 'system',
    metadata: {
      bookingId,
      driverId,
      customerId,
      region,
      paymentModeLabel: mode.label,
      customerCommissionWalletOwnerId,
      autoGeneratedReference,
      grossAmount: breakdown.grossAmount,
      adminCommissionPercent: breakdown.adminCommissionPercent,
      customerCommissionPercent: breakdown.customerCommissionPercent,
      adminCommissionAmount: breakdown.adminCommissionAmount,
      customerCommissionAmount: breakdown.customerCommissionAmount,
      totalCommissionAmount: breakdown.totalCommissionAmount,
      driverNetAmount: breakdown.driverNetAmount,
      ip: sanitizeText(options.ip, 120),
      userAgent: sanitizeText(options.userAgent, 240),
      ...(options.metadata && typeof options.metadata === 'object' ? options.metadata : {})
    }
  });

  await createTransaction({
    walletType: 'admin',
    ownerId: 'platform',
    direction: 'credit',
    amount: breakdown.adminCommissionAmount,
    currency,
    source: 'driver_ride_admin_commission',
    status: 'settled',
    paymentMode: mode.modeId,
    clientReference,
    providerReference,
    description: `Admin commission from booking ${bookingId}`,
    actorRole: 'system',
    actorId: sanitizeText(options.actorId, 120) || 'system',
    metadata: {
      bookingId,
      driverId,
      customerId,
      region,
      adminCommissionAmount: breakdown.adminCommissionAmount
    }
  });

  await createTransaction({
    walletType: CUSTOMER_COMMISSION_WALLET_TYPE,
    ownerId: customerCommissionWalletOwnerId,
    direction: 'credit',
    amount: breakdown.customerCommissionAmount,
    currency,
    source: 'driver_ride_customer_commission',
    status: 'settled',
    paymentMode: mode.modeId,
    clientReference,
    providerReference,
    description: `Customer commission from booking ${bookingId}`,
    actorRole: 'system',
    actorId: sanitizeText(options.actorId, 120) || 'system',
    metadata: {
      bookingId,
      driverId,
      customerId,
      region,
      customerCommissionWalletOwnerId,
      customerCommissionAmount: breakdown.customerCommissionAmount
    }
  });

  return {
    reused: false,
    wallet: driverWallet,
    adminWallet,
    customerCommissionWallet,
    region,
    paymentMode: mode.modeId,
    paymentModeLabel: mode.label,
    providerReference,
    clientReference,
    autoGeneratedReference,
    breakdown,
    config
  };
}

async function processDriverRideRefund(options = {}) {
  const bookingId = sanitizeText(options.bookingId, 140);
  const driverId = sanitizeText(options.driverId, 120);

  if (!bookingId || !driverId) {
    const error = new Error('bookingId and driverId are required');
    error.statusCode = 400;
    throw error;
  }

  const settlementTx = await WalletTransaction.findOne({
    walletType: DRIVER_COMMISSION_WALLET_TYPE,
    ownerId: driverId,
    source: 'driver_ride_settlement',
    direction: 'credit',
    status: { $ne: 'failed' },
    'metadata.bookingId': bookingId
  }).sort({ createdAt: -1 }).lean();

  if (!settlementTx) {
    const error = new Error('Driver settlement not found for this booking');
    error.statusCode = 404;
    throw error;
  }

  const originalGrossAmount = Number(settlementTx?.metadata?.grossAmount || 0);

  const previousRefundRows = await WalletTransaction.find({
    walletType: DRIVER_COMMISSION_WALLET_TYPE,
    ownerId: driverId,
    source: 'driver_ride_refund',
    direction: 'debit',
    status: { $ne: 'failed' },
    'metadata.bookingId': bookingId
  }).lean();

  const refundedGrossAmount = Number(previousRefundRows.reduce((sum, row) => {
    const rowGross = Number(row?.metadata?.refundGrossAmount ?? row?.amount ?? 0);
    return sum + (Number.isFinite(rowGross) ? rowGross : 0);
  }, 0).toFixed(2));

  const remainingGrossAmount = Number((originalGrossAmount - refundedGrossAmount).toFixed(2));
  if (!Number.isFinite(remainingGrossAmount) || remainingGrossAmount <= 0) {
    const error = new Error('No refundable amount remaining for this booking');
    error.statusCode = 400;
    throw error;
  }

  const requestedRefund = toAmount(options.refundAmount ?? options.refundGrossAmount);
  const refundGrossAmount = Number.isFinite(requestedRefund) ? requestedRefund : remainingGrossAmount;

  if (!Number.isFinite(refundGrossAmount) || refundGrossAmount <= 0 || refundGrossAmount > remainingGrossAmount) {
    const error = new Error(`refundAmount must be between 0 and ${remainingGrossAmount}`);
    error.statusCode = 400;
    throw error;
  }

  const adminRate = Number(settlementTx?.metadata?.adminCommissionPercent || 0) / 100;
  const customerRate = Number(settlementTx?.metadata?.customerCommissionPercent || 0) / 100;
  let refundAdminCommissionAmount = Number((refundGrossAmount * adminRate).toFixed(2));
  let refundCustomerCommissionAmount = Number((refundGrossAmount * customerRate).toFixed(2));
  let refundDriverNetAmount = Number((refundGrossAmount - refundAdminCommissionAmount - refundCustomerCommissionAmount).toFixed(2));

  if (refundDriverNetAmount < 0) {
    refundDriverNetAmount = 0;
  }

  const region = sanitizeText(settlementTx?.metadata?.region, 40).toLowerCase() || INDIA_REGION;
  const currency = sanitizeText(options.currency || settlementTx.currency || 'INR', 8).toUpperCase() || 'INR';
  const mode = await resolveSettlementMode(options.paymentMode || settlementTx.paymentMode, region, true);
  if (!mode) {
    const error = new Error('No refund mode is enabled by admin');
    error.statusCode = 400;
    throw error;
  }

  const customerCommissionWalletOwnerId = sanitizeText(settlementTx?.metadata?.customerCommissionWalletOwnerId, 120)
    || resolveCustomerCommissionOwner(region, await ensureCommissionConfig());

  const providerReference = sanitizeText(options.providerReference, 180) || `AUTO_REF_${bookingId}_${Date.now()}`;
  const clientReference = sanitizeText(options.clientReference, 140) || `DRV_REF_${bookingId}_${Date.now()}`;

  const driverWallet = await debitWallet(DRIVER_COMMISSION_WALLET_TYPE, driverId, refundDriverNetAmount, currency, {
    lastRefundBookingId: bookingId,
    lastRefundAt: new Date()
  });

  const adminWallet = await debitWallet('admin', 'platform', refundAdminCommissionAmount, currency, {
    lastDriverRefundBookingId: bookingId,
    lastDriverRefundAt: new Date()
  });

  const customerCommissionWallet = await debitWallet(CUSTOMER_COMMISSION_WALLET_TYPE, customerCommissionWalletOwnerId, refundCustomerCommissionAmount, currency, {
    lastDriverRefundBookingId: bookingId,
    lastDriverRefundAt: new Date()
  });

  await createTransaction({
    walletType: DRIVER_COMMISSION_WALLET_TYPE,
    ownerId: driverId,
    direction: 'debit',
    amount: refundDriverNetAmount,
    currency,
    source: 'driver_ride_refund',
    status: 'settled',
    paymentMode: mode.modeId,
    clientReference,
    providerReference,
    description: `Driver refund for booking ${bookingId}`,
    actorRole: sanitizeText(options.actorRole, 60) || 'system',
    actorId: sanitizeText(options.actorId, 120) || 'system',
    metadata: {
      bookingId,
      driverId,
      refundGrossAmount,
      refundedGrossAmount,
      remainingGrossAmount: Number((remainingGrossAmount - refundGrossAmount).toFixed(2)),
      refundAdminCommissionAmount,
      refundCustomerCommissionAmount,
      refundDriverNetAmount,
      customerCommissionWalletOwnerId,
      refundReason: sanitizeText(options.refundReason, 200),
      ...(options.metadata && typeof options.metadata === 'object' ? options.metadata : {})
    }
  });

  return {
    wallet: driverWallet,
    adminWallet,
    customerCommissionWallet,
    paymentMode: mode.modeId,
    paymentModeLabel: mode.label,
    providerReference,
    clientReference,
    breakdown: {
      refundGrossAmount,
      refundedGrossAmount,
      remainingGrossAmount: Number((remainingGrossAmount - refundGrossAmount).toFixed(2)),
      refundAdminCommissionAmount,
      refundCustomerCommissionAmount,
      refundDriverNetAmount
    }
  };
}

async function getDriverCommissionHistory(driverId, limit = 50) {
  const ownerId = sanitizeText(driverId, 120);
  if (!ownerId) {
    const error = new Error('driverId is required');
    error.statusCode = 400;
    throw error;
  }

  return WalletTransaction
    .find({
      walletType: DRIVER_COMMISSION_WALLET_TYPE,
      ownerId,
      source: { $in: ['driver_ride_settlement', 'driver_ride_refund', 'driver_related_payment_credit', 'driver_related_payment_debit'] }
    })
    .sort({ createdAt: -1 })
    .limit(Math.min(100, Math.max(1, Number(limit || 50))))
    .lean();
}

async function buildDriverCommissionAdminSummary(limit = 100) {
  const config = await ensureDriverCommissionConfig();

  const totals = await WalletTransaction.aggregate([
    {
      $match: {
        walletType: DRIVER_COMMISSION_WALLET_TYPE,
        source: { $in: ['driver_ride_settlement', 'driver_ride_refund'] },
        status: { $ne: 'failed' }
      }
    },
    {
      $group: {
        _id: { source: '$source', currency: '$currency' },
        amount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);

  const paymentModes = await WalletPaymentMode
    .find({ enabled: true, flows: { $in: ['commission', 'ride_payment', 'refund'] } })
    .sort({ displayOrder: 1, label: 1 })
    .lean();

  const walletRows = await WalletAccount
    .find({ walletType: DRIVER_COMMISSION_WALLET_TYPE })
    .sort({ balance: -1, ownerId: 1 })
    .limit(Math.min(500, Math.max(20, Number(limit || 100))))
    .lean();

  const recentTransactions = await WalletTransaction
    .find({ walletType: DRIVER_COMMISSION_WALLET_TYPE })
    .sort({ createdAt: -1 })
    .limit(Math.min(200, Math.max(20, Number(limit || 100))))
    .lean();

  return {
    config,
    totals,
    paymentModes,
    walletRows,
    recentTransactions
  };
}

module.exports = {
  DRIVER_COMMISSION_WALLET_TYPE,
  ensureDriverCommissionConfig,
  updateDriverCommissionConfig,
  ensureDriverCommissionWallet,
  resolveDriverCommissionRegion,
  processDriverRideSettlement,
  processDriverRideRefund,
  getDriverCommissionHistory,
  buildDriverCommissionAdminSummary
};
