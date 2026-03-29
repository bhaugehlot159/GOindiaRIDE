const express = require('express');
const WalletAccount = require('../models/WalletAccount');
const WalletPaymentMode = require('../models/WalletPaymentMode');
const WalletTopupOrder = require('../models/WalletTopupOrder');
const WalletTransaction = require('../models/WalletTransaction');
const WalletWithdrawalRequest = require('../models/WalletWithdrawalRequest');
const { authenticate } = require('../middleware/authMiddleware');
const { walletCriticalLimiter } = require('../middleware/rateLimiters');
const { verifyApiSignature } = require('../middleware/requestSignatureMiddleware');
const { getClientIp } = require('../utils/device');
const { logSecurityEvent } = require('../services/securityLogService');
const {
  COMMISSION_WALLET_TYPE,
  ensureCommissionConfig,
  updateCommissionConfig,
  collectCustomerPaymentToCommissionWallet,
  buildCommissionAdminSummary,
  ensureCommissionWalletForRegion,
  resolveCommissionRegion
} = require('../services/commissionWalletService');
const {
  DRIVER_COMMISSION_WALLET_TYPE,
  ensureDriverCommissionConfig,
  updateDriverCommissionConfig,
  ensureDriverCommissionWallet,
  resolveDriverCommissionRegion,
  processDriverRideSettlement,
  processDriverRideRefund,
  getDriverCommissionHistory,
  buildDriverCommissionAdminSummary
} = require('../services/driverCommissionWalletService');

const router = express.Router();
const WALLET_TYPES = new Set(['customer', 'driver', 'admin', 'donation', COMMISSION_WALLET_TYPE, DRIVER_COMMISSION_WALLET_TYPE]);
const TOPUP_ALLOWED_TYPES = new Set(['customer', 'driver']);
const TOPUP_MIN = 10;
const TOPUP_MAX = 500000;
const WITHDRAW_MIN = 100;
const WITHDRAW_MAX = 100000;
const WITHDRAW_DAILY_LIMIT = 200000;
const TOPUP_EXPIRY_MS = 20 * 60 * 1000;
const DONATION_MIN = 1;
const DONATION_MAX = 1000000;
const DONATION_EXPIRY_MS = 30 * 60 * 1000;
const COMMISSION_ALERT_AMOUNT = 200000;
const WALLET_STRICT_SIGNATURE = String(process.env.WALLET_STRICT_SIGNATURE || process.env.STRICT_SECURITY_MODE || 'true').trim().toLowerCase() === 'true';
const RUNTIME_AUTO_DEDUCT_REQUIRE_OTP = String(process.env.RUNTIME_AUTO_DEDUCT_REQUIRE_OTP || 'true').trim().toLowerCase() === 'true';
const RUNTIME_AUTO_DEDUCT_HIGH_VALUE = Math.max(1000, Number(process.env.RUNTIME_AUTO_DEDUCT_HIGH_VALUE || 50000));
const AUTO_DEDUCT_REF_MIN_LENGTH = Math.max(6, Number(process.env.AUTO_DEDUCT_REF_MIN_LENGTH || 8));
const WALLET_CONFIRM_LOCK_TTL_MS = Math.max(30 * 1000, Number(process.env.WALLET_CONFIRM_LOCK_TTL_MS || 3 * 60 * 1000));
const WALLET_REVIEW_LOCK_TTL_MS = Math.max(30 * 1000, Number(process.env.WALLET_REVIEW_LOCK_TTL_MS || 3 * 60 * 1000));

const DEFAULT_PAYMENT_MODES = [
  { modeId: 'upi_intent', label: 'UPI Intent (PhonePe, Google Pay, Paytm)', region: 'india', enabled: true, flows: ['add_money', 'ride_payment', 'refund', 'donation'], displayOrder: 1 },
  { modeId: 'upi_qr', label: 'UPI QR Scan', region: 'india', enabled: true, flows: ['add_money', 'ride_payment', 'donation'], displayOrder: 2 },
  { modeId: 'bharat_qr', label: 'Bharat QR', region: 'india', enabled: true, flows: ['add_money', 'donation'], displayOrder: 3 },
  { modeId: 'rupay_card', label: 'RuPay Card', region: 'india', enabled: true, flows: ['add_money', 'ride_payment', 'refund', 'donation'], displayOrder: 4 },
  { modeId: 'visa_master_amex', label: 'Visa/MasterCard/Amex', region: 'global', enabled: true, flows: ['add_money', 'ride_payment', 'refund', 'donation'], displayOrder: 5 },
  { modeId: 'net_banking', label: 'Net Banking', region: 'india', enabled: true, flows: ['add_money', 'ride_payment', 'withdrawal', 'donation'], displayOrder: 6 },
  { modeId: 'imps', label: 'IMPS Transfer', region: 'india', enabled: true, flows: ['withdrawal', 'donation'], displayOrder: 7 },
  { modeId: 'neft_rtgs', label: 'NEFT/RTGS', region: 'india', enabled: true, flows: ['withdrawal', 'donation'], displayOrder: 8 },
  { modeId: 'razorpay', label: 'Razorpay Gateway', region: 'india', enabled: true, flows: ['add_money', 'ride_payment', 'refund', 'donation'], displayOrder: 9 },
  { modeId: 'cashfree', label: 'Cashfree Gateway', region: 'india', enabled: true, flows: ['add_money', 'ride_payment', 'refund', 'donation'], displayOrder: 10 },
  { modeId: 'stripe_cards', label: 'Stripe Cards', region: 'international', enabled: true, flows: ['add_money', 'ride_payment', 'refund', 'donation'], displayOrder: 11 },
  { modeId: 'paypal', label: 'PayPal', region: 'international', enabled: true, flows: ['add_money', 'ride_payment', 'withdrawal', 'refund', 'donation'], displayOrder: 12 },
  { modeId: 'apple_pay', label: 'Apple Pay', region: 'international', enabled: true, flows: ['add_money', 'ride_payment', 'donation'], displayOrder: 13 },
  { modeId: 'google_pay_intl', label: 'Google Pay (International)', region: 'international', enabled: true, flows: ['add_money', 'ride_payment', 'donation'], displayOrder: 14 },
  { modeId: 'alipay', label: 'Alipay', region: 'international', enabled: true, flows: ['add_money', 'ride_payment', 'donation'], displayOrder: 15 },
  { modeId: 'wechat_pay', label: 'WeChat Pay', region: 'international', enabled: true, flows: ['add_money', 'ride_payment', 'donation'], displayOrder: 16 },
  { modeId: 'swift_wire', label: 'SWIFT Wire Transfer', region: 'international', enabled: true, flows: ['withdrawal', 'donation'], displayOrder: 17 },
  { modeId: 'sepa', label: 'SEPA Transfer', region: 'international', enabled: true, flows: ['withdrawal', 'donation'], displayOrder: 18 },
  { modeId: 'ach', label: 'ACH Transfer', region: 'international', enabled: true, flows: ['withdrawal', 'donation'], displayOrder: 19 },
  { modeId: 'wise', label: 'Wise Transfer', region: 'international', enabled: true, flows: ['withdrawal', 'donation'], displayOrder: 20 }
];

let modesSeeded = false;

function toAmount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return NaN;
  return Number(parsed.toFixed(2));
}

function sanitizeText(value, maxLen = 180) {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
}

function resolveActorWalletType(user) {
  if (!user) return 'customer';
  if (user.role === 'admin' || user.accountType === 'admin') return 'admin';
  if (user.accountType === 'driver') return 'driver';
  return 'customer';
}

function canAccessDriverCommissionWallet(req, ownerId) {
  const actorType = resolveActorWalletType(req.user);
  if (actorType === 'admin') return true;
  return actorType === 'driver' && String(req.user.id) === String(ownerId);
}

function ensureWalletType(value) {
  const walletType = String(value || '').toLowerCase();
  if (!WALLET_TYPES.has(walletType)) {
    const error = new Error('Unsupported wallet type');
    error.statusCode = 400;
    throw error;
  }
  return walletType;
}

