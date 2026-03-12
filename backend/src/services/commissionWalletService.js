const WalletAccount = require('../models/WalletAccount');
const WalletCommissionConfig = require('../models/WalletCommissionConfig');
const WalletPaymentMode = require('../models/WalletPaymentMode');
const WalletTransaction = require('../models/WalletTransaction');

const COMMISSION_WALLET_TYPE = 'customer_commission';
const COMMISSION_CONFIG_ID = 'customer_commission_default';
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

function resolveCommissionRegion(region, currency) {
  const normalizedRegion = sanitizeText(region, 40).toLowerCase();
  if (normalizedRegion === INDIA_REGION || normalizedRegion === INTERNATIONAL_REGION) {
    return normalizedRegion;
  }

  const normalizedCurrency = sanitizeText(currency || 'INR', 8).toUpperCase();
  if (normalizedCurrency === 'INR') {
    return INDIA_REGION;
  }

  return INTERNATIONAL_REGION;
}

function getOwnerIdForRegion(region, config) {
  if (region === INTERNATIONAL_REGION) {
    return sanitizeText(config?.internationalWalletOwnerId || 'international_pool', 120) || 'international_pool';
  }
  return sanitizeText(config?.indiaWalletOwnerId || 'india_pool', 120) || 'india_pool';
}

function ensurePositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

