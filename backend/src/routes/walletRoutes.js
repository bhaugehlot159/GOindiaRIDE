const express = require('express');
const WalletAccount = require('../models/WalletAccount');
const WalletPaymentMode = require('../models/WalletPaymentMode');
const WalletTopupOrder = require('../models/WalletTopupOrder');
const WalletTransaction = require('../models/WalletTransaction');
const WalletWithdrawalRequest = require('../models/WalletWithdrawalRequest');
const { authenticate } = require('../middleware/authMiddleware');
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

  const wallet = await ensureWallet(normalizedType, normalizedOwner);

  if (wallet.status !== 'active') {
    const error = new Error('Wallet is not active');
    error.statusCode = 403;
    throw error;
  }

  const delta = direction === 'debit' ? -numericAmount : numericAmount;
  const nextBalance = Number((Number(wallet.balance || 0) + delta).toFixed(2));

  if (nextBalance < 0) {
    const error = new Error('Insufficient wallet balance');
    error.statusCode = 400;
    throw error;
  }

  wallet.balance = nextBalance;
  await wallet.save();
  return wallet;
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

router.post('/topup/confirm', wrapAsync(async (req, res) => {
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

  const order = await WalletTopupOrder.findOne({ orderId, walletType: actorType, ownerId });
  if (!order) {
    return res.status(404).json({ message: 'Top-up order not found' });
  }

  if (order.status === 'confirmed') {
    const wallet = await ensureWallet(actorType, ownerId);
    return res.status(200).json({
      message: 'Top-up already confirmed',
      order,
      wallet
    });
  }

  if (order.status !== 'pending') {
    return res.status(400).json({ message: `Top-up order is ${order.status}` });
  }

  if (new Date(order.expiresAt).getTime() <= Date.now()) {
    order.status = 'expired';
    await order.save();
    return res.status(410).json({ message: 'Top-up order expired. Create a new order.' });
  }

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

  order.status = 'confirmed';
  order.providerReference = providerReference;
  await order.save();

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

  return res.status(200).json({
    message: 'Top-up confirmed securely',
    order,
    wallet: customerWallet,
    adminWallet
  });
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

router.post('/donations/confirm', wrapAsync(async (req, res) => {
  const actorType = resolveActorWalletType(req.user);
  const orderId = sanitizeText(req.body.orderId, 120);
  const providerReference = sanitizeText(req.body.providerReference, 180);

  if (!orderId) {
    return res.status(400).json({ message: 'orderId is required' });
  }

  if (!providerReference || providerReference.length < 5) {
    return res.status(400).json({ message: 'providerReference is required for secure confirmation' });
  }

  const order = await WalletTopupOrder.findOne({ orderId, walletType: 'donation', ownerId: 'pool' });
  if (!order) {
    return res.status(404).json({ message: 'Donation intent not found' });
  }

  if (order.donorUserId && actorType !== 'admin' && String(order.donorUserId) !== String(req.user.id)) {
    return res.status(403).json({ message: 'You cannot confirm this donation' });
  }

  if (order.status === 'confirmed') {
    const donationWallet = await ensureWallet('donation', 'pool');
    return res.status(200).json({
      message: 'Donation already confirmed',
      order,
      donationWallet
    });
  }

  if (order.status !== 'pending') {
    return res.status(400).json({ message: `Donation intent is ${order.status}` });
  }

  if (new Date(order.expiresAt).getTime() <= Date.now()) {
    order.status = 'expired';
    await order.save();
    return res.status(410).json({ message: 'Donation intent expired. Start again.' });
  }

  const donationWallet = await adjustWallet({
    walletType: 'donation',
    ownerId: 'pool',
    amount: order.amount,
    direction: 'credit'
  });

  order.status = 'confirmed';
  order.providerReference = providerReference;
  await order.save();

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

  return res.status(200).json({
    message: 'Donation confirmed securely',
    order,
    donationWallet
  });
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
router.post('/commissions/collect', wrapAsync(async (req, res) => {
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
router.post('/driver-commissions/settle', wrapAsync(async (req, res) => {
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

router.post('/driver-commissions/refund', wrapAsync(async (req, res) => {
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
router.post('/withdrawals', wrapAsync(async (req, res) => {
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

router.post('/admin/withdrawals/:requestId/review', requireAdmin, wrapAsync(async (req, res) => {
  const requestId = sanitizeText(req.params.requestId, 140);
  const decision = sanitizeText(req.body.decision, 40).toLowerCase();
  const remarks = sanitizeText(req.body.remarks, 240);

  if (!['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({ message: 'decision must be approved or rejected' });
  }

  const request = await WalletWithdrawalRequest.findOne({ requestId });
  if (!request) {
    return res.status(404).json({ message: 'Withdrawal request not found' });
  }

  if (request.status !== 'pending_admin_approval') {
    return res.status(400).json({ message: `Request already ${request.status}` });
  }

  const sourceWallet = await ensureWallet(request.walletType, request.ownerId);
  const adminWallet = await ensureWallet('admin', 'platform');

  if (decision === 'approved') {
    if (Number(sourceWallet.balance || 0) < Number(request.amount || 0)) {
      return res.status(400).json({ message: 'Source wallet has insufficient balance' });
    }

    if (Number(adminWallet.balance || 0) < Number(request.amount || 0)) {
      return res.status(400).json({ message: 'Admin settlement wallet has insufficient payout balance' });
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

  request.status = decision;
  request.reviewedAt = new Date();
  request.reviewedBy = String(req.user.id);
  request.remarks = remarks;
  await request.save();

  return res.status(200).json({
    message: `Withdrawal request ${decision}`,
    request
  });
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

router.post('/admin/wallet-adjust', requireAdmin, wrapAsync(async (req, res) => {
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


  const DATA_DIR = path.join(__dirname, '../../../data/runtime');
  const DATA_FILE = path.join(DATA_DIR, 'future-business-store.json');
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

  let persistTimer = null;
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

  function loadStore() {
    try {
      if (!fs.existsSync(DATA_FILE)) return defaultStore();
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      const store = defaultStore();
      return {
        ...store,
        ...safeObject(parsed),
        wallets: safeObject(parsed.wallets),
        notifications: Array.isArray(parsed.notifications) ? parsed.notifications.slice(-MAX_NOTIFICATIONS) : [],
        travelCards: safeObject(parsed.travelCards),
        commissions: Array.isArray(parsed.commissions) ? parsed.commissions.slice(-MAX_COMMISSIONS) : [],
        listings: Array.isArray(parsed.listings) ? parsed.listings.slice(-MAX_LISTINGS) : [],
        packages: Array.isArray(parsed.packages) ? parsed.packages.slice(-MAX_PACKAGES) : [],
        packageBookings: Array.isArray(parsed.packageBookings) ? parsed.packageBookings.slice(-MAX_PACKAGE_BOOKINGS) : [],
        referrals: Array.isArray(parsed.referrals) ? parsed.referrals.slice(-MAX_REFERRALS) : [],
        reviews: Array.isArray(parsed.reviews) ? parsed.reviews.slice(-MAX_REVIEWS) : [],
        otpEvents: Array.isArray(parsed.otpEvents) ? parsed.otpEvents.slice(-MAX_OTP_EVENTS) : [],
        authLogs: Array.isArray(parsed.authLogs) ? parsed.authLogs.slice(-MAX_AUTH_LOGS) : [],
        bookingActions: Array.isArray(parsed.bookingActions) ? parsed.bookingActions.slice(-MAX_BOOKING_ACTIONS) : [],
        disputes: Array.isArray(parsed.disputes) ? parsed.disputes.slice(-MAX_DISPUTES) : [],
        fraudAlerts: Array.isArray(parsed.fraudAlerts) ? parsed.fraudAlerts.slice(-MAX_FRAUD_ALERTS) : [],
        aiChats: Array.isArray(parsed.aiChats) ? parsed.aiChats.slice(-MAX_AI_CHATS) : [],
        savedLocations: Array.isArray(parsed.savedLocations) ? parsed.savedLocations.slice(-MAX_SAVED_LOCATIONS) : [],
        featureStates: safeObject(parsed.featureStates),
        featureActions: Array.isArray(parsed.featureActions) ? parsed.featureActions.slice(-MAX_FEATURE_ACTIONS) : [],
        termsConsents: Array.isArray(parsed.termsConsents) ? parsed.termsConsents.slice(-MAX_TERMS_CONSENTS) : [],
        supportTickets: Array.isArray(parsed.supportTickets) ? parsed.supportTickets.slice(-MAX_SUPPORT_TICKETS) : [],
        webhookEvents: Array.isArray(parsed.webhookEvents) ? parsed.webhookEvents.slice(-MAX_WEBHOOK_EVENTS) : [],
        tourismPlaces: Array.isArray(parsed.tourismPlaces) && parsed.tourismPlaces.length
          ? parsed.tourismPlaces.slice(-MAX_TOURISM_PLACES)
          : store.tourismPlaces,
        rideHistory: safeObject(parsed.rideHistory),
        preferences: safeObject(parsed.preferences),
        counters: {
          ...safeObject(store.counters),
          ...safeObject(parsed.counters)
        }
      };
    } catch (_error) {
      return defaultStore();
    }
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
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (_error) {
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
    if (wallet.history.length > MAX_WALLET_HISTORY) {
      wallet.history = wallet.history.slice(-MAX_WALLET_HISTORY);
    }
    return entry;
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
    if (store.rideHistory[userKey].length > MAX_RIDES_PER_USER) {
      store.rideHistory[userKey] = store.rideHistory[userKey].slice(-MAX_RIDES_PER_USER);
    }
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

  function pushWithCap(list, item, maxLimit) {
    list.push(item);
    if (list.length > maxLimit) {
      list.splice(0, list.length - maxLimit);
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
    pushWithCap(store.authLogs, item, MAX_AUTH_LOGS);
    return item;
  }

  function buildFeatureStateKey(userKey, featureId) {
    return `${normalizeString(userKey, 80) || 'guest-user'}::${normalizeString(featureId, 80)}`;
  }


  // Route: /wallet/topup
  router.post('/wallet/topup', (req, res) => {
    const store = getStore();
    const userKey = normalizeString(req.body?.userKey, 80);
    const amount = normalizeAmount(req.body?.amount);
    const method = normalizeString(req.body?.method, 80) || 'manual';
    const note = normalizeString(req.body?.note, 250);

    if (!userKey || amount <= 0) {
      return res.status(400).json({ ok: false, message: 'userKey and positive amount are required' });
    }

    const wallet = walletForUser(store, userKey);
    wallet.balance = normalizeAmount(wallet.balance + amount);
    const entry = addWalletEntry(wallet, 'credit', amount, { method, note });
    queuePersist();

    return res.status(200).json({
      ok: true,
      wallet: clone(wallet),
      entry
    });
  });


  // Route: /wallet/spend
  router.post('/wallet/spend', (req, res) => {
    const store = getStore();
    const userKey = normalizeString(req.body?.userKey, 80);
    const amount = normalizeAmount(req.body?.amount);
    const reason = normalizeString(req.body?.reason, 250) || 'ride-payment';

    if (!userKey || amount <= 0) {
      return res.status(400).json({ ok: false, message: 'userKey and positive amount are required' });
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
    const entry = addWalletEntry(wallet, 'debit', amount, { reason });
    queuePersist();

    return res.status(200).json({
      ok: true,
      wallet: clone(wallet),
      entry
    });
  });


  // Route: /wallet/:userKey
  router.get('/wallet/:userKey', (req, res) => {
    const store = getStore();
    const userKey = normalizeString(req.params.userKey, 80);
    if (!userKey) return res.status(400).json({ ok: false, message: 'Invalid userKey' });
    const wallet = walletForUser(store, userKey);
    return res.status(200).json({ ok: true, wallet: clone(wallet) });
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
    if (store.commissions.length > MAX_COMMISSIONS) {
      store.commissions = store.commissions.slice(-MAX_COMMISSIONS);
    }
    queuePersist();
    return res.status(201).json({ ok: true, item });
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