function normalizeOwnerId(walletType, ownerId) {
  if (walletType === 'admin') return 'platform';
  if (walletType === 'donation') return 'pool';
  const normalized = sanitizeText(ownerId, 120);
  if (!normalized) {
    const error = new Error('ownerId is required');
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

function assertCanAccessWallet(req, walletType, ownerId) {
  const actorType = resolveActorWalletType(req.user);
  if (actorType === 'admin') return;

  if (walletType === 'admin') {
    const error = new Error('Forbidden wallet access');
    error.statusCode = 403;
    throw error;
  }

  if (walletType === 'donation') {
    if (actorType !== 'admin') {
      const error = new Error('Donation pool is admin managed');
      error.statusCode = 403;
      throw error;
    }
    return;
  }

  if (walletType === COMMISSION_WALLET_TYPE) {
    const error = new Error('Commission wallet is admin managed');
    error.statusCode = 403;
    throw error;
  }

  if (walletType === DRIVER_COMMISSION_WALLET_TYPE) {
    if (!canAccessDriverCommissionWallet(req, ownerId)) {
      const error = new Error('Driver commission wallet is restricted');
      error.statusCode = 403;
      throw error;
    }
    return;
  }

  if (String(req.user.id) !== String(ownerId) || actorType !== walletType) {
    const error = new Error('Forbidden wallet access');
    error.statusCode = 403;
    throw error;
  }
}

async function ensureWallet(walletType, ownerId, currency = 'INR') {
  const normalizedType = ensureWalletType(walletType);
  const normalizedOwner = normalizeOwnerId(normalizedType, ownerId);

  return WalletAccount.findOneAndUpdate(
    { walletType: normalizedType, ownerId: normalizedOwner },
    {
      $setOnInsert: {
        walletType: normalizedType,
        ownerId: normalizedOwner,
        currency: String(currency || 'INR').toUpperCase(),
        balance: 0,
        status: 'active',
        metadata: {}
      }
    },
    { new: true, upsert: true }
  );
}

async function ensurePaymentModesSeeded() {
  if (modesSeeded) return;

  await Promise.all(DEFAULT_PAYMENT_MODES.map((mode) => {
    const mergedFlows = Array.from(new Set([...(Array.isArray(mode.flows) ? mode.flows : []), 'commission']));

    return WalletPaymentMode.updateOne(
      { modeId: mode.modeId },
      {
        $set: {
          label: mode.label,
          region: mode.region,
          enabled: Boolean(mode.enabled),
          displayOrder: mode.displayOrder
        },
        $addToSet: { flows: { $each: mergedFlows } }
      },
      { upsert: true }
    );
  }));

  modesSeeded = true;
}

async function getEnabledModesForFlow(flow) {
  await ensurePaymentModesSeeded();
  const normalizedFlow = sanitizeText(flow, 40).toLowerCase();

  return WalletPaymentMode
    .find({ enabled: true, flows: normalizedFlow })
    .sort({ displayOrder: 1, label: 1 })
    .lean();
}

async function findMode(modeId, flow) {
  const normalizedMode = sanitizeText(modeId, 80).toLowerCase();
  if (!normalizedMode) return null;

  await ensurePaymentModesSeeded();

  return WalletPaymentMode.findOne({
    modeId: normalizedMode,
    enabled: true,
    flows: sanitizeText(flow, 40).toLowerCase()
  }).lean();
}

async function createWalletTransaction(payload) {
  const transaction = await WalletTransaction.create({
    transactionId: generateId('WTX'),
    ...payload
  });

  return transaction;
}

async function adjustWallet({ walletType, ownerId, amount, direction }) {
  const normalizedType = ensureWalletType(walletType);
  const normalizedOwner = normalizeOwnerId(normalizedType, ownerId);
  const numericAmount = toAmount(amount);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    const error = new Error('Invalid amount');
    error.statusCode = 400;
    throw error;
  }

  if (!['credit', 'debit'].includes(direction)) {
    const error = new Error('Invalid wallet adjustment direction');
    error.statusCode = 400;
    throw error;
  }

  await ensureWallet(normalizedType, normalizedOwner);

  const updateFilter = {
    walletType: normalizedType,
    ownerId: normalizedOwner,
    status: 'active'
  };
  if (direction === 'debit') {
    updateFilter.balance = { $gte: numericAmount };
  }

  const wallet = await WalletAccount.findOneAndUpdate(
    updateFilter,
    { $inc: { balance: direction === 'debit' ? -numericAmount : numericAmount } },
    { new: true }
  );

  if (wallet) {
    return wallet;
  }

  const currentWallet = await WalletAccount.findOne({
    walletType: normalizedType,
    ownerId: normalizedOwner
  }).lean();

  if (!currentWallet || currentWallet.status !== 'active') {
    const error = new Error('Wallet is not active');
    error.statusCode = 403;
    throw error;
  }

  if (direction === 'debit') {
    const error = new Error('Insufficient wallet balance');
    error.statusCode = 400;
    throw error;
  }

  return WalletAccount.findOne({
    walletType: normalizedType,
    ownerId: normalizedOwner
  });
}

function wrapAsync(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

function requireAdmin(req, res, next) {
  if (resolveActorWalletType(req.user) !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  return next();
}

function strictWalletSignature(req, res, next) {
  if (!WALLET_STRICT_SIGNATURE) {
    return next();
  }
  return verifyApiSignature(req, res, next);
}

function buildLockQuery(lockField, lockAtField, ttlMs) {
  return {
    $or: [
      { [lockField]: { $ne: true } },
      { [lockAtField]: { $lte: new Date(Date.now() - ttlMs) } }
    ]
  };
}

async function claimTopupOrderConfirmationLock({ orderId, walletType, ownerId, actorId, providerReference }) {
  return WalletTopupOrder.findOneAndUpdate(
    {
      orderId,
      walletType,
      ownerId,
      status: 'pending',
      ...buildLockQuery('metadata.confirmationLock', 'metadata.confirmationLockAt', WALLET_CONFIRM_LOCK_TTL_MS)
    },
    {
      $set: {
        'metadata.confirmationLock': true,
        'metadata.confirmationLockAt': new Date(),
        'metadata.confirmationLockActorId': sanitizeText(actorId, 120),
        'metadata.confirmationLockProviderReference': sanitizeText(providerReference, 180)
      }
    },
    { new: true }
  );
}

async function releaseTopupOrderConfirmationLock(orderId, reason = 'released') {
  if (!orderId) return;
  await WalletTopupOrder.updateOne(
    { _id: orderId },
    {
      $set: {
        'metadata.confirmationLock': false,
        'metadata.confirmationLockReleasedAt': new Date(),
        'metadata.confirmationLockReason': sanitizeText(reason, 120)
      }
    }
  );
}

async function claimWithdrawalReviewLock({ requestId, actorId, decision }) {
  return WalletWithdrawalRequest.findOneAndUpdate(
    {
      requestId,
      status: 'pending_admin_approval',
      ...buildLockQuery('metadata.reviewLock', 'metadata.reviewLockAt', WALLET_REVIEW_LOCK_TTL_MS)
    },
    {
      $set: {
        'metadata.reviewLock': true,
        'metadata.reviewLockAt': new Date(),
        'metadata.reviewLockActorId': sanitizeText(actorId, 120),
        'metadata.reviewDecision': sanitizeText(decision, 40)
      }
    },
    { new: true }
  );
}

async function releaseWithdrawalReviewLock(requestMongoId, reason = 'released') {
  if (!requestMongoId) return;
  await WalletWithdrawalRequest.updateOne(
    { _id: requestMongoId },
    {
      $set: {
        'metadata.reviewLock': false,
        'metadata.reviewLockReleasedAt': new Date(),
        'metadata.reviewLockReason': sanitizeText(reason, 120)
      }
    }
  );
}

router.use(authenticate);

router.get('/my', wrapAsync(async (req, res) => {
  const actorType = resolveActorWalletType(req.user);
  const ownerId = String(req.user.id);

  const primaryWallet = await ensureWallet(actorType === 'admin' ? 'admin' : actorType, actorType === 'admin' ? 'platform' : ownerId);
  const donationWallet = await ensureWallet('donation', 'pool');
  const modes = await getEnabledModesForFlow('add_money');
  const commissionConfig = actorType === 'admin' ? await ensureCommissionConfig() : null;
  const commissionWallets = actorType === 'admin'
    ? {
      india: await ensureCommissionWalletForRegion('india', 'INR', commissionConfig),
      international: await ensureCommissionWalletForRegion('international', 'USD', commissionConfig)
    }
    : null;
  const driverCommissionConfig = actorType === 'admin' ? await ensureDriverCommissionConfig() : null;
  const driverCommissionWallet = actorType === 'driver'
    ? await ensureDriverCommissionWallet(ownerId, primaryWallet.currency || 'INR', resolveDriverCommissionRegion(req.query.region, primaryWallet.currency || 'INR'))
    : null;

  const txRows = await WalletTransaction
    .find({ walletType: primaryWallet.walletType, ownerId: primaryWallet.ownerId })
    .sort({ createdAt: -1 })
    .limit(30)
    .lean();

  const driverCommissionRows = actorType === 'driver'
    ? await getDriverCommissionHistory(ownerId, 30)
    : [];

  const withdrawalWalletFilter = actorType === 'driver'
    ? { $in: ['driver', DRIVER_COMMISSION_WALLET_TYPE] }
    : actorType;

  const withdrawalRows = actorType === 'admin'
    ? []
    : await WalletWithdrawalRequest
      .find({ walletType: withdrawalWalletFilter, ownerId })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

  return res.status(200).json({
    mode: 'secure_backend',
    wallet: primaryWallet,
    donationWallet,
    commissionWallets,
    commissionConfig,
    driverCommissionWallet,
    driverCommissionConfig,
    paymentModes: modes,
    transactions: txRows,
    driverCommissionTransactions: driverCommissionRows,
    withdrawals: withdrawalRows
  });
}));
router.get('/transactions', wrapAsync(async (req, res) => {
  const actorType = resolveActorWalletType(req.user);
  const defaultWalletType = actorType === 'driver' ? DRIVER_COMMISSION_WALLET_TYPE : actorType;
  const walletType = ensureWalletType(req.query.walletType || defaultWalletType);
  const ownerId = normalizeOwnerId(walletType, req.query.ownerId || (walletType === 'admin' ? 'platform' : req.user.id));
  assertCanAccessWallet(req, walletType, ownerId);

  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));

  const rows = await WalletTransaction
    .find({ walletType, ownerId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return res.status(200).json({ walletType, ownerId, rows });
}));

router.get('/withdrawals', wrapAsync(async (req, res) => {
  const actorType = resolveActorWalletType(req.user);
  const defaultWalletType = actorType === 'driver' ? DRIVER_COMMISSION_WALLET_TYPE : actorType;
  const walletType = ensureWalletType(req.query.walletType || defaultWalletType);

  if (!['customer', 'driver', 'donation', DRIVER_COMMISSION_WALLET_TYPE].includes(walletType)) {
    return res.status(400).json({ message: 'Withdrawals are supported for customer, driver, donation, and driver commission wallets' });
  }

  const ownerId = normalizeOwnerId(walletType, req.query.ownerId || req.user.id);
  assertCanAccessWallet(req, walletType, ownerId);

  const query = { walletType, ownerId };
  const status = sanitizeText(req.query.status, 60).toLowerCase();
  if (status) {
    query.status = status;
  }

  const rows = await WalletWithdrawalRequest
    .find(query)
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  return res.status(200).json({ walletType, ownerId, rows });
}));

router.post('/topup/order', wrapAsync(async (req, res) => {
  const actorType = resolveActorWalletType(req.user);
  if (!TOPUP_ALLOWED_TYPES.has(actorType)) {
    return res.status(403).json({ message: 'Top-up not allowed for this account' });
  }

  const ownerId = String(req.user.id);
  const amount = toAmount(req.body.amount);
  const currency = sanitizeText(req.body.currency || 'INR', 6).toUpperCase() || 'INR';
  const paymentMode = sanitizeText(req.body.paymentMode, 80).toLowerCase();
  const clientReference = sanitizeText(req.body.clientReference, 120) || null;

  if (!Number.isFinite(amount) || amount < TOPUP_MIN || amount > TOPUP_MAX) {
    return res.status(400).json({ message: `Top-up amount must be between ${TOPUP_MIN} and ${TOPUP_MAX}` });
  }

  const mode = await findMode(paymentMode, 'add_money');
  if (!mode) {
    return res.status(400).json({ message: 'Selected add-money payment mode is not enabled by admin' });
  }

  if (clientReference) {
    const duplicate = await WalletTopupOrder.findOne({
      walletType: actorType,
      ownerId,
      clientReference,
      status: { $in: ['pending', 'confirmed'] }
    }).lean();

    if (duplicate) {
      return res.status(200).json({
        reused: true,
        order: duplicate
      });
    }
  }

  const order = await WalletTopupOrder.create({
    orderId: generateId('WTO'),
    walletType: actorType,
    ownerId,
    amount,
    currency,
    paymentMode: mode.modeId,
    paymentModeLabel: mode.label,
    status: 'pending',
    clientReference,
    initiatedBy: String(req.user.id),
    expiresAt: new Date(Date.now() + TOPUP_EXPIRY_MS),
    metadata: {
      ip: getClientIp(req),
      userAgent: sanitizeText(req.headers['user-agent'], 240)
    }
  });

  await createWalletTransaction({
    walletType: actorType,
    ownerId,
    direction: 'hold',
    amount,
    currency,
    source: 'topup_order_created',
    status: 'pending',
    paymentMode: mode.modeId,
    clientReference,
    description: `Top-up order created via ${mode.label}`,
    actorRole: actorType,
    actorId: String(req.user.id),
    metadata: { orderId: order.orderId }
  });

  return res.status(201).json({
    message: 'Top-up order created',
    order
  });
}));

router.post('/topup/confirm', walletCriticalLimiter, strictWalletSignature, wrapAsync(async (req, res) => {
  const actorType = resolveActorWalletType(req.user);
  if (!TOPUP_ALLOWED_TYPES.has(actorType)) {
    return res.status(403).json({ message: 'Top-up not allowed for this account' });
  }

  const ownerId = String(req.user.id);
  const orderId = sanitizeText(req.body.orderId, 120);
  const providerReference = sanitizeText(req.body.providerReference, 180);

  if (!orderId) {
    return res.status(400).json({ message: 'orderId is required' });
  }

  if (!providerReference || providerReference.length < 5) {
    return res.status(400).json({ message: 'providerReference is required for secure confirmation' });
  }

  const providerReferenceConflict = await WalletTopupOrder.findOne({
    providerReference,
    status: 'confirmed',
    orderId: { $ne: orderId }
  }).lean();
  if (providerReferenceConflict) {
    return res.status(409).json({ message: 'providerReference already used by another confirmed top-up/donation order' });
  }

  const existingOrder = await WalletTopupOrder.findOne({ orderId, walletType: actorType, ownerId });
  if (!existingOrder) {
    return res.status(404).json({ message: 'Top-up order not found' });
  }

  if (existingOrder.status === 'confirmed') {
    const wallet = await ensureWallet(actorType, ownerId);
    return res.status(200).json({
      message: 'Top-up already confirmed',
      order: existingOrder,
      wallet
    });
  }

  if (existingOrder.status !== 'pending') {
    return res.status(400).json({ message: `Top-up order is ${existingOrder.status}` });
  }

  const order = await claimTopupOrderConfirmationLock({
    orderId,
    walletType: actorType,
    ownerId,
    actorId: String(req.user.id),
    providerReference
  });

  if (!order) {
    const latestOrder = await WalletTopupOrder.findOne({ orderId, walletType: actorType, ownerId }).lean();
    if (!latestOrder) {
      return res.status(404).json({ message: 'Top-up order not found' });
    }
    if (latestOrder.status === 'confirmed') {
      const wallet = await ensureWallet(actorType, ownerId);
      return res.status(200).json({
        message: 'Top-up already confirmed',
        order: latestOrder,
        wallet
      });
    }
    if (latestOrder.status !== 'pending') {
      return res.status(400).json({ message: `Top-up order is ${latestOrder.status}` });
    }
    return res.status(409).json({ message: 'Top-up confirmation is already in progress' });
  }

  if (new Date(order.expiresAt).getTime() <= Date.now()) {
    await WalletTopupOrder.updateOne(
      { _id: order._id, status: 'pending' },
      {
        $set: {
          status: 'expired',
          'metadata.confirmationLock': false,
          'metadata.expiredAt': new Date()
        }
      }
    );
    return res.status(410).json({ message: 'Top-up order expired. Create a new order.' });
  }

  try {
    const customerWallet = await adjustWallet({
      walletType: actorType,
      ownerId,
      amount: order.amount,
      direction: 'credit'
    });

    const adminWallet = await adjustWallet({
      walletType: 'admin',
      ownerId: 'platform',
      amount: order.amount,
      direction: 'credit'
    });

    const finalized = await WalletTopupOrder.updateOne(
      { _id: order._id, status: 'pending' },
      {
        $set: {
          status: 'confirmed',
          providerReference,
          'metadata.confirmationLock': false,
          'metadata.confirmedAt': new Date(),
          'metadata.confirmedBy': String(req.user.id)
        }
      }
    );

    if (!Number(finalized.matchedCount || 0)) {
      const error = new Error('Top-up confirmation state changed. Retry safely.');
      error.statusCode = 409;
      throw error;
    }

    await createWalletTransaction({
      walletType: actorType,
      ownerId,
      direction: 'credit',
      amount: order.amount,
      currency: order.currency,
      source: 'topup_confirmed',
      status: 'settled',
      paymentMode: order.paymentMode,
      clientReference: order.clientReference,
      providerReference,
      description: `Top-up confirmed via ${order.paymentModeLabel}`,
      actorRole: actorType,
      actorId: String(req.user.id),
      metadata: { orderId: order.orderId }
    });

    await createWalletTransaction({
      walletType: 'admin',
      ownerId: 'platform',
      direction: 'credit',
      amount: order.amount,
      currency: order.currency,
      source: 'payment_settlement',
      status: 'settled',
      paymentMode: order.paymentMode,
      providerReference,
      description: `Auto-settlement from ${actorType} wallet top-up (${ownerId})`,
      actorRole: 'system',
      actorId: String(req.user.id),
      metadata: { orderId: order.orderId, sourceWalletType: actorType, sourceOwnerId: ownerId }
    });

    if (order.amount >= 100000) {
      await logSecurityEvent({
        userId: req.user.id,
        action: 'wallet_high_value_topup_confirmed',
        ip: getClientIp(req),
        riskScore: 35,
        result: 'flagged',
        metadata: {
          orderId: order.orderId,
          amount: order.amount,
          paymentMode: order.paymentMode
        }
      });
    }

    const confirmedOrder = await WalletTopupOrder.findById(order._id).lean();

    return res.status(200).json({
      message: 'Top-up confirmed securely',
      order: confirmedOrder || order,
      wallet: customerWallet,
      adminWallet
    });
  } catch (error) {
    await releaseTopupOrderConfirmationLock(order._id, 'confirmation_failed');
    throw error;
  }
}));

router.post('/donations/intent', wrapAsync(async (req, res) => {
  const actorType = resolveActorWalletType(req.user);
  const amount = toAmount(req.body.amount);
  const currency = sanitizeText(req.body.currency || 'INR', 6).toUpperCase() || 'INR';
  const paymentMode = sanitizeText(req.body.paymentMode, 80).toLowerCase();
  const note = sanitizeText(req.body.note || '', 240);
  const clientReference = sanitizeText(req.body.clientReference, 120) || null;

  if (!Number.isFinite(amount) || amount < DONATION_MIN || amount > DONATION_MAX) {
    return res.status(400).json({ message: `Donation amount must be between ${DONATION_MIN} and ${DONATION_MAX}` });
  }

  const mode = await findMode(paymentMode, 'donation');
  if (!mode) {
    return res.status(400).json({ message: 'Selected donation payment mode is not enabled by admin' });
  }

  if (clientReference) {
    const duplicate = await WalletTopupOrder.findOne({
      walletType: 'donation',
      ownerId: 'pool',
      clientReference,
      status: { $in: ['pending', 'confirmed'] }
    }).lean();

    if (duplicate) {
      return res.status(200).json({ reused: true, order: duplicate });
    }
  }

  const donationWallet = await ensureWallet('donation', 'pool', currency);

  const order = await WalletTopupOrder.create({
    orderId: generateId('DON'),
    walletType: 'donation',
    ownerId: 'pool',
    donorUserId: String(req.user.id),
    donorAccountType: actorType,
    donorNote: note || null,
    amount,
    currency,
    paymentMode: mode.modeId,
    paymentModeLabel: mode.label,
    status: 'pending',
    clientReference,
    initiatedBy: String(req.user.id),
    expiresAt: new Date(Date.now() + DONATION_EXPIRY_MS),
    metadata: {
      ip: getClientIp(req),
      userAgent: sanitizeText(req.headers['user-agent'], 240)
    }
  });

  await createWalletTransaction({
    walletType: 'donation',
    ownerId: 'pool',
    direction: 'hold',
    amount,
    currency,
    source: 'donation_intent',
    status: 'pending',
    paymentMode: mode.modeId,
    clientReference,
    description: `Donation intent via ${mode.label}`,
    actorRole: actorType,
    actorId: String(req.user.id),
    metadata: { orderId: order.orderId, donorId: String(req.user.id), donorNote: note || undefined }
  });

  return res.status(201).json({
    message: 'Donation intent created',
    order,
    donationWallet
  });
}));

router.post('/donations/confirm', walletCriticalLimiter, strictWalletSignature, wrapAsync(async (req, res) => {
  const actorType = resolveActorWalletType(req.user);
  const orderId = sanitizeText(req.body.orderId, 120);
  const providerReference = sanitizeText(req.body.providerReference, 180);

  if (!orderId) {
    return res.status(400).json({ message: 'orderId is required' });
  }

  if (!providerReference || providerReference.length < 5) {
    return res.status(400).json({ message: 'providerReference is required for secure confirmation' });
  }

  const providerReferenceConflict = await WalletTopupOrder.findOne({
    providerReference,
    status: 'confirmed',
    orderId: { $ne: orderId }
  }).lean();
  if (providerReferenceConflict) {
    return res.status(409).json({ message: 'providerReference already used by another confirmed top-up/donation order' });
  }

  const existingOrder = await WalletTopupOrder.findOne({ orderId, walletType: 'donation', ownerId: 'pool' });
  if (!existingOrder) {
    return res.status(404).json({ message: 'Donation intent not found' });
  }

  if (existingOrder.donorUserId && actorType !== 'admin' && String(existingOrder.donorUserId) !== String(req.user.id)) {
    return res.status(403).json({ message: 'You cannot confirm this donation' });
  }

  if (existingOrder.status === 'confirmed') {
    const donationWallet = await ensureWallet('donation', 'pool');
    return res.status(200).json({
      message: 'Donation already confirmed',
      order: existingOrder,
      donationWallet
    });
  }

  if (existingOrder.status !== 'pending') {
    return res.status(400).json({ message: `Donation intent is ${existingOrder.status}` });
  }

  const order = await claimTopupOrderConfirmationLock({
    orderId,
    walletType: 'donation',
    ownerId: 'pool',
    actorId: String(req.user.id),
    providerReference
  });

  if (!order) {
    const latestOrder = await WalletTopupOrder.findOne({ orderId, walletType: 'donation', ownerId: 'pool' }).lean();
    if (!latestOrder) {
      return res.status(404).json({ message: 'Donation intent not found' });
    }
    if (latestOrder.status === 'confirmed') {
      const donationWallet = await ensureWallet('donation', 'pool');
      return res.status(200).json({
        message: 'Donation already confirmed',
        order: latestOrder,
        donationWallet
      });
    }
    if (latestOrder.status !== 'pending') {
      return res.status(400).json({ message: `Donation intent is ${latestOrder.status}` });
    }
    return res.status(409).json({ message: 'Donation confirmation is already in progress' });
  }

  if (new Date(order.expiresAt).getTime() <= Date.now()) {
    await WalletTopupOrder.updateOne(
      { _id: order._id, status: 'pending' },
      {
        $set: {
          status: 'expired',
          'metadata.confirmationLock': false,
          'metadata.expiredAt': new Date()
        }
      }
    );
    return res.status(410).json({ message: 'Donation intent expired. Start again.' });
  }

  try {
    const donationWallet = await adjustWallet({
      walletType: 'donation',
      ownerId: 'pool',
      amount: order.amount,
      direction: 'credit'
    });

    const finalized = await WalletTopupOrder.updateOne(
      { _id: order._id, status: 'pending' },
      {
        $set: {
          status: 'confirmed',
          providerReference,
          'metadata.confirmationLock': false,
          'metadata.confirmedAt': new Date(),
          'metadata.confirmedBy': String(req.user.id)
        }
      }
    );

    if (!Number(finalized.matchedCount || 0)) {
      const error = new Error('Donation confirmation state changed. Retry safely.');
      error.statusCode = 409;
      throw error;
    }

    await createWalletTransaction({
      walletType: 'donation',
      ownerId: 'pool',
      direction: 'credit',
      amount: order.amount,
      currency: order.currency,
      source: 'donation_confirmed',
      status: 'settled',
      paymentMode: order.paymentMode,
      clientReference: order.clientReference,
      providerReference,
      description: `Donation confirmed via ${order.paymentModeLabel}`,
      actorRole: actorType,
      actorId: String(req.user.id),
      metadata: {
        orderId: order.orderId,
        donorId: order.donorUserId || String(req.user.id),
        donorAccountType: order.donorAccountType,
        donorNote: order.donorNote
      }
    });

    if (order.amount >= 100000) {
      await logSecurityEvent({
        userId: req.user.id,
        action: 'high_value_donation_confirmed',
        ip: getClientIp(req),
        riskScore: 40,
        result: 'flagged',
        metadata: {
          orderId: order.orderId,
          amount: order.amount,
          paymentMode: order.paymentMode
        }
      });
    }

    const confirmedOrder = await WalletTopupOrder.findById(order._id).lean();

    return res.status(200).json({
      message: 'Donation confirmed securely',
      order: confirmedOrder || order,
      donationWallet
    });
  } catch (error) {
    await releaseTopupOrderConfirmationLock(order._id, 'donation_confirmation_failed');
    throw error;
  }
}));

router.get('/donations/overview', wrapAsync(async (req, res) => {
  const donationWallet = await ensureWallet('donation', 'pool');
  const modes = await getEnabledModesForFlow('donation');

  const recent = await WalletTransaction
    .find({ walletType: 'donation', direction: 'credit' })
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  const totals = await WalletTransaction.aggregate([
    { $match: { walletType: 'donation', direction: 'credit', status: { $ne: 'failed' } } },
    { $group: { _id: '$currency', totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } }
  ]);

  return res.status(200).json({
    balance: donationWallet.balance,
    currency: donationWallet.currency,
    paymentModes: modes,
    recent,
    totals,
    suggestedAmounts: [25, 51, 101, 251, 501, 1100],
    minAmount: DONATION_MIN,
    maxAmount: DONATION_MAX
  });
}));

router.get('/donations/mine', wrapAsync(async (req, res) => {
  const rows = await WalletTransaction
    .find({
      walletType: 'donation',
      direction: 'credit',
      'metadata.donorId': String(req.user.id)
    })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return res.status(200).json({ rows });
}));

router.get('/admin/donations/summary', requireAdmin, wrapAsync(async (req, res) => {
  const donationWallet = await ensureWallet('donation', 'pool');
  const pendingOrders = await WalletTopupOrder.countDocuments({ walletType: 'donation', status: 'pending' });

  const totals = await WalletTransaction.aggregate([
    { $match: { walletType: 'donation', direction: 'credit', status: { $ne: 'failed' } } },
    { $group: { _id: '$currency', totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } }
  ]);

  const lastDonations = await WalletTransaction
    .find({ walletType: 'donation' })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return res.status(200).json({
    donationWallet,
    pendingOrders,
    totals,
    lastDonations
  });
}));
router.post('/commissions/collect', walletCriticalLimiter, strictWalletSignature, wrapAsync(async (req, res) => {
  const actorType = resolveActorWalletType(req.user);
  if (!['customer', 'admin'].includes(actorType)) {
    return res.status(403).json({ message: 'Only customer or admin can settle customer commission payments' });
  }

  const bookingId = sanitizeText(req.body.bookingId, 140);
  const customerId = sanitizeText(req.body.customerId, 120) || String(req.user.id);
  const grossAmount = toAmount(req.body.amount ?? req.body.grossAmount);
  const currency = sanitizeText(req.body.currency || 'INR', 8).toUpperCase() || 'INR';
  const paymentMode = sanitizeText(req.body.paymentMode, 80).toLowerCase();
  const providerReference = sanitizeText(req.body.providerReference, 180);
  const clientReference = sanitizeText(req.body.clientReference, 140);
  const customerRegion = resolveCommissionRegion(req.body.customerRegion, currency);

  if (!bookingId) {
    return res.status(400).json({ message: 'bookingId is required' });
  }

  if (actorType !== 'admin' && customerId !== String(req.user.id)) {
    return res.status(403).json({ message: 'Customer ID mismatch' });
  }

  if (!Number.isFinite(grossAmount) || grossAmount <= 0) {
    return res.status(400).json({ message: 'amount must be greater than 0' });
  }

  const settlement = await collectCustomerPaymentToCommissionWallet({
    bookingId,
    customerId,
    grossAmount,
    currency,
    paymentMode,
    providerReference,
    clientReference,
    customerRegion,
    actorRole: actorType,
    actorId: String(req.user.id),
    ip: getClientIp(req),
    userAgent: sanitizeText(req.headers['user-agent'], 240),
    allowAutoProviderReference: actorType === 'admin' ? Boolean(req.body.allowAutoProviderReference) : false,
    forceSettle: actorType === 'admin' && Boolean(req.body.forceSettle),
    metadata: {
      source: 'manual_commission_collect',
      initiatedBy: String(req.user.id)
    }
  });

  if (Number(settlement?.breakdown?.grossAmount || 0) >= COMMISSION_ALERT_AMOUNT) {
    await logSecurityEvent({
      userId: req.user.id,
      action: 'high_value_customer_payment_commission_settlement',
      ip: getClientIp(req),
      riskScore: 35,
      result: 'flagged',
      metadata: {
        bookingId,
        customerId,
        grossAmount: settlement.breakdown.grossAmount,
        commissionAmount: settlement.breakdown.commissionAmount,
        region: settlement.region,
        paymentMode: settlement.paymentMode
      }
    });
  }

  return res.status(settlement.reused ? 200 : 201).json({
    message: settlement.reused
      ? 'Commission settlement already exists for this booking'
      : 'Customer payment collected into commission wallet',
    settlement
  });
}));

router.get('/commissions/mine', wrapAsync(async (req, res) => {
  const actorType = resolveActorWalletType(req.user);
  const customerId = actorType === 'admin'
    ? sanitizeText(req.query.customerId, 120) || String(req.user.id)
    : String(req.user.id);

  if (actorType !== 'admin' && customerId !== String(req.user.id)) {
    return res.status(403).json({ message: 'Forbidden commission history access' });
  }

  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));

  const rows = await WalletTransaction
    .find({
      walletType: COMMISSION_WALLET_TYPE,
      source: 'customer_payment_collected',
      direction: 'credit',
      'metadata.customerId': customerId
    })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return res.status(200).json({ customerId, rows });
}));

router.get('/admin/commissions/config', requireAdmin, wrapAsync(async (req, res) => {
  const config = await ensureCommissionConfig();
  return res.status(200).json({ config });
}));

router.put('/admin/commissions/config', requireAdmin, wrapAsync(async (req, res) => {
  const config = await updateCommissionConfig(req.body || {});

  await ensureCommissionWalletForRegion('india', 'INR', config);
  await ensureCommissionWalletForRegion('international', 'USD', config);

  return res.status(200).json({
    message: 'Commission wallet config updated',
    config
  });
}));

router.get('/admin/commissions/summary', requireAdmin, wrapAsync(async (req, res) => {
  const summary = await buildCommissionAdminSummary(Number(req.query.limit || 100));
  return res.status(200).json(summary);
}));
router.post('/driver-commissions/settle', walletCriticalLimiter, strictWalletSignature, wrapAsync(async (req, res) => {
  const actorType = resolveActorWalletType(req.user);
  if (actorType !== 'admin') {
    return res.status(403).json({ message: 'Admin approval required for driver commission settlement' });
  }

  const bookingId = sanitizeText(req.body.bookingId, 140);
  const requestedDriverId = sanitizeText(req.body.driverId, 120);
  const driverId = requestedDriverId;
  const customerId = sanitizeText(req.body.customerId, 120);
  const grossAmount = toAmount(req.body.amount ?? req.body.grossAmount);
  const currency = sanitizeText(req.body.currency || 'INR', 8).toUpperCase() || 'INR';
  const paymentMode = sanitizeText(req.body.paymentMode, 80).toLowerCase();
  const providerReference = sanitizeText(req.body.providerReference, 180);
  const clientReference = sanitizeText(req.body.clientReference, 140);
  const customerRegion = resolveDriverCommissionRegion(req.body.customerRegion || req.headers['x-customer-region'], currency);

  if (!bookingId || !customerId) {
    return res.status(400).json({ message: 'bookingId and customerId are required' });
  }

  if (actorType === 'admin' && !driverId) {
    return res.status(400).json({ message: 'driverId is required for admin settlement' });
  }

  if (!Number.isFinite(grossAmount) || grossAmount <= 0) {
    return res.status(400).json({ message: 'amount must be greater than 0' });
  }

  const settlement = await processDriverRideSettlement({
    bookingId,
    driverId,
    customerId,
    grossAmount,
    currency,
    paymentMode,
    providerReference,
    clientReference,
    customerRegion,
    actorRole: actorType,
    actorId: String(req.user.id),
    ip: getClientIp(req),
    userAgent: sanitizeText(req.headers['user-agent'], 240),
    forceSettle: actorType === 'admin' && Boolean(req.body.forceSettle),
    allowAutoProviderReference: actorType === 'admin' ? Boolean(req.body.allowAutoProviderReference) : true,
    metadata: {
      source: 'manual_driver_commission_settlement',
      initiatedBy: String(req.user.id)
    }
  });

  if (Number(settlement?.breakdown?.grossAmount || 0) >= COMMISSION_ALERT_AMOUNT) {
    await logSecurityEvent({
      userId: req.user.id,
      action: 'high_value_driver_commission_settlement',
      ip: getClientIp(req),
      riskScore: 35,
      result: 'flagged',
      metadata: {
        bookingId,
        driverId,
        customerId,
        grossAmount: settlement.breakdown.grossAmount,
        adminCommissionAmount: settlement.breakdown.adminCommissionAmount,
        customerCommissionAmount: settlement.breakdown.customerCommissionAmount,
        driverNetAmount: settlement.breakdown.driverNetAmount,
        region: settlement.region,
        paymentMode: settlement.paymentMode
      }
    });
  }

  return res.status(settlement.reused ? 200 : 201).json({
    message: settlement.reused
      ? 'Driver commission settlement already exists for this booking'
      : 'Driver commission settlement completed',
    settlement
  });
}));

router.post('/driver-commissions/refund', walletCriticalLimiter, strictWalletSignature, wrapAsync(async (req, res) => {
  const actorType = resolveActorWalletType(req.user);
  if (actorType !== 'admin') {
    return res.status(403).json({ message: 'Admin approval required for driver refund' });
  }

  const bookingId = sanitizeText(req.body.bookingId, 140);
  const requestedDriverId = sanitizeText(req.body.driverId, 120);
  const driverId = requestedDriverId;
  const refundAmount = toAmount(req.body.refundAmount ?? req.body.refundGrossAmount);
  const currency = sanitizeText(req.body.currency || 'INR', 8).toUpperCase() || 'INR';
  const paymentMode = sanitizeText(req.body.paymentMode, 80).toLowerCase();
  const providerReference = sanitizeText(req.body.providerReference, 180);
  const clientReference = sanitizeText(req.body.clientReference, 140);
  const refundReason = sanitizeText(req.body.refundReason || req.body.reason, 200);

  if (!bookingId) {
    return res.status(400).json({ message: 'bookingId is required' });
  }

  if (actorType === 'admin' && !driverId) {
    return res.status(400).json({ message: 'driverId is required for admin refund' });
  }

  const refund = await processDriverRideRefund({
    bookingId,
    driverId,
    refundAmount,
    currency,
    paymentMode,
    providerReference,
    clientReference,
    refundReason,
    actorRole: actorType,
    actorId: String(req.user.id),
    ip: getClientIp(req),
    userAgent: sanitizeText(req.headers['user-agent'], 240),
    metadata: {
      source: 'manual_driver_commission_refund',
      initiatedBy: String(req.user.id)
    }
  });

  if (Number(refund?.breakdown?.refundGrossAmount || 0) >= COMMISSION_ALERT_AMOUNT) {
    await logSecurityEvent({
      userId: req.user.id,
      action: 'high_value_driver_commission_refund',
      ip: getClientIp(req),
      riskScore: 30,
      result: 'flagged',
      metadata: {
        bookingId,
        driverId,
        refundGrossAmount: refund.breakdown.refundGrossAmount,
        refundDriverNetAmount: refund.breakdown.refundDriverNetAmount,
        refundAdminCommissionAmount: refund.breakdown.refundAdminCommissionAmount,
        refundCustomerCommissionAmount: refund.breakdown.refundCustomerCommissionAmount,
        paymentMode: refund.paymentMode
      }
    });
  }

  return res.status(200).json({
    message: 'Driver commission refund processed',
    refund
  });
}));

router.get('/driver-commissions/mine', wrapAsync(async (req, res) => {
  const actorType = resolveActorWalletType(req.user);
  const driverId = actorType === 'admin'
    ? sanitizeText(req.query.driverId, 120)
    : String(req.user.id);

  if (!driverId) {
    return res.status(400).json({ message: 'driverId is required for admin lookup' });
  }

  if (actorType === 'driver' && driverId !== String(req.user.id)) {
    return res.status(403).json({ message: 'Forbidden driver commission history access' });
  }

  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
  const rows = await getDriverCommissionHistory(driverId, limit);
  const wallet = await ensureDriverCommissionWallet(
    driverId,
    sanitizeText(req.query.currency || 'INR', 8).toUpperCase() || 'INR',
    resolveDriverCommissionRegion(req.query.region, req.query.currency || 'INR')
  );

  return res.status(200).json({ driverId, wallet, rows });
}));

router.get('/admin/driver-commissions/config', requireAdmin, wrapAsync(async (req, res) => {
  const config = await ensureDriverCommissionConfig();
  return res.status(200).json({ config });
}));

router.put('/admin/driver-commissions/config', requireAdmin, wrapAsync(async (req, res) => {
  const config = await updateDriverCommissionConfig(req.body || {});
  return res.status(200).json({
    message: 'Driver commission wallet config updated',
    config
  });
}));

router.get('/admin/driver-commissions/summary', requireAdmin, wrapAsync(async (req, res) => {
  const summary = await buildDriverCommissionAdminSummary(Number(req.query.limit || 100));
  return res.status(200).json(summary);
}));
router.post('/withdrawals', walletCriticalLimiter, strictWalletSignature, wrapAsync(async (req, res) => {
  const actorType = resolveActorWalletType(req.user);
  if (!['customer', 'driver'].includes(actorType)) {
    return res.status(403).json({ message: 'Withdrawal not allowed for this account' });
  }

  const requestedWalletType = ensureWalletType(
    req.body.walletType || (actorType === 'driver' ? DRIVER_COMMISSION_WALLET_TYPE : actorType)
  );

  if (actorType === 'customer' && requestedWalletType !== 'customer') {
    return res.status(403).json({ message: 'Customer withdrawals are limited to customer wallet only' });
  }

  if (actorType === 'driver' && !['driver', DRIVER_COMMISSION_WALLET_TYPE].includes(requestedWalletType)) {
    return res.status(403).json({ message: 'Driver withdrawals are limited to driver wallets only' });
  }

  const ownerId = normalizeOwnerId(requestedWalletType, req.body.ownerId || req.user.id);
  assertCanAccessWallet(req, requestedWalletType, ownerId);

  const amount = toAmount(req.body.amount);
  const method = sanitizeText(req.body.method, 80).toLowerCase();
  const destination = sanitizeText(req.body.destination, 180);
  const notes = sanitizeText(req.body.notes, 240);

  if (!Number.isFinite(amount) || amount < WITHDRAW_MIN || amount > WITHDRAW_MAX) {
    return res.status(400).json({ message: `Withdrawal amount must be between ${WITHDRAW_MIN} and ${WITHDRAW_MAX}` });
  }

  if (!destination || destination.length < 4) {
    return res.status(400).json({ message: 'Valid withdrawal destination is required' });
  }

  const mode = await findMode(method, 'withdrawal');
  if (!mode) {
    return res.status(400).json({ message: 'Selected withdrawal method is not enabled by admin' });
  }

  const wallet = await ensureWallet(requestedWalletType, ownerId);
  if (Number(wallet.balance || 0) < amount) {
    return res.status(400).json({ message: 'Insufficient wallet balance' });
  }

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const dailyAggregate = await WalletWithdrawalRequest.aggregate([
    {
      $match: {
        walletType: requestedWalletType,
        ownerId,
        createdAt: { $gte: dayStart }
      }
    },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: '$amount' }
      }
    }
  ]);

  const dailyTotal = Number(dailyAggregate[0]?.totalAmount || 0);
  if (dailyTotal + amount > WITHDRAW_DAILY_LIMIT) {
    return res.status(400).json({ message: `Daily withdrawal limit exceeded (${WITHDRAW_DAILY_LIMIT})` });
  }

  const request = await WalletWithdrawalRequest.create({
    requestId: generateId('WDR'),
    walletType: requestedWalletType,
    ownerId,
    amount,
    currency: wallet.currency || 'INR',
    method: mode.modeId,
    methodLabel: mode.label,
    destination,
    notes,
    status: 'pending_admin_approval',
    metadata: {
      ip: getClientIp(req),
      userAgent: sanitizeText(req.headers['user-agent'], 240)
    }
  });

  await createWalletTransaction({
    walletType: requestedWalletType,
    ownerId,
    direction: 'hold',
    amount,
    currency: wallet.currency || 'INR',
    source: 'withdrawal_requested',
    status: 'pending',
    paymentMode: mode.modeId,
    relatedRequestId: request.requestId,
    description: `Withdrawal requested via ${mode.label}`,
    actorRole: actorType,
    actorId: String(req.user.id),
    metadata: {
      destination,
      requestedWalletType
    }
  });

  return res.status(201).json({
    message: 'Withdrawal request created. Admin approval required.',
    request
  });
}));
router.get('/admin/overview', requireAdmin, wrapAsync(async (req, res) => {
  await ensurePaymentModesSeeded();

  const wallets = await WalletAccount.find({}).sort({ walletType: 1, ownerId: 1 }).limit(2000).lean();
  const modes = await WalletPaymentMode.find({}).sort({ displayOrder: 1, label: 1 }).lean();
  const pendingRequests = await WalletWithdrawalRequest.countDocuments({ status: 'pending_admin_approval' });
  const commissionConfig = await ensureCommissionConfig();
  const commissionWallets = {
    india: await ensureCommissionWalletForRegion('india', 'INR', commissionConfig),
    international: await ensureCommissionWalletForRegion('international', 'USD', commissionConfig)
  };
  const driverCommissionConfig = await ensureDriverCommissionConfig();
  const driverCommissionWalletCount = await WalletAccount.countDocuments({ walletType: DRIVER_COMMISSION_WALLET_TYPE });

  const totals = wallets.reduce((acc, wallet) => {
    const key = wallet.walletType;
    const value = Number(wallet.balance || 0);
    acc[key] = Number((Number(acc[key] || 0) + value).toFixed(2));
    return acc;
  }, {});

  return res.status(200).json({
    totals,
    pendingRequests,
    wallets,
    commissionWallets,
    commissionConfig,
    driverCommissionConfig,
    driverCommissionWalletCount,
    paymentModes: modes
  });
}));