async function ensureCommissionConfig() {
  const config = await WalletCommissionConfig.findOneAndUpdate(
    { configId: COMMISSION_CONFIG_ID },
    {
      $setOnInsert: {
        configId: COMMISSION_CONFIG_ID,
        enabled: true,
        autoSettlementEnabled: true,
        requireProviderReference: true,
        indiaCommissionPercent: 12,
        internationalCommissionPercent: 15,
        indiaWalletOwnerId: 'india_pool',
        internationalWalletOwnerId: 'international_pool',
        minGrossAmount: 1,
        maxGrossAmount: 1000000,
        minCommissionAmount: 0,
        maxCommissionAmount: 1000000,
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

async function updateCommissionConfig(patch = {}) {
  const config = await ensureCommissionConfig();

  if (Object.prototype.hasOwnProperty.call(patch, 'enabled')) {
    config.enabled = Boolean(patch.enabled);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'autoSettlementEnabled')) {
    config.autoSettlementEnabled = Boolean(patch.autoSettlementEnabled);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'requireProviderReference')) {
    config.requireProviderReference = Boolean(patch.requireProviderReference);
  }

  const indiaRate = toAmount(patch.indiaCommissionPercent);
  if (Number.isFinite(indiaRate)) {
    if (indiaRate < 0 || indiaRate > 100) {
      const error = new Error('indiaCommissionPercent must be between 0 and 100');
      error.statusCode = 400;
      throw error;
    }
    config.indiaCommissionPercent = indiaRate;
  }

  const intlRate = toAmount(patch.internationalCommissionPercent);
  if (Number.isFinite(intlRate)) {
    if (intlRate < 0 || intlRate > 100) {
      const error = new Error('internationalCommissionPercent must be between 0 and 100');
      error.statusCode = 400;
      throw error;
    }
    config.internationalCommissionPercent = intlRate;
  }

  const indiaOwner = sanitizeText(patch.indiaWalletOwnerId, 120);
  if (indiaOwner) {
    config.indiaWalletOwnerId = indiaOwner;
  }

  const internationalOwner = sanitizeText(patch.internationalWalletOwnerId, 120);
  if (internationalOwner) {
    config.internationalWalletOwnerId = internationalOwner;
  }

  const minGrossAmount = toAmount(patch.minGrossAmount);
  if (Number.isFinite(minGrossAmount)) {
    config.minGrossAmount = ensurePositiveNumber(minGrossAmount, config.minGrossAmount);
  }

  const maxGrossAmount = toAmount(patch.maxGrossAmount);
  if (Number.isFinite(maxGrossAmount)) {
    config.maxGrossAmount = ensurePositiveNumber(maxGrossAmount, config.maxGrossAmount);
  }

  const minCommissionAmount = toAmount(patch.minCommissionAmount);
  if (Number.isFinite(minCommissionAmount)) {
    config.minCommissionAmount = ensurePositiveNumber(minCommissionAmount, config.minCommissionAmount);
  }

  const maxCommissionAmount = toAmount(patch.maxCommissionAmount);
  if (Number.isFinite(maxCommissionAmount)) {
    config.maxCommissionAmount = ensurePositiveNumber(maxCommissionAmount, config.maxCommissionAmount);
  }

  if (config.maxGrossAmount < config.minGrossAmount) {
    const error = new Error('maxGrossAmount must be >= minGrossAmount');
    error.statusCode = 400;
    throw error;
  }

  if (config.maxCommissionAmount < config.minCommissionAmount) {
    const error = new Error('maxCommissionAmount must be >= minCommissionAmount');
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

async function ensureCommissionWalletForRegion(region, currency = 'INR', config) {
  const activeConfig = config || await ensureCommissionConfig();
  const ownerId = getOwnerIdForRegion(region, activeConfig);

  return WalletAccount.findOneAndUpdate(
    { walletType: COMMISSION_WALLET_TYPE, ownerId },
    {
      $setOnInsert: {
        walletType: COMMISSION_WALLET_TYPE,
        ownerId,
        currency: sanitizeText(currency || 'INR', 8).toUpperCase(),
        balance: 0,
        status: 'active',
        metadata: {
          region: resolveCommissionRegion(region, currency),
          controlledBy: 'admin'
        }
      }
    },
    { new: true, upsert: true }
  );
}

async function findCommissionMode(modeId, region) {
  const normalizedMode = sanitizeText(modeId, 80).toLowerCase();
  if (!normalizedMode) return null;

  return WalletPaymentMode.findOne({
    modeId: normalizedMode,
    enabled: true,
    flows: { $in: ['commission', 'ride_payment'] },
    region: { $in: ['global', region] }
  }).lean();
}

async function getDefaultCommissionMode(region) {
  return WalletPaymentMode
    .findOne({ enabled: true, flows: { $in: ['commission', 'ride_payment'] }, region: { $in: ['global', region] } })
    .sort({ displayOrder: 1, label: 1 })
    .lean();
}

function buildCommissionBreakdown(grossAmount, region, config) {
  const numericGross = toAmount(grossAmount);
  const rate = region === INTERNATIONAL_REGION
    ? Number(config.internationalCommissionPercent || 0)
    : Number(config.indiaCommissionPercent || 0);

  const computedRaw = Number(((numericGross * rate) / 100).toFixed(2));
  const boundedHigh = Math.min(computedRaw, Number(config.maxCommissionAmount || computedRaw), numericGross);
  const bounded = Math.max(Number(config.minCommissionAmount || 0), boundedHigh);
  const commissionAmount = Number(bounded.toFixed(2));

  return {
    grossAmount: numericGross,
    commissionPercent: Number(rate.toFixed(2)),
    commissionAmount,
    netAmount: Number((numericGross - commissionAmount).toFixed(2))
  };
}

async function createWalletTransaction(payload) {
  return WalletTransaction.create({
    transactionId: generateId('WTX'),
    ...payload
  });
}

async function creditCommissionWallet({ ownerId, amount, currency, region, metadata = {} }) {
  const existingWallet = await WalletAccount.findOne({
    walletType: COMMISSION_WALLET_TYPE,
    ownerId
  }).lean();

  if (existingWallet && existingWallet.status !== 'active') {
    const error = new Error('Commission wallet is not active');
    error.statusCode = 403;
    throw error;
  }

  const wallet = await WalletAccount.findOneAndUpdate(
    { walletType: COMMISSION_WALLET_TYPE, ownerId },
    {
      $setOnInsert: {
        walletType: COMMISSION_WALLET_TYPE,
        ownerId,
        status: 'active'
      },
      $set: {
        currency: sanitizeText(currency || 'INR', 8).toUpperCase(),
        'metadata.region': region,
        'metadata.controlledBy': 'admin',
        'metadata.lastCreditAt': new Date(),
        'metadata.lastCreditRef': sanitizeText(metadata.providerReference, 180) || null
      },
      $inc: {
        balance: Number(amount || 0)
      }
    },
    { new: true, upsert: true }
  );

  if (!wallet || wallet.status !== 'active') {
    const error = new Error('Commission wallet is not active');
    error.statusCode = 403;
    throw error;
  }

  return wallet;
}

async function collectCustomerPaymentToCommissionWallet(options = {}) {
  const bookingId = sanitizeText(options.bookingId, 140);
  const customerId = sanitizeText(options.customerId, 120);
  const currency = sanitizeText(options.currency || 'INR', 8).toUpperCase() || 'INR';
  const amount = toAmount(options.grossAmount);
  const config = await ensureCommissionConfig();

  if (!bookingId) {
    const error = new Error('bookingId is required');
    error.statusCode = 400;
    throw error;
  }

  if (!customerId) {
    const error = new Error('customerId is required');
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    const error = new Error('grossAmount must be greater than 0');
    error.statusCode = 400;
    throw error;
  }

  if (!config.enabled) {
    const error = new Error('Customer commission wallet is disabled by admin');
    error.statusCode = 403;
    throw error;
  }

  if (!config.autoSettlementEnabled && !options.forceSettle) {
    const error = new Error('Auto settlement is disabled by admin configuration');
    error.statusCode = 403;
    throw error;
  }

  if (amount < Number(config.minGrossAmount || 0) || amount > Number(config.maxGrossAmount || Number.MAX_SAFE_INTEGER)) {
    const error = new Error(`grossAmount must be between ${config.minGrossAmount} and ${config.maxGrossAmount}`);
    error.statusCode = 400;
    throw error;
  }

  if (Array.isArray(config.supportedCurrencies) && config.supportedCurrencies.length) {
    const supported = new Set(config.supportedCurrencies.map((value) => sanitizeText(value, 8).toUpperCase()));
    if (!supported.has(currency)) {
      const error = new Error(`Currency ${currency} is not enabled by admin`);
      error.statusCode = 400;
      throw error;
    }
  }

  const existingCredit = await WalletTransaction.findOne({
    walletType: COMMISSION_WALLET_TYPE,
    source: 'customer_payment_collected',
    direction: 'credit',
    status: { $ne: 'failed' },
    'metadata.bookingId': bookingId,
    'metadata.customerId': customerId
  }).lean();

  if (existingCredit) {
    const existingWallet = await WalletAccount.findOne({
      walletType: COMMISSION_WALLET_TYPE,
      ownerId: existingCredit.ownerId
    }).lean();

    return {
      reused: true,
      wallet: existingWallet,
      ownerId: existingCredit.ownerId,
      region: existingCredit?.metadata?.region || resolveCommissionRegion(options.customerRegion, currency),
      paymentMode: existingCredit.paymentMode,
      providerReference: existingCredit.providerReference,
      clientReference: existingCredit.clientReference,
      breakdown: {
        grossAmount: existingCredit.amount,
        commissionPercent: Number(existingCredit?.metadata?.commissionPercent || 0),
        commissionAmount: Number(existingCredit?.metadata?.commissionAmount || 0),
        netAmount: Number(existingCredit?.metadata?.netAmount || 0)
      },
      config
    };
  }

  const region = resolveCommissionRegion(options.customerRegion, currency);
  const ownerId = getOwnerIdForRegion(region, config);

  let mode = await findCommissionMode(options.paymentMode, region);
  if (!mode) {
    mode = await getDefaultCommissionMode(region);
  }
  if (!mode) {
    const error = new Error('No commission payment mode is enabled by admin');
    error.statusCode = 400;
    throw error;
  }

  let providerReference = sanitizeText(options.providerReference, 180);
  let autoGeneratedReference = false;
  const mustProvideReference = config.requireProviderReference && !options.allowAutoProviderReference;

  if (!providerReference || providerReference.length < 5) {
    if (mustProvideReference) {
      const error = new Error('providerReference is required for secure settlement');
      error.statusCode = 400;
      throw error;
    }
    providerReference = `AUTO_${bookingId}_${Date.now()}`;
    autoGeneratedReference = true;
  }

  const clientReference = sanitizeText(options.clientReference, 140)
    || `CM_${bookingId}_${customerId}`;

  const breakdown = buildCommissionBreakdown(amount, region, config);
  const wallet = await creditCommissionWallet({
    ownerId,
    amount,
    currency,
    region,
    metadata: {
      providerReference,
      bookingId,
      customerId
    }
  });

  await createWalletTransaction({
    walletType: COMMISSION_WALLET_TYPE,
    ownerId,
    direction: 'credit',
    amount,
    currency,
    source: 'customer_payment_collected',
    status: 'settled',
    paymentMode: mode.modeId,
    clientReference,
    providerReference,
    description: `Customer payment collected for booking ${bookingId}`,
    actorRole: sanitizeText(options.actorRole, 60) || 'system',
    actorId: sanitizeText(options.actorId, 120) || 'system',
    metadata: {
      bookingId,
      customerId,
      region,
      grossAmount: breakdown.grossAmount,
      commissionPercent: breakdown.commissionPercent,
      commissionAmount: breakdown.commissionAmount,
      netAmount: breakdown.netAmount,
      modeLabel: mode.label,
      autoGeneratedReference,
      ip: sanitizeText(options.ip, 120),
      userAgent: sanitizeText(options.userAgent, 240),
      ...(options.metadata && typeof options.metadata === 'object' ? options.metadata : {})
    }
  });

  await createWalletTransaction({
    walletType: COMMISSION_WALLET_TYPE,
    ownerId,
    direction: 'hold',
    amount: breakdown.commissionAmount,
    currency,
    source: 'customer_commission_component',
    status: 'settled',
    paymentMode: mode.modeId,
    clientReference,
    providerReference,
    description: `Commission component (${breakdown.commissionPercent}%) for booking ${bookingId}`,
    actorRole: 'system',
    actorId: 'system',
    metadata: {
      bookingId,
      customerId,
      region,
      grossAmount: breakdown.grossAmount,
      commissionPercent: breakdown.commissionPercent,
      commissionAmount: breakdown.commissionAmount,
      netAmount: breakdown.netAmount
    }
  });

  return {
    reused: false,
    wallet,
    ownerId,
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

async function buildCommissionAdminSummary(limit = 100) {
  const config = await ensureCommissionConfig();
  const indiaWallet = await ensureCommissionWalletForRegion(INDIA_REGION, 'INR', config);
  const internationalWallet = await ensureCommissionWalletForRegion(INTERNATIONAL_REGION, 'USD', config);

  const rows = await WalletTransaction
    .find({ walletType: COMMISSION_WALLET_TYPE })
    .sort({ createdAt: -1 })
    .limit(Math.min(500, Math.max(10, Number(limit || 100))))
    .lean();

  const totalsByRegion = await WalletTransaction.aggregate([
    {
      $match: {
        walletType: COMMISSION_WALLET_TYPE,
        source: 'customer_payment_collected',
        direction: 'credit',
        status: { $ne: 'failed' }
      }
    },
    {
      $group: {
        _id: { region: '$metadata.region', currency: '$currency' },
        grossAmount: { $sum: '$amount' },
        commissionAmount: { $sum: '$metadata.commissionAmount' },
        netAmount: { $sum: '$metadata.netAmount' },
        count: { $sum: 1 }
      }
    }
  ]);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todaysSettlements = await WalletTransaction.countDocuments({
    walletType: COMMISSION_WALLET_TYPE,
    source: 'customer_payment_collected',
    direction: 'credit',
    createdAt: { $gte: todayStart },
    status: { $ne: 'failed' }
  });

  const paymentModes = await WalletPaymentMode
    .find({ enabled: true, flows: { $in: ['commission', 'ride_payment'] } })
    .sort({ displayOrder: 1, label: 1 })
    .lean();

  return {
    config,
    wallets: {
      india: indiaWallet,
      international: internationalWallet
    },
    totalsByRegion,
    todaysSettlements,
    paymentModes,
    recentTransactions: rows
  };
}

module.exports = {
  COMMISSION_WALLET_TYPE,
  INDIA_REGION,
  INTERNATIONAL_REGION,
  ensureCommissionConfig,
  updateCommissionConfig,
  resolveCommissionRegion,
  ensureCommissionWalletForRegion,
  collectCustomerPaymentToCommissionWallet,
  buildCommissionAdminSummary
};

