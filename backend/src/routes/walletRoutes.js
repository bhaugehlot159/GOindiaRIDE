const express = require('express');
const WalletAccount = require('../models/WalletAccount');
const WalletPaymentMode = require('../models/WalletPaymentMode');
const WalletTopupOrder = require('../models/WalletTopupOrder');
const WalletTransaction = require('../models/WalletTransaction');
const WalletWithdrawalRequest = require('../models/WalletWithdrawalRequest');
const { authenticate } = require('../middleware/authMiddleware');
const { getClientIp } = require('../utils/device');
const { logSecurityEvent } = require('../services/securityLogService');

const router = express.Router();

const WALLET_TYPES = new Set(['customer', 'driver', 'admin', 'donation']);
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

  await Promise.all(DEFAULT_PAYMENT_MODES.map((mode) => WalletPaymentMode.updateOne(
    { modeId: mode.modeId },
    {
      $setOnInsert: mode,
      $set: {
        label: mode.label,
        region: mode.region,
        displayOrder: mode.displayOrder
      },
      $addToSet: { flows: { $each: mode.flows } }
    },
    { upsert: true }
  )));

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

  const txRows = await WalletTransaction
    .find({ walletType: primaryWallet.walletType, ownerId: primaryWallet.ownerId })
    .sort({ createdAt: -1 })
    .limit(30)
    .lean();

  const withdrawalRows = actorType === 'admin'
    ? []
    : await WalletWithdrawalRequest
      .find({ walletType: actorType, ownerId })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

  return res.status(200).json({
    mode: 'secure_backend',
    wallet: primaryWallet,
    donationWallet,
    paymentModes: modes,
    transactions: txRows,
    withdrawals: withdrawalRows
  });
}));

router.get('/transactions', wrapAsync(async (req, res) => {
  const walletType = ensureWalletType(req.query.walletType || resolveActorWalletType(req.user));
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
  const walletType = ensureWalletType(req.query.walletType || actorType);

  if (!['customer', 'driver', 'donation'].includes(walletType)) {
    return res.status(400).json({ message: 'Withdrawals are supported for customer, driver, donation wallets' });
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
router.post('/withdrawals', wrapAsync(async (req, res) => {
  const actorType = resolveActorWalletType(req.user);
  if (!['customer', 'driver'].includes(actorType)) {
    return res.status(403).json({ message: 'Withdrawal not allowed for this account' });
  }

  const ownerId = String(req.user.id);
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

  const wallet = await ensureWallet(actorType, ownerId);
  if (Number(wallet.balance || 0) < amount) {
    return res.status(400).json({ message: 'Insufficient wallet balance' });
  }

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const dailyAggregate = await WalletWithdrawalRequest.aggregate([
    {
      $match: {
        walletType: actorType,
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
    walletType: actorType,
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
    walletType: actorType,
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
    metadata: { destination }
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
        : ['add_money', 'ride_payment'],
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
  const ownerId = normalizeOwnerId(walletType, req.body.ownerId || (walletType === 'admin' ? 'platform' : ''));
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

module.exports = router;