router.get('/admin/withdrawals', requireAdmin, wrapAsync(async (req, res) => {
  const status = sanitizeText(req.query.status, 60).toLowerCase();
  const query = {};
  if (status) {
    query.status = status;
  }

  const rows = await WalletWithdrawalRequest
    .find(query)
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();

  return res.status(200).json({ rows });
}));

router.post('/admin/withdrawals/:requestId/review', requireAdmin, walletCriticalLimiter, strictWalletSignature, wrapAsync(async (req, res) => {
  const requestId = sanitizeText(req.params.requestId, 140);
  const decision = sanitizeText(req.body.decision, 40).toLowerCase();
  const remarks = sanitizeText(req.body.remarks, 240);

  if (!['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({ message: 'decision must be approved or rejected' });
  }

  const existingRequest = await WalletWithdrawalRequest.findOne({ requestId });
  if (!existingRequest) {
    return res.status(404).json({ message: 'Withdrawal request not found' });
  }

  if (existingRequest.status !== 'pending_admin_approval') {
    return res.status(400).json({ message: `Request already ${existingRequest.status}` });
  }

  const request = await claimWithdrawalReviewLock({
    requestId,
    actorId: String(req.user.id),
    decision
  });

  if (!request) {
    const latestRequest = await WalletWithdrawalRequest.findOne({ requestId }).lean();
    if (!latestRequest) {
      return res.status(404).json({ message: 'Withdrawal request not found' });
    }
    if (latestRequest.status !== 'pending_admin_approval') {
      return res.status(400).json({ message: `Request already ${latestRequest.status}` });
    }
    return res.status(409).json({ message: 'Withdrawal review is already in progress' });
  }

  try {
    const sourceWallet = await ensureWallet(request.walletType, request.ownerId);
    const adminWallet = await ensureWallet('admin', 'platform');

    if (decision === 'approved') {
      if (Number(sourceWallet.balance || 0) < Number(request.amount || 0)) {
        const error = new Error('Source wallet has insufficient balance');
        error.statusCode = 400;
        throw error;
      }

      if (Number(adminWallet.balance || 0) < Number(request.amount || 0)) {
        const error = new Error('Admin settlement wallet has insufficient payout balance');
        error.statusCode = 400;
        throw error;
      }

      await adjustWallet({
        walletType: request.walletType,
        ownerId: request.ownerId,
        amount: request.amount,
        direction: 'debit'
      });

      await adjustWallet({
        walletType: 'admin',
        ownerId: 'platform',
        amount: request.amount,
        direction: 'debit'
      });

      await createWalletTransaction({
        walletType: request.walletType,
        ownerId: request.ownerId,
        direction: 'debit',
        amount: request.amount,
        currency: request.currency,
        source: 'withdrawal_approved',
        status: 'settled',
        paymentMode: request.method,
        relatedRequestId: request.requestId,
        description: `Withdrawal approved by admin (${request.methodLabel})`,
        actorRole: 'admin',
        actorId: String(req.user.id),
        metadata: { remarks }
      });

      await createWalletTransaction({
        walletType: 'admin',
        ownerId: 'platform',
        direction: 'debit',
        amount: request.amount,
        currency: request.currency,
        source: 'payout_processed',
        status: 'settled',
        paymentMode: request.method,
        relatedRequestId: request.requestId,
        description: `Payout processed for ${request.walletType}:${request.ownerId}`,
        actorRole: 'admin',
        actorId: String(req.user.id),
        metadata: { remarks }
      });
    } else {
      await createWalletTransaction({
        walletType: request.walletType,
        ownerId: request.ownerId,
        direction: 'release',
        amount: request.amount,
        currency: request.currency,
        source: 'withdrawal_rejected',
        status: 'cancelled',
        paymentMode: request.method,
        relatedRequestId: request.requestId,
        description: 'Withdrawal rejected by admin',
        actorRole: 'admin',
        actorId: String(req.user.id),
        metadata: { remarks }
      });
    }

    const reviewedAt = new Date();
    const finalized = await WalletWithdrawalRequest.updateOne(
      { _id: request._id, status: 'pending_admin_approval' },
      {
        $set: {
          status: decision,
          reviewedAt,
          reviewedBy: String(req.user.id),
          remarks,
          'metadata.reviewLock': false,
          'metadata.reviewedAt': reviewedAt
        }
      }
    );

    if (!Number(finalized.matchedCount || 0)) {
      const error = new Error('Withdrawal review state changed. Retry safely.');
      error.statusCode = 409;
      throw error;
    }

    const finalRequest = await WalletWithdrawalRequest.findById(request._id).lean();

    return res.status(200).json({
      message: `Withdrawal request ${decision}`,
      request: finalRequest || request
    });
  } catch (error) {
    await releaseWithdrawalReviewLock(request._id, 'review_failed');
    throw error;
  }
}));

router.put('/admin/payment-modes', requireAdmin, wrapAsync(async (req, res) => {
  const rows = Array.isArray(req.body.modes) ? req.body.modes : [];
  if (!rows.length) {
    return res.status(400).json({ message: 'modes array is required' });
  }

  await ensurePaymentModesSeeded();

  const updates = [];
  for (const row of rows) {
    const modeId = sanitizeText(row.modeId, 80).toLowerCase();
    if (!modeId) continue;

    const updateDoc = {
      label: sanitizeText(row.label, 120) || modeId,
      region: ['india', 'international', 'global'].includes(String(row.region || '').toLowerCase())
        ? String(row.region || '').toLowerCase()
        : 'india',
      enabled: Boolean(row.enabled),
      flows: Array.isArray(row.flows)
        ? row.flows.map((flow) => sanitizeText(flow, 40).toLowerCase()).filter(Boolean)
        : ['add_money', 'ride_payment', 'commission'],
      displayOrder: Number(row.displayOrder || 0)
    };

    const updated = await WalletPaymentMode.findOneAndUpdate(
      { modeId },
      { $set: updateDoc },
      { new: true, upsert: true }
    );

    updates.push(updated);
  }

  return res.status(200).json({
    message: 'Payment modes updated',
    paymentModes: updates.sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0))
  });
}));

router.post('/admin/wallet-adjust', requireAdmin, walletCriticalLimiter, strictWalletSignature, wrapAsync(async (req, res) => {
  const walletType = ensureWalletType(req.body.walletType);
  const fallbackOwnerId = walletType === 'admin'
    ? 'platform'
    : walletType === COMMISSION_WALLET_TYPE
      ? 'india_pool'
      : '';
  const ownerId = normalizeOwnerId(walletType, req.body.ownerId || fallbackOwnerId);
  const action = sanitizeText(req.body.action, 20).toLowerCase();
  const amount = toAmount(req.body.amount);
  const description = sanitizeText(req.body.description, 200) || `Admin ${action} adjustment`;

  if (!['credit', 'debit'].includes(action)) {
    return res.status(400).json({ message: 'action must be credit or debit' });
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ message: 'Valid amount is required' });
  }

  const wallet = await adjustWallet({
    walletType,
    ownerId,
    amount,
    direction: action
  });

  await createWalletTransaction({
    walletType,
    ownerId,
    direction: action,
    amount,
    currency: wallet.currency || 'INR',
    source: 'admin_adjustment',
    status: 'settled',
    paymentMode: sanitizeText(req.body.paymentMode, 80).toLowerCase() || null,
    description,
    actorRole: 'admin',
    actorId: String(req.user.id),
    metadata: {
      ip: getClientIp(req)
    }
  });

  return res.status(200).json({
    message: `Wallet ${action} successful`,
    wallet
  });
}));

router.get('/payment-modes', wrapAsync(async (req, res) => {
  const flow = sanitizeText(req.query.flow, 40).toLowerCase();
  const query = { enabled: true };

  if (flow) {
    query.flows = flow;
  }

  await ensurePaymentModesSeeded();
  const rows = await WalletPaymentMode.find(query).sort({ displayOrder: 1, label: 1 }).lean();
  return res.status(200).json({ rows });
}));

// === FUTURE_ROUTES_BUSINESS_WALLETROUTES_START ===
{
// Source: backend/src/routes/futureBusinessRoutes.js

  const fs = require('fs');
  const path = require('path');
  const crypto = require('crypto');
  const { execFile } = require('child_process');


  const DATA_DIR = path.join(__dirname, '../../../data/runtime');
  const DATA_FILE = path.join(DATA_DIR, 'future-business-store.json');
  const DATA_FILE_BACKUP = path.join(DATA_DIR, 'future-business-store.backup.json');
  const DATA_FILE_TEMP = path.join(DATA_DIR, 'future-business-store.tmp.json');
  const DATA_EVENTS_FILE = path.join(DATA_DIR, 'future-business-store.events.ndjson');
  const DATA_SNAPSHOTS_FILE = path.join(DATA_DIR, 'future-business-store.snapshots.ndjson');
  const RUNTIME_REPO_ROOT = path.resolve(__dirname, '../../..');
  const REL_DATA_FILE = path.relative(RUNTIME_REPO_ROOT, DATA_FILE).replace(/\\/g, '/');
  const REL_DATA_FILE_BACKUP = path.relative(RUNTIME_REPO_ROOT, DATA_FILE_BACKUP).replace(/\\/g, '/');
  const REL_DATA_EVENTS_FILE = path.relative(RUNTIME_REPO_ROOT, DATA_EVENTS_FILE).replace(/\\/g, '/');
  const REL_DATA_SNAPSHOTS_FILE = path.relative(RUNTIME_REPO_ROOT, DATA_SNAPSHOTS_FILE).replace(/\\/g, '/');
  const RUNTIME_GIT_SYNC_ENABLED = String(process.env.RUNTIME_GIT_SYNC_ENABLED || 'true').trim().toLowerCase() === 'true';
  const RUNTIME_GIT_SYNC_REMOTE = String(process.env.RUNTIME_GIT_SYNC_REMOTE || 'origin').trim() || 'origin';
  const RUNTIME_GIT_SYNC_TARGET = String(process.env.RUNTIME_GIT_SYNC_TARGET || 'HEAD').trim() || 'HEAD';
  const RUNTIME_GIT_SYNC_DEBOUNCE_MS = Math.max(1000, Number(process.env.RUNTIME_GIT_SYNC_DEBOUNCE_MS || 5000));
  const RUNTIME_EVENTS_ENABLED = String(process.env.RUNTIME_EVENTS_ENABLED || 'true').trim().toLowerCase() === 'true';
  const RUNTIME_EVENT_HASH_SECRET = String(process.env.RUNTIME_EVENT_HASH_SECRET || process.env.API_SIGNATURE_SECRET || process.env.JWT_SECRET || 'runtime_event_hash_secret');
  const RUNTIME_SNAPSHOTS_ENABLED = String(process.env.RUNTIME_SNAPSHOTS_ENABLED || 'true').trim().toLowerCase() === 'true';
  const RUNTIME_SNAPSHOT_HASH_SECRET = String(process.env.RUNTIME_SNAPSHOT_HASH_SECRET || process.env.API_SIGNATURE_SECRET || process.env.JWT_SECRET || 'runtime_snapshot_hash_secret');
  const RUNTIME_AUDIT_MAX_LIMIT = Math.max(50, Number(process.env.RUNTIME_AUDIT_MAX_LIMIT || 2000));
  const RAJASTHAN_DETAILS_FILE = path.join(__dirname, '../../../data/format-2-json/states/rajasthan-50-complete.json');

  const MAX_NOTIFICATIONS = 20000;
  const MAX_WALLET_HISTORY = 3000;
  const MAX_RIDES_PER_USER = 5000;
  const MAX_COMMISSIONS = 10000;
  const MAX_TOURISM_PLACES = 10000;
  const MAX_LISTINGS = 20000;
  const MAX_PACKAGES = 8000;
  const MAX_PACKAGE_BOOKINGS = 30000;
  const MAX_REFERRALS = 40000;
  const MAX_REVIEWS = 30000;
  const MAX_TERMS_CONSENTS = 30000;
  const MAX_SUPPORT_TICKETS = 30000;
  const MAX_WEBHOOK_EVENTS = 20000;
  const MAX_OTP_EVENTS = 50000;
  const MAX_AUTH_LOGS = 50000;
  const MAX_BOOKING_ACTIONS = 50000;
  const MAX_DISPUTES = 20000;
  const MAX_FRAUD_ALERTS = 20000;
  const MAX_AI_CHATS = 60000;
  const MAX_SAVED_LOCATIONS = 30000;
  const MAX_FEATURE_STATES = 15000;
  const MAX_FEATURE_ACTIONS = 120000;
  const MAX_AUTO_DEDUCTIONS = 100000;
  const MAX_RUNTIME_WALLET_AMOUNT = 5000000;
  const AUTO_DEDUCT_HASH_SECRET = String(process.env.AUTO_DEDUCT_HASH_SECRET || process.env.API_SIGNATURE_SECRET || process.env.JWT_SECRET || 'runtime_auto_deduct_secret');
  const AUTO_DEDUCT_HASH_GENESIS = 'GENESIS';

  let persistTimer = null;
  let gitSyncTimer = null;
  let gitSyncInFlight = false;
  let rajasthanDetailsCache = null;

  const seedTourismPlaces = [
    { district: 'Jaipur', name: 'Amer Fort', category: 'Fort', history: '16th century hill fort.', entryFee: '100', openTime: '08:00', closeTime: '17:30', parking: true },
    { district: 'Jaipur', name: 'Hawa Mahal', category: 'Palace', history: 'Pink sandstone palace facade.', entryFee: '50', openTime: '09:00', closeTime: '17:00', parking: true },
    { district: 'Jodhpur', name: 'Mehrangarh Fort', category: 'Fort', history: 'Rao Jodha era fort.', entryFee: '200', openTime: '09:00', closeTime: '17:30', parking: true },
    { district: 'Udaipur', name: 'City Palace', category: 'Palace', history: 'Mewar dynasty royal complex.', entryFee: '300', openTime: '09:30', closeTime: '17:30', parking: true },
    { district: 'Ajmer', name: 'Ajmer Sharif Dargah', category: 'Heritage', history: 'Sufi shrine and spiritual site.', entryFee: '0', openTime: '05:00', closeTime: '22:00', parking: true },
    { district: 'Pushkar', name: 'Brahma Temple', category: 'Temple', history: 'Rare temple dedicated to Lord Brahma.', entryFee: '0', openTime: '06:00', closeTime: '20:00', parking: true }
  ];

  const RAJASTHAN_DISTRICTS = [
    'Ajmer',
    'Alwar',
    'Anupgarh',
    'Balotra',
    'Banswara',
    'Baran',
    'Barmer',
    'Beawar',
    'Bharatpur',
    'Bhilwara',
    'Bikaner',
    'Bundi',
    'Chittorgarh',
    'Churu',
    'Dausa',
    'Deeg',
    'Didwana-Kuchaman',
    'Dholpur',
    'Dungarpur',
    'Gangapur City',
    'Hanumangarh',
    'Jaipur',
    'Jaipur Rural',
    'Jaisalmer',
    'Jalore',
    'Jhalawar',
    'Jhunjhunu',
    'Jodhpur',
    'Jodhpur Rural',
    'Karauli',
    'Kekri',
    'Khairthal-Tijara',
    'Kota',
    'Kotputli-Behror',
    'Nagaur',
    'Neem Ka Thana',
    'Pali',
    'Phalodi',
    'Pratapgarh',
    'Rajsamand',
    'Salumbar',
    'Sanchore',
    'Sawai Madhopur',
    'Shahpura',
    'Sikar',
    'Sirohi',
    'Sri Ganganagar',
    'Tonk',
    'Udaipur',
    'Dudu'
  ];

  const currencyRates = {
    INR: 1,
    USD: 0.012,
    EUR: 0.011,
    GBP: 0.0094,
    AED: 0.044
  };

  const vehicleBaseRates = {
    economy: 10,
    sedan: 15,
    suv: 20,
    premium: 25,
    xl: 28
  };

  function ensureDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  function runGitCommand(args, callback) {
    execFile('git', args, { cwd: RUNTIME_REPO_ROOT, windowsHide: true }, callback);
  }

  function runRuntimeGitSync() {
    if (!RUNTIME_GIT_SYNC_ENABLED || gitSyncInFlight) return;
    gitSyncInFlight = true;

    const addTargets = [REL_DATA_FILE, REL_DATA_FILE_BACKUP];
    if (fs.existsSync(DATA_EVENTS_FILE)) {
      addTargets.push(REL_DATA_EVENTS_FILE);
    }
    if (fs.existsSync(DATA_SNAPSHOTS_FILE)) {
      addTargets.push(REL_DATA_SNAPSHOTS_FILE);
    }

    runGitCommand(['add', ...addTargets], (addError) => {
      if (addError) {
        gitSyncInFlight = false;
        return;
      }

      runGitCommand(['diff', '--cached', '--quiet'], (diffError) => {
        if (!diffError) {
          gitSyncInFlight = false;
          return;
        }

        if (Number(diffError.code) !== 1) {
          gitSyncInFlight = false;
          return;
        }

        const commitMessage = `runtime-data-sync ${new Date().toISOString()}`;
        runGitCommand(['commit', '-m', commitMessage], (commitError) => {
          if (commitError) {
            gitSyncInFlight = false;
            return;
          }

          runGitCommand(['push', RUNTIME_GIT_SYNC_REMOTE, RUNTIME_GIT_SYNC_TARGET], () => {
            gitSyncInFlight = false;
          });
        });
      });
    });
  }

  function queueRuntimeGitSync() {
    if (!RUNTIME_GIT_SYNC_ENABLED || gitSyncTimer) return;
    gitSyncTimer = setTimeout(() => {
      gitSyncTimer = null;
      runRuntimeGitSync();
    }, RUNTIME_GIT_SYNC_DEBOUNCE_MS);
  }

  function normalizeString(value, maxLength) {
    const str = String(value || '').trim();
    if (!str) return '';
    if (!Number.isFinite(maxLength) || maxLength <= 0) return str;
    return str.slice(0, maxLength);
  }

  function normalizeAmount(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Number(n.toFixed(2));
  }

  function safeObject(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    return input;
  }

  function clone(input) {
    return JSON.parse(JSON.stringify(input));
  }

  function defaultStore() {
    return {
      wallets: {},
      notifications: [],
      travelCards: {},
      commissions: [],
      listings: [],
      packages: [],
      packageBookings: [],
      referrals: [],
      reviews: [],
      otpEvents: [],
      authLogs: [],
      bookingActions: [],
      disputes: [],
      fraudAlerts: [],
      aiChats: [],
      savedLocations: [],
      featureStates: {},
      featureActions: [],
      termsConsents: [],
      supportTickets: [],
      webhookEvents: [],
      autoDeductions: [],
      runtimeEventDigest: {
        lastHash: AUTO_DEDUCT_HASH_GENESIS,
        totalEvents: 0,
        lastEventAt: null
      },
      runtimeSnapshotDigest: {
        lastHash: AUTO_DEDUCT_HASH_GENESIS,
        totalSnapshots: 0,
        lastSnapshotAt: null
      },
      tourismPlaces: seedTourismPlaces.map((item) => ({
        id: crypto.randomUUID(),
        district: item.district,
        name: item.name,
        category: item.category,
        history: item.history,
        entryFee: item.entryFee,
        openTime: item.openTime,
        closeTime: item.closeTime,
        parking: item.parking,
        createdAt: new Date().toISOString()
      })),
      rideHistory: {},
      preferences: {},
      counters: {
        packagesBooked: 0,
        referralsTracked: 0,
        supportTickets: 0,
        webhookEvents: 0
      }
    };
  }

  function parseStoreFromFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) return null;
      const raw = fs.readFileSync(filePath, 'utf8');
      if (!raw || !raw.trim()) return null;
      return JSON.parse(raw);
    } catch (_error) {
      return null;
    }
  }

  function hydrateStore(parsed) {
    const source = safeObject(parsed);
    const store = defaultStore();
    return {
      ...store,
      ...source,
      wallets: safeObject(source.wallets),
      notifications: Array.isArray(source.notifications) ? source.notifications : [],
      travelCards: safeObject(source.travelCards),
      commissions: Array.isArray(source.commissions) ? source.commissions : [],
      listings: Array.isArray(source.listings) ? source.listings : [],
      packages: Array.isArray(source.packages) ? source.packages : [],
      packageBookings: Array.isArray(source.packageBookings) ? source.packageBookings : [],
      referrals: Array.isArray(source.referrals) ? source.referrals : [],
      reviews: Array.isArray(source.reviews) ? source.reviews : [],
      otpEvents: Array.isArray(source.otpEvents) ? source.otpEvents : [],
      authLogs: Array.isArray(source.authLogs) ? source.authLogs : [],
      bookingActions: Array.isArray(source.bookingActions) ? source.bookingActions : [],
      disputes: Array.isArray(source.disputes) ? source.disputes : [],
      fraudAlerts: Array.isArray(source.fraudAlerts) ? source.fraudAlerts : [],
      aiChats: Array.isArray(source.aiChats) ? source.aiChats : [],
      savedLocations: Array.isArray(source.savedLocations) ? source.savedLocations : [],
      featureStates: safeObject(source.featureStates),
      featureActions: Array.isArray(source.featureActions) ? source.featureActions : [],
      termsConsents: Array.isArray(source.termsConsents) ? source.termsConsents : [],
      supportTickets: Array.isArray(source.supportTickets) ? source.supportTickets : [],
      webhookEvents: Array.isArray(source.webhookEvents) ? source.webhookEvents : [],
      autoDeductions: Array.isArray(source.autoDeductions) ? source.autoDeductions : [],
      runtimeEventDigest: {
        ...safeObject(store.runtimeEventDigest),
        ...safeObject(source.runtimeEventDigest)
      },
      runtimeSnapshotDigest: {
        ...safeObject(store.runtimeSnapshotDigest),
        ...safeObject(source.runtimeSnapshotDigest)
      },
      tourismPlaces: Array.isArray(source.tourismPlaces) && source.tourismPlaces.length
        ? source.tourismPlaces
        : store.tourismPlaces,
      rideHistory: safeObject(source.rideHistory),
      preferences: safeObject(source.preferences),
      counters: {
        ...safeObject(store.counters),
        ...safeObject(source.counters)
      }
    };
  }

  function loadStore() {
    const primary = parseStoreFromFile(DATA_FILE);
    if (primary) return hydrateStore(primary);

    const backup = parseStoreFromFile(DATA_FILE_BACKUP);
    if (backup) return hydrateStore(backup);

    return defaultStore();
  }

  function loadRajasthanDetails() {
    if (rajasthanDetailsCache && typeof rajasthanDetailsCache === 'object') {
      return rajasthanDetailsCache;
    }
    try {
      const raw = fs.readFileSync(RAJASTHAN_DETAILS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      const districts = safeObject(parsed && parsed.districts);
      const index = {};
      Object.keys(districts).forEach((name) => {
        index[normalizeString(name, 120).toLowerCase()] = districts[name];
      });
      rajasthanDetailsCache = {
        ok: true,
        sourceFile: RAJASTHAN_DETAILS_FILE,
        metadata: safeObject(parsed && parsed.metadata),
        districts,
        index
      };
      return rajasthanDetailsCache;
    } catch (_error) {
      rajasthanDetailsCache = {
        ok: false,
        sourceFile: RAJASTHAN_DETAILS_FILE,
        metadata: {},
        districts: {},
        index: {}
      };
      return rajasthanDetailsCache;
    }
  }

  function resolveDistrictDetailByName(name) {
    const dataset = loadRajasthanDetails();
    const key = normalizeString(name, 120).toLowerCase();
    if (!key) return null;
    if (dataset.index[key]) return dataset.index[key];

    const simplified = key.replace(/[^a-z0-9]/g, '');
    const keys = Object.keys(dataset.index);
    for (let i = 0; i < keys.length; i += 1) {
      const source = keys[i];
      const sourceSimple = source.replace(/[^a-z0-9]/g, '');
      if (sourceSimple === simplified) return dataset.index[source];
    }
    return null;
  }

  function getStore() {
    if (!global.__GOINDIARIDE_FUTURE_BUSINESS_STORE__) {
      global.__GOINDIARIDE_FUTURE_BUSINESS_STORE__ = loadStore();
    }
    return global.__GOINDIARIDE_FUTURE_BUSINESS_STORE__;
  }

  function writeStore() {
    try {
      ensureDir();
      const data = getStore();
      const payload = JSON.stringify(data, null, 2);
      fs.writeFileSync(DATA_FILE_TEMP, payload, 'utf8');

      if (fs.existsSync(DATA_FILE)) {
        fs.copyFileSync(DATA_FILE, DATA_FILE_BACKUP);
      }

      fs.copyFileSync(DATA_FILE_TEMP, DATA_FILE);
      fs.copyFileSync(DATA_FILE, DATA_FILE_BACKUP);
      appendRuntimeSnapshot(data, 'persist_write');
      fs.unlinkSync(DATA_FILE_TEMP);
      queueRuntimeGitSync();
    } catch (_error) {
      try {
        if (fs.existsSync(DATA_FILE_TEMP)) fs.unlinkSync(DATA_FILE_TEMP);
      } catch (_cleanupError) {
        // Best effort cleanup.
      }
      // Non-blocking persistence.
    }
  }

  function queuePersist() {
    if (persistTimer) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      writeStore();
    }, 400);
  }

  function walletForUser(store, userKey) {
    if (!store.wallets[userKey]) {
      store.wallets[userKey] = {
        userKey,
        balance: 0,
        history: []
      };
    }
    return store.wallets[userKey];
  }

  function addWalletEntry(wallet, type, amount, meta) {
    const entry = {
      id: crypto.randomUUID(),
      type,
      amount: normalizeAmount(amount),
      meta: safeObject(meta),
      createdAt: new Date().toISOString()
    };
    wallet.history.push(entry);
    return entry;
  }

  function resolveRuntimeWalletUserKey(req, userKeyInput) {
    const actorType = resolveActorWalletType(req.user);
    const requested = normalizeString(userKeyInput, 80);
    if (actorType === 'admin') {
      return requested;
    }
    return normalizeString(req.user && req.user.id, 80);
  }

  function canAccessRuntimeWallet(req, userKey) {
    const actorType = resolveActorWalletType(req.user);
    if (actorType === 'admin') return true;
    return String(normalizeString(userKey, 80)) === String(normalizeString(req.user && req.user.id, 80));
  }

  function findAutoDeduction(store, userKey, reference) {
    if (!reference) return null;
    const normalizedReference = normalizeString(reference, 140);
    if (!normalizedReference) return null;

    return (Array.isArray(store.autoDeductions) ? store.autoDeductions : []).find((row) => (
      String(row.userKey) === String(userKey)
      && String(row.reference) === normalizedReference
      && row.status === 'settled'
    )) || null;
  }

  function getSignedAutoDeductionsForUser(store, userKey) {
    const rows = Array.isArray(store.autoDeductions) ? store.autoDeductions : [];
    return rows
      .filter((row) => (
        String(row.userKey) === String(userKey)
        && normalizeString(row.integrityHash, 128)
      ))
      .sort((a, b) => {
        const left = new Date(a.createdAt).getTime();
        const right = new Date(b.createdAt).getTime();
        if (left !== right) return left - right;
        return String(a.id || '').localeCompare(String(b.id || ''));
      });
  }

  function computeAutoDeductionIntegrityHash(payload) {
    const data = JSON.stringify({
      previousHash: normalizeString(payload.previousHash, 128) || AUTO_DEDUCT_HASH_GENESIS,
      userKey: normalizeString(payload.userKey, 80),
      reference: normalizeString(payload.reference, 140),
      amount: normalizeAmount(payload.amount),
      reason: normalizeString(payload.reason, 250),
      walletEntryId: normalizeString(payload.walletEntryId, 120),
      actorUserId: normalizeString(payload.actorUserId, 120),
      createdAt: normalizeString(payload.createdAt, 80)
    });
    return crypto.createHmac('sha256', AUTO_DEDUCT_HASH_SECRET).update(data).digest('hex');
  }

  function verifyAutoDeductionIntegrityChain(store, userKey) {
    const rows = getSignedAutoDeductionsForUser(store, userKey);
    if (!rows.length) {
      return { ok: true, headHash: AUTO_DEDUCT_HASH_GENESIS };
    }

    let previousHash = AUTO_DEDUCT_HASH_GENESIS;
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const expectedHash = computeAutoDeductionIntegrityHash({
        previousHash,
        userKey: row.userKey,
        reference: row.reference,
        amount: row.amount,
        reason: row.reason,
        walletEntryId: row.walletEntryId,
        actorUserId: row.actorUserId,
        createdAt: row.createdAt
      });

      if (String(row.previousHash || AUTO_DEDUCT_HASH_GENESIS) !== String(previousHash) || String(row.integrityHash) !== String(expectedHash)) {
        return {
          ok: false,
          rowId: row.id
        };
      }

      previousHash = expectedHash;
    }

    return { ok: true, headHash: previousHash };
  }

  function addAutoDeduction(store, payload) {
    const integrity = verifyAutoDeductionIntegrityChain(store, payload.userKey);
    const previousHash = integrity.ok ? integrity.headHash : AUTO_DEDUCT_HASH_GENESIS;
    const createdAt = new Date().toISOString();
    const event = {
      id: crypto.randomUUID(),
      userKey: normalizeString(payload.userKey, 80),
      reference: normalizeString(payload.reference, 140),
      amount: normalizeAmount(payload.amount),
      reason: normalizeString(payload.reason, 250),
      walletEntryId: normalizeString(payload.walletEntryId, 120),
      actorUserId: normalizeString(payload.actorUserId, 120),
      status: 'settled',
      previousHash,
      createdAt
    };
    event.integrityHash = computeAutoDeductionIntegrityHash(event);

    if (!Array.isArray(store.autoDeductions)) {
      store.autoDeductions = [];
    }

    pushWithCap(store.autoDeductions, event);
    return event;
  }

  function addRideHistory(store, payload) {
    const userKey = normalizeString(payload.userKey, 80);
    if (!userKey) return null;

    if (!store.rideHistory[userKey]) store.rideHistory[userKey] = [];
    const record = {
      id: crypto.randomUUID(),
      bookingId: normalizeString(payload.bookingId, 100) || `BK-${Date.now()}`,
      from: normalizeString(payload.from, 180),
      to: normalizeString(payload.to, 180),
      distanceKm: normalizeAmount(payload.distanceKm),
      fare: normalizeAmount(payload.fare),
      status: normalizeString(payload.status, 30) || 'completed',
      driverName: normalizeString(payload.driverName, 120),
      rating: normalizeAmount(payload.rating),
      feedback: normalizeString(payload.feedback, 500),
      createdAt: new Date().toISOString()
    };

    store.rideHistory[userKey].push(record);
    return record;
  }

  function normalizeVehicleType(value) {
    const key = normalizeString(value, 30).toLowerCase();
    if (vehicleBaseRates[key]) return key;
    if (key.includes('hatch') || key.includes('economy')) return 'economy';
    if (key.includes('prem')) return 'premium';
    if (key.includes('xl')) return 'xl';
    if (key.includes('suv')) return 'suv';
    return 'sedan';
  }

  function normalizeCurrency(value) {
    const key = normalizeString(value, 10).toUpperCase();
    return currencyRates[key] ? key : 'INR';
  }

  function estimateFare(payload) {
    const distanceKm = Math.max(0, normalizeAmount(payload.distanceKm || payload.distance || 0));
    const durationMin = Math.max(0, normalizeAmount(payload.durationMin || payload.duration || 0));
    const vehicleType = normalizeVehicleType(payload.vehicleType || payload.rideType);
    const basePerKm = vehicleBaseRates[vehicleType] || vehicleBaseRates.sedan;
    const seasonMultiplier = Math.max(0.5, Math.min(3, normalizeAmount(payload.seasonMultiplier || 1) || 1));
    const trafficMultiplier = Math.max(0.5, Math.min(2, normalizeAmount(payload.trafficMultiplier || 1) || 1));
    const waitingCharge = Math.max(0, normalizeAmount(payload.waitingCharge || 0));
    const tollCharge = Math.max(0, normalizeAmount(payload.tollCharge || 0));
    const parkingCharge = Math.max(0, normalizeAmount(payload.parkingCharge || 0));
    const offerPercent = Math.max(0, Math.min(80, normalizeAmount(payload.offerPercent || payload.discountPercent || 0)));

    const distanceFare = normalizeAmount(distanceKm * basePerKm);
    const timeFare = normalizeAmount(durationMin * 0.5);
    const grossInr = normalizeAmount((distanceFare + timeFare + waitingCharge + tollCharge + parkingCharge) * seasonMultiplier * trafficMultiplier);
    const discount = normalizeAmount((grossInr * offerPercent) / 100);
    const netInr = Math.max(0, normalizeAmount(grossInr - discount));
    const currency = normalizeCurrency(payload.currency);
    const converted = normalizeAmount(netInr * (currencyRates[currency] || 1));

    return {
      vehicleType,
      currency,
      basePerKm,
      distanceKm,
      durationMin,
      distanceFare,
      timeFare,
      waitingCharge,
      tollCharge,
      parkingCharge,
      seasonMultiplier,
      trafficMultiplier,
      offerPercent,
      grossInr,
      discountInr: discount,
      finalInr: netInr,
      convertedFare: converted,
      calculatedAt: new Date().toISOString()
    };
  }

  function pushWithCap(list, item) {
    list.push(item);
  }

  function getRuntimeEventDigest(store) {
    const input = safeObject(store.runtimeEventDigest);
    return {
      lastHash: normalizeString(input.lastHash, 128) || AUTO_DEDUCT_HASH_GENESIS,
      totalEvents: Number.isFinite(Number(input.totalEvents)) ? Number(input.totalEvents) : 0,
      lastEventAt: input.lastEventAt || null,
      lastWriteErrorAt: input.lastWriteErrorAt || null
    };
  }

  function computeRuntimeEventHash({ previousHash, eventType, createdAt, payload }) {
    const serializedPayload = JSON.stringify(safeObject(payload));
    const base = `${normalizeString(previousHash, 128) || AUTO_DEDUCT_HASH_GENESIS}:${normalizeString(eventType, 80)}:${normalizeString(createdAt, 80)}:${serializedPayload}`;
    return crypto.createHmac('sha256', RUNTIME_EVENT_HASH_SECRET).update(base).digest('hex');
  }

  function appendRuntimeEvent(store, eventType, payload = {}) {
    if (!RUNTIME_EVENTS_ENABLED) return null;

    const digest = getRuntimeEventDigest(store);
    const createdAt = new Date().toISOString();
    const eventPayload = safeObject(payload);
    const event = {
      id: crypto.randomUUID(),
      eventType: normalizeString(eventType, 80) || 'runtime_event',
      createdAt,
      previousHash: digest.lastHash,
      payload: eventPayload
    };
    event.hash = computeRuntimeEventHash({
      previousHash: event.previousHash,
      eventType: event.eventType,
      createdAt: event.createdAt,
      payload: event.payload
    });

    try {
      ensureDir();
      fs.appendFileSync(DATA_EVENTS_FILE, `${JSON.stringify(event)}\n`, 'utf8');
      digest.lastHash = event.hash;
      digest.totalEvents += 1;
      digest.lastEventAt = createdAt;
      store.runtimeEventDigest = digest;
      queueRuntimeGitSync();
      return event;
    } catch (_error) {
      digest.lastWriteErrorAt = createdAt;
      store.runtimeEventDigest = digest;
      return null;
    }
  }

  function getRuntimeSnapshotDigest(store) {
    const input = safeObject(store.runtimeSnapshotDigest);
    return {
      lastHash: normalizeString(input.lastHash, 128) || AUTO_DEDUCT_HASH_GENESIS,
      totalSnapshots: Number.isFinite(Number(input.totalSnapshots)) ? Number(input.totalSnapshots) : 0,
      lastSnapshotAt: input.lastSnapshotAt || null,
      lastWriteErrorAt: input.lastWriteErrorAt || null
    };
  }

  function buildRuntimeStoreSummary(store) {
    const wallets = safeObject(store.wallets);
    const walletRows = Object.values(wallets);
    const totalWalletBalance = walletRows.reduce((sum, row) => sum + Number(row && row.balance ? row.balance : 0), 0);

    return {
      wallets: {
        count: walletRows.length,
        totalBalance: normalizeAmount(totalWalletBalance)
      },
      arrays: {
        notifications: Array.isArray(store.notifications) ? store.notifications.length : 0,
        commissions: Array.isArray(store.commissions) ? store.commissions.length : 0,
        authLogs: Array.isArray(store.authLogs) ? store.authLogs.length : 0,
        autoDeductions: Array.isArray(store.autoDeductions) ? store.autoDeductions.length : 0,
        bookings: Array.isArray(store.bookingActions) ? store.bookingActions.length : 0
      },
      rideUsers: Object.keys(safeObject(store.rideHistory)).length,
      featureUsers: Object.keys(safeObject(store.featureStates)).length
    };
  }

  function computeRuntimeSnapshotHash({ previousHash, createdAt, reason, summary }) {
    const serializedSummary = JSON.stringify(safeObject(summary));
    const base = `${normalizeString(previousHash, 128) || AUTO_DEDUCT_HASH_GENESIS}:${normalizeString(createdAt, 80)}:${normalizeString(reason, 80)}:${serializedSummary}`;
    return crypto.createHmac('sha256', RUNTIME_SNAPSHOT_HASH_SECRET).update(base).digest('hex');
  }

  function appendRuntimeSnapshot(store, reason = 'persist') {
    if (!RUNTIME_SNAPSHOTS_ENABLED) return null;

    const digest = getRuntimeSnapshotDigest(store);
    const createdAt = new Date().toISOString();
    const snapshot = {
      id: crypto.randomUUID(),
      reason: normalizeString(reason, 80) || 'persist',
      createdAt,
      previousHash: digest.lastHash,
      summary: buildRuntimeStoreSummary(store)
    };
    snapshot.hash = computeRuntimeSnapshotHash({
      previousHash: snapshot.previousHash,
      createdAt: snapshot.createdAt,
      reason: snapshot.reason,
      summary: snapshot.summary
    });

    try {
      ensureDir();
      fs.appendFileSync(DATA_SNAPSHOTS_FILE, `${JSON.stringify(snapshot)}\n`, 'utf8');
      digest.lastHash = snapshot.hash;
      digest.totalSnapshots += 1;
      digest.lastSnapshotAt = createdAt;
      store.runtimeSnapshotDigest = digest;
      queueRuntimeGitSync();
      return snapshot;
    } catch (_error) {
      digest.lastWriteErrorAt = createdAt;
      store.runtimeSnapshotDigest = digest;
      return null;
    }
  }

  function getRuntimeFileMetadata(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        return { exists: false, size: 0, mtime: null };
      }
      const stat = fs.statSync(filePath);
      return {
        exists: true,
        size: Number(stat.size || 0),
        mtime: stat.mtime ? stat.mtime.toISOString() : null
      };
    } catch (_error) {
      return { exists: false, size: 0, mtime: null };
    }
  }

  function readTailNdjson(filePath, limit = 50) {
    const safeLimit = Math.min(RUNTIME_AUDIT_MAX_LIMIT, Math.max(1, Number(limit || 50)));
    try {
      if (!fs.existsSync(filePath)) return [];
      const raw = fs.readFileSync(filePath, 'utf8');
      const lines = String(raw || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const tail = lines.slice(-safeLimit);
      const rows = [];
      for (let i = 0; i < tail.length; i += 1) {
        try {
          rows.push(JSON.parse(tail[i]));
        } catch (_error) {
          // Skip malformed line and continue audit visibility.
        }
      }
      return rows;
    } catch (_error) {
      return [];
    }
  }

  function verifyRuntimeEventFileChain(limit = null) {
    try {
      if (!fs.existsSync(DATA_EVENTS_FILE)) {
        return { ok: true, total: 0, checked: 0, reason: 'events_file_missing' };
      }

      const raw = fs.readFileSync(DATA_EVENTS_FILE, 'utf8');
      const lines = String(raw || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const maxChecks = limit ? Math.min(lines.length, Math.max(1, Number(limit))) : lines.length;
      const startIndex = lines.length - maxChecks;

      let previousHash = startIndex > 0
        ? normalizeString(JSON.parse(lines[startIndex - 1] || '{}').hash, 128)
        : AUTO_DEDUCT_HASH_GENESIS;

      let checked = 0;
      for (let i = startIndex; i < lines.length; i += 1) {
        let row = null;
        try {
          row = JSON.parse(lines[i]);
        } catch (_error) {
          return { ok: false, total: lines.length, checked, reason: 'invalid_json_line', line: i + 1 };
        }

        const expected = computeRuntimeEventHash({
          previousHash,
          eventType: row.eventType,
          createdAt: row.createdAt,
          payload: safeObject(row.payload)
        });

        if (String(row.previousHash || AUTO_DEDUCT_HASH_GENESIS) !== String(previousHash)) {
          return {
            ok: false,
            total: lines.length,
            checked,
            reason: 'previous_hash_mismatch',
            line: i + 1,
            eventId: row.id || null
          };
        }

        if (String(row.hash || '') !== String(expected)) {
          return {
            ok: false,
            total: lines.length,
            checked,
            reason: 'hash_mismatch',
            line: i + 1,
            eventId: row.id || null
          };
        }

        previousHash = expected;
        checked += 1;
      }

      return {
        ok: true,
        total: lines.length,
        checked,
        headHash: previousHash
      };
    } catch (_error) {
      return { ok: false, total: 0, checked: 0, reason: 'verify_failed' };
    }
  }

  function generateOtpCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  function normalizeBookingStatus(value) {
    const key = normalizeString(value, 40).toLowerCase();
    if (key.includes('accept')) return 'accepted';
    if (key.includes('pick')) return 'picked_up';
    if (key.includes('start')) return 'started';
    if (key.includes('complete')) return 'completed';
    if (key.includes('cancel')) return 'cancelled';
    if (key.includes('resched')) return 'rescheduled';
    if (key.includes('reject')) return 'rejected';
    return key || 'updated';
  }

  function addAuthLog(store, payload) {
    const item = {
      id: crypto.randomUUID(),
      userKey: normalizeString(payload.userKey, 80) || 'guest-user',
      action: normalizeString(payload.action, 80) || 'auth-event',
      channel: normalizeString(payload.channel, 40) || 'app',
      success: payload.success !== undefined ? Boolean(payload.success) : true,
      message: normalizeString(payload.message, 320),
      createdAt: new Date().toISOString()
    };
    pushWithCap(store.authLogs, item);
    return item;
  }

  function buildFeatureStateKey(userKey, featureId) {
    return `${normalizeString(userKey, 80) || 'guest-user'}::${normalizeString(featureId, 80)}`;
  }


  // Route: /wallet/topup
  router.post('/wallet/topup', walletCriticalLimiter, strictWalletSignature, (req, res) => {
    const store = getStore();
    const requestedUserKey = normalizeString(req.body?.userKey, 80);
    if (requestedUserKey && !canAccessRuntimeWallet(req, requestedUserKey)) {
      return res.status(403).json({ ok: false, message: 'Forbidden wallet access' });
    }

    const userKey = resolveRuntimeWalletUserKey(req, requestedUserKey);
    const amount = normalizeAmount(req.body?.amount);
    const method = normalizeString(req.body?.method, 80) || 'manual';
    const note = normalizeString(req.body?.note, 250);

    if (!userKey) {
      return res.status(400).json({ ok: false, message: 'Valid userKey is required' });
    }

    if (amount <= 0 || amount > MAX_RUNTIME_WALLET_AMOUNT) {
      return res.status(400).json({ ok: false, message: `amount must be between 0 and ${MAX_RUNTIME_WALLET_AMOUNT}` });
    }

    const wallet = walletForUser(store, userKey);
    if (wallet.balance + amount > MAX_RUNTIME_WALLET_AMOUNT) {
      return res.status(409).json({
        ok: false,
        message: `Wallet balance cannot exceed ${MAX_RUNTIME_WALLET_AMOUNT}`,
        balance: wallet.balance
      });
    }

    wallet.balance = normalizeAmount(wallet.balance + amount);
    const entry = addWalletEntry(wallet, 'credit', amount, {
      method,
      note,
      actorUserId: normalizeString(req.user && req.user.id, 120),
      source: 'legacy_wallet_topup'
    });
    const runtimeEvent = appendRuntimeEvent(store, 'runtime_wallet_topup', {
      userKey,
      amount,
      method,
      walletEntryId: entry.id,
      actorUserId: normalizeString(req.user && req.user.id, 120),
      ip: getClientIp(req)
    });
    queuePersist();

    return res.status(200).json({
      ok: true,
      wallet: clone(wallet),
      entry,
      runtimeEventId: runtimeEvent ? runtimeEvent.id : null
    });
  });


  // Route: /wallet/spend
  router.post('/wallet/spend', walletCriticalLimiter, strictWalletSignature, (req, res) => {
    const store = getStore();
    const actorType = resolveActorWalletType(req.user);
    const requestedUserKey = normalizeString(req.body?.userKey, 80);
    if (requestedUserKey && !canAccessRuntimeWallet(req, requestedUserKey)) {
      return res.status(403).json({ ok: false, message: 'Forbidden wallet access' });
    }

    const userKey = resolveRuntimeWalletUserKey(req, requestedUserKey);
    const amount = normalizeAmount(req.body?.amount);
    const reason = normalizeString(req.body?.reason, 250) || 'auto-deducted-ride-payment';
    const autoDeductReference = normalizeString(
      req.body?.autoDeductRef
      || req.body?.bookingId
      || req.body?.clientReference
      || req.headers['x-idempotency-key'],
      140
    );

    if (!userKey) {
      return res.status(400).json({ ok: false, message: 'Valid userKey is required' });
    }

    if (amount <= 0 || amount > MAX_RUNTIME_WALLET_AMOUNT) {
      return res.status(400).json({ ok: false, message: `amount must be between 0 and ${MAX_RUNTIME_WALLET_AMOUNT}` });
    }

    if (!autoDeductReference || autoDeductReference.length < AUTO_DEDUCT_REF_MIN_LENGTH) {
      return res.status(400).json({
        ok: false,
        message: `autoDeductRef (or bookingId/clientReference/x-idempotency-key) with minimum ${AUTO_DEDUCT_REF_MIN_LENGTH} chars is required`
      });
    }

    const integrityCheck = verifyAutoDeductionIntegrityChain(store, userKey);
    if (!integrityCheck.ok) {
      logSecurityEvent({
        userId: req.user && req.user.id,
        action: 'legacy_wallet_auto_deduct_chain_tamper_detected',
        ip: getClientIp(req),
        riskScore: 90,
        result: 'blocked',
        metadata: {
          userKey,
          rowId: integrityCheck.rowId
        }
      }).catch(() => {});

      return res.status(409).json({
        ok: false,
        message: 'Auto deduction integrity validation failed. Contact admin.'
      });
    }

    if (
      actorType !== 'admin'
      && RUNTIME_AUTO_DEDUCT_REQUIRE_OTP
      && amount >= RUNTIME_AUTO_DEDUCT_HIGH_VALUE
      && String(req.headers['x-otp-verified'] || '').toLowerCase() !== 'true'
    ) {
      logSecurityEvent({
        userId: req.user && req.user.id,
        action: 'legacy_wallet_high_value_auto_deduct_otp_required',
        ip: getClientIp(req),
        riskScore: 70,
        result: 'blocked',
        metadata: {
          userKey,
          amount,
          autoDeductReference
        }
      }).catch(() => {});

      return res.status(401).json({
        ok: false,
        message: `OTP verification required for auto deduction >= ${RUNTIME_AUTO_DEDUCT_HIGH_VALUE}`
      });
    }

    const existingAutoDeduction = findAutoDeduction(store, userKey, autoDeductReference);
    if (existingAutoDeduction) {
      const wallet = walletForUser(store, userKey);
      const existingEntry = Array.isArray(wallet.history)
        ? wallet.history.find((item) => String(item.id) === String(existingAutoDeduction.walletEntryId))
        : null;
      const reusedRuntimeEvent = appendRuntimeEvent(store, 'runtime_wallet_spend_reused', {
        userKey,
        amount,
        autoDeductReference,
        autoDeductionId: existingAutoDeduction.id,
        actorUserId: normalizeString(req.user && req.user.id, 120),
        ip: getClientIp(req)
      });
      queuePersist();

      return res.status(200).json({
        ok: true,
        reused: true,
        wallet: clone(wallet),
        entry: existingEntry || null,
        autoDeduction: existingAutoDeduction,
        runtimeEventId: reusedRuntimeEvent ? reusedRuntimeEvent.id : null
      });
    }

    const wallet = walletForUser(store, userKey);
    if (wallet.balance < amount) {
      return res.status(409).json({
        ok: false,
        message: 'Insufficient wallet balance',
        balance: wallet.balance
      });
    }

    wallet.balance = normalizeAmount(wallet.balance - amount);
    const entry = addWalletEntry(wallet, 'debit', amount, {
      reason,
      autoDeductReference: autoDeductReference || undefined,
      actorUserId: normalizeString(req.user && req.user.id, 120),
      source: 'legacy_wallet_spend'
    });

    const autoDeduction = autoDeductReference
      ? addAutoDeduction(store, {
        userKey,
        reference: autoDeductReference,
        amount,
        reason,
        walletEntryId: entry.id,
        actorUserId: normalizeString(req.user && req.user.id, 120)
      })
      : null;
    const runtimeEvent = appendRuntimeEvent(store, 'runtime_wallet_spend', {
      userKey,
      amount,
      reason,
      autoDeductReference,
      walletEntryId: entry.id,
      autoDeductionId: autoDeduction ? autoDeduction.id : null,
      actorUserId: normalizeString(req.user && req.user.id, 120),
      ip: getClientIp(req)
    });

    if (amount >= RUNTIME_AUTO_DEDUCT_HIGH_VALUE) {
      logSecurityEvent({
        userId: req.user && req.user.id,
        action: 'legacy_wallet_high_value_auto_deduct_completed',
        ip: getClientIp(req),
        riskScore: 45,
        result: 'flagged',
        metadata: {
          userKey,
          amount,
          autoDeductReference
        }
      }).catch(() => {});
    }

    queuePersist();

    return res.status(200).json({
      ok: true,
      wallet: clone(wallet),
      entry,
      autoDeduction,
      runtimeEventId: runtimeEvent ? runtimeEvent.id : null
    });
  });


  // Route: /wallet/:userKey
  router.get('/wallet/:userKey', (req, res) => {
    const store = getStore();
    const userKey = normalizeString(req.params.userKey, 80);
    if (!userKey) return res.status(400).json({ ok: false, message: 'Invalid userKey' });
    if (!canAccessRuntimeWallet(req, userKey)) {
      return res.status(403).json({ ok: false, message: 'Forbidden wallet access' });
    }
    const wallet = walletForUser(store, userKey);
    return res.status(200).json({ ok: true, wallet: clone(wallet) });
  });

  router.get('/runtime/audit/digest', requireAdmin, (req, res) => {
    const store = getStore();
    return res.status(200).json({
      eventDigest: getRuntimeEventDigest(store),
      snapshotDigest: getRuntimeSnapshotDigest(store),
      storeSummary: buildRuntimeStoreSummary(store),
      files: {
        store: getRuntimeFileMetadata(DATA_FILE),
        backup: getRuntimeFileMetadata(DATA_FILE_BACKUP),
        events: getRuntimeFileMetadata(DATA_EVENTS_FILE),
        snapshots: getRuntimeFileMetadata(DATA_SNAPSHOTS_FILE)
      }
    });
  });

  router.get('/runtime/audit/events', requireAdmin, (req, res) => {
    const limit = Math.min(RUNTIME_AUDIT_MAX_LIMIT, Math.max(1, Number(req.query.limit || 50)));
    return res.status(200).json({
      limit,
      events: readTailNdjson(DATA_EVENTS_FILE, limit),
      snapshots: readTailNdjson(DATA_SNAPSHOTS_FILE, limit)
    });
  });

  router.post('/runtime/audit/verify', requireAdmin, walletCriticalLimiter, strictWalletSignature, (req, res) => {
    const limitInput = Number(req.body?.limit || req.query?.limit || 0);
    const verification = verifyRuntimeEventFileChain(limitInput > 0 ? limitInput : null);
    const store = getStore();
    const auditEvent = appendRuntimeEvent(store, 'runtime_audit_verify', {
      ok: verification.ok,
      checked: verification.checked,
      total: verification.total,
      reason: verification.reason || null,
      actorUserId: normalizeString(req.user && req.user.id, 120),
      ip: getClientIp(req)
    });
    queuePersist();

    return res.status(verification.ok ? 200 : 409).json({
      verification,
      auditEventId: auditEvent ? auditEvent.id : null,
      eventDigest: getRuntimeEventDigest(store),
      snapshotDigest: getRuntimeSnapshotDigest(store)
    });
  });


  // Route: /commission/partner
  router.post('/commission/partner', (req, res) => {
    const store = getStore();
    const partnerType = normalizeString(req.body?.partnerType, 60);
    const partnerName = normalizeString(req.body?.partnerName, 140);
    const amount = normalizeAmount(req.body?.amount);
    const commissionPercent = normalizeAmount(req.body?.commissionPercent);
    const bookingId = normalizeString(req.body?.bookingId, 100);

    if (!partnerType || !partnerName || amount <= 0) {
      return res.status(400).json({ ok: false, message: 'partnerType, partnerName and positive amount are required' });
    }

    const commissionAmount = normalizeAmount(amount * (commissionPercent > 0 ? commissionPercent : 20) / 100);
    const item = {
      id: crypto.randomUUID(),
      partnerType,
      partnerName,
      bookingId,
      amount,
      commissionPercent: commissionPercent > 0 ? commissionPercent : 20,
      commissionAmount,
      createdAt: new Date().toISOString()
    };

    store.commissions.push(item);
    const runtimeEvent = appendRuntimeEvent(store, 'runtime_partner_commission', {
      bookingId,
      partnerType,
      partnerName,
      amount,
      commissionPercent: item.commissionPercent,
      commissionAmount: item.commissionAmount,
      actorUserId: normalizeString(req.user && req.user.id, 120),
      ip: getClientIp(req)
    });
    queuePersist();
    return res.status(201).json({ ok: true, item, runtimeEventId: runtimeEvent ? runtimeEvent.id : null });
  });


  // Route: /commission/partner
  router.get('/commission/partner', (req, res) => {
    const store = getStore();
    const partnerType = normalizeString(req.query.partnerType, 60);
    const list = partnerType
      ? store.commissions.filter((item) => normalizeString(item.partnerType, 60) === partnerType)
      : store.commissions;
    const total = list.reduce((sum, item) => sum + Number(item.commissionAmount || 0), 0);
    return res.status(200).json({ ok: true, count: list.length, totalCommission: normalizeAmount(total), items: list.slice(-500) });
  });
}
// === FUTURE_ROUTES_BUSINESS_WALLETROUTES_END ===

module.exports = router;
