/* ======================================
   CENTRAL WALLET CORE
   Wallet types: customer, driver, admin, donation
   Admin has full control over add/withdraw/payment modes.
   ====================================== */

(function initWalletCore() {
    const WALLET_STORAGE_KEY = 'goindiaride_wallet_store_v1';
    const PAYMENT_MODE_KEY = 'goindiaride_payment_modes_v1';
    const WITHDRAWAL_REQUEST_KEY = 'goindiaride_wallet_withdrawals_v1';
    const WALLET_SECURITY_LOG_KEY = 'goindiaride_wallet_security_logs_v1';
    const TX_LIMIT = 300;

    const WITHDRAWAL_LIMITS = {
        min: 100,
        max: 100000,
        dailyMax: 200000
    };

    const DEFAULT_PAYMENT_MODES = [
        // India
        { id: 'upi', label: 'UPI', enabled: true, region: 'india', flows: ['add_money', 'ride_payment', 'refund'] },
        { id: 'upi_intent', label: 'UPI Intent', enabled: true, region: 'india', flows: ['add_money', 'ride_payment', 'refund'] },
        { id: 'upi_qr', label: 'UPI QR Scan', enabled: true, region: 'india', flows: ['add_money'] },
        { id: 'bharat_qr', label: 'Bharat QR', enabled: true, region: 'india', flows: ['add_money'] },
        { id: 'rupay_card', label: 'RuPay Card', enabled: true, region: 'india', flows: ['add_money', 'ride_payment', 'refund'] },
        { id: 'visa_master_amex', label: 'Visa / MasterCard / Amex', enabled: true, region: 'global', flows: ['add_money', 'ride_payment', 'refund'] },
        { id: 'debit_card', label: 'Debit Card', enabled: true, region: 'india', flows: ['add_money', 'ride_payment', 'refund'] },
        { id: 'credit_card', label: 'Credit Card', enabled: true, region: 'india', flows: ['add_money', 'ride_payment', 'refund'] },
        { id: 'netbanking', label: 'Net Banking', enabled: true, region: 'india', flows: ['add_money', 'withdrawal'] },
        { id: 'net_banking', label: 'Net Banking', enabled: true, region: 'india', flows: ['add_money', 'withdrawal'] },
        { id: 'imps', label: 'IMPS', enabled: true, region: 'india', flows: ['withdrawal'] },
        { id: 'neft_rtgs', label: 'NEFT/RTGS', enabled: true, region: 'india', flows: ['withdrawal'] },
        { id: 'razorpay', label: 'Razorpay Gateway', enabled: true, region: 'india', flows: ['add_money', 'ride_payment', 'refund'] },
        { id: 'cashfree', label: 'Cashfree Gateway', enabled: true, region: 'india', flows: ['add_money', 'ride_payment', 'refund'] },
        { id: 'paytm_wallet', label: 'Paytm Wallet', enabled: true, region: 'india', flows: ['add_money', 'ride_payment'] },
        { id: 'phonepe_wallet', label: 'PhonePe Wallet', enabled: true, region: 'india', flows: ['add_money', 'ride_payment'] },
        { id: 'googlepay_wallet', label: 'Google Pay Wallet', enabled: true, region: 'india', flows: ['add_money', 'ride_payment'] },

        // International
        { id: 'stripe_cards', label: 'Stripe (Cards)', enabled: true, region: 'international', flows: ['add_money', 'ride_payment', 'refund'] },
        { id: 'paypal', label: 'PayPal Checkout', enabled: true, region: 'international', flows: ['add_money', 'withdrawal', 'refund'] },
        { id: 'wise', label: 'Wise Transfer', enabled: true, region: 'international', flows: ['withdrawal'] },
        { id: 'swift_wire', label: 'SWIFT Wire', enabled: true, region: 'international', flows: ['withdrawal'] },
        { id: 'sepa', label: 'SEPA Transfer', enabled: true, region: 'international', flows: ['withdrawal'] },
        { id: 'apple_pay', label: 'Apple Pay', enabled: true, region: 'international', flows: ['add_money', 'ride_payment'] },
        { id: 'google_pay_intl', label: 'Google Pay (International)', enabled: true, region: 'international', flows: ['add_money', 'ride_payment'] },
        { id: 'alipay', label: 'Alipay', enabled: true, region: 'international', flows: ['add_money', 'ride_payment'] },
        { id: 'wechat_pay', label: 'WeChat Pay', enabled: true, region: 'international', flows: ['add_money', 'ride_payment'] },
        { id: 'international_qr', label: 'International QR', enabled: true, region: 'international', flows: ['add_money'] }
    ];

    const allowedTypes = ['customer', 'driver', 'admin', 'donation'];
    const API_BASE_OVERRIDE_KEY = 'goindiaride_api_base';
    const RAZORPAY_CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
    const PAYPAL_CHECKOUT_SRC = 'https://www.paypal.com/sdk/js';
    let secureCsrfCache = { token: null, fetchedAt: 0 };
    let secureGatewayStatusCache = { payload: null, fetchedAt: 0 };
    let razorpayCheckoutPromise = null;
    let paypalCheckoutPromise = null;
    let paypalCheckoutKey = '';
    let secureRequestCounter = 0;

    function nowIso() {
        return new Date().toISOString();
    }

    function parseJsonSafely(raw, fallback) {
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : fallback;
        } catch (error) {
            return fallback;
        }
    }

    function sanitizeText(value, maxLen = 180) {
        return String(value || '')
            .replace(/[<>]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, maxLen);
    }

    function getActiveRole() {
        return String(localStorage.getItem('userRole') || '').toLowerCase();
    }

    function getActiveProfile() {
        const role = getActiveRole();

        if (role === 'driver') {
            return parseJsonSafely(localStorage.getItem('currentDriver') || '{}', {});
        }

        if (role === 'admin') {
            return parseJsonSafely(localStorage.getItem('currentAdmin') || '{}', {});
        }

        return parseJsonSafely(localStorage.getItem('currentUser') || '{}', {});
    }

    function ensureStore() {
        let store = parseJsonSafely(localStorage.getItem(WALLET_STORAGE_KEY) || '{}', {});

        if (!store.wallets || typeof store.wallets !== 'object') {
            store.wallets = {};
        }

        if (!Array.isArray(store.transactions)) {
            store.transactions = [];
        }

        localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(store));
        return store;
    }

    function saveStore(store) {
        localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(store));
    }

    function ensureWithdrawalStore() {
        const rows = parseJsonSafely(localStorage.getItem(WITHDRAWAL_REQUEST_KEY) || '[]', []);
        const validRows = Array.isArray(rows) ? rows : [];
        localStorage.setItem(WITHDRAWAL_REQUEST_KEY, JSON.stringify(validRows));
        return validRows;
    }

    function saveWithdrawalStore(rows) {
        const safeRows = Array.isArray(rows) ? rows : [];
        localStorage.setItem(WITHDRAWAL_REQUEST_KEY, JSON.stringify(safeRows));
    }

    function walletId(type, ownerId) {
        return `${type}:${ownerId}`;
    }

    function validateType(type) {
        if (!allowedTypes.includes(type)) {
            throw new Error(`Unsupported wallet type: ${type}`);
        }
    }

    function normalizeOwnerId(type, ownerId) {
        if (type === 'admin') return ownerId || 'platform';
        if (type === 'donation') return ownerId || 'pool';
        return ownerId || 'unknown';
    }

    function resolveOwnerForRole(role, explicitOwnerId) {
        if (explicitOwnerId) return explicitOwnerId;

        const profile = getActiveProfile();
        if (role === 'driver') return profile.id || profile.driverId || 'driver_default';
        if (role === 'customer') return profile.id || profile.userId || 'customer_default';
        if (role === 'admin') return profile.id || 'platform';

        return 'unknown';
    }

    function ensureWallet(type, ownerId) {
        validateType(type);
        const normalizedOwner = normalizeOwnerId(type, ownerId);
        const store = ensureStore();
        const id = walletId(type, normalizedOwner);

        if (!store.wallets[id]) {
            store.wallets[id] = {
                id,
                type,
                ownerId: normalizedOwner,
                balance: 0,
                currency: 'INR',
                updatedAt: nowIso(),
                createdAt: nowIso()
            };
            saveStore(store);
        }

        return store.wallets[id];
    }

    function listWallets() {
        const store = ensureStore();
        return Object.values(store.wallets).sort((a, b) => a.type.localeCompare(b.type));
    }

    function canMutateWallet(actorRole, type, ownerId, action = 'credit') {
        if (actorRole === 'admin') return true;

        if (type === 'admin') {
            return false;
        }

        if (type === 'donation') {
            return action === 'credit';
        }

        const expectedOwner = resolveOwnerForRole(actorRole, ownerId);
        return String(expectedOwner) === String(ownerId);
    }

    function writeTransaction(store, payload) {
        store.transactions.unshift({
            id: `TXN_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
            createdAt: nowIso(),
            ...payload
        });

        if (store.transactions.length > TX_LIMIT) {
            store.transactions = store.transactions.slice(0, TX_LIMIT);
        }
    }

    function ensureSecurityLog() {
        const rows = parseJsonSafely(localStorage.getItem(WALLET_SECURITY_LOG_KEY) || '[]', []);
        return Array.isArray(rows) ? rows : [];
    }

    function recordSecurityEvent(event) {
        const rows = ensureSecurityLog();
        rows.unshift({
            id: `WSEC_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
            createdAt: nowIso(),
            severity: 'info',
            ...event
        });
        localStorage.setItem(WALLET_SECURITY_LOG_KEY, JSON.stringify(rows.slice(0, 500)));
    }

    function mutateBalance({ type, ownerId, amount, action, description, actorRole, actorId, paymentMode }) {
        validateType(type);

        const normalizedOwner = normalizeOwnerId(type, ownerId);
        const normalizedRole = String(actorRole || getActiveRole() || '').toLowerCase();

        if (!canMutateWallet(normalizedRole, type, normalizedOwner, action)) {
            recordSecurityEvent({
                severity: 'warning',
                source: 'wallet_core',
                eventType: 'permission_denied',
                details: `Role ${normalizedRole || 'unknown'} tried ${action} on ${type}:${normalizedOwner}`
            });
            throw new Error('You do not have permission to manage this wallet.');
        }

        const numericAmount = Number(amount);
        if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
            throw new Error('Invalid amount.');
        }

        const store = ensureStore();
        const id = walletId(type, normalizedOwner);

        if (!store.wallets[id]) {
            store.wallets[id] = {
                id,
                type,
                ownerId: normalizedOwner,
                balance: 0,
                currency: 'INR',
                updatedAt: nowIso(),
                createdAt: nowIso()
            };
        }

        const wallet = store.wallets[id];

        if (action === 'debit' && wallet.balance < numericAmount) {
            recordSecurityEvent({
                severity: 'warning',
                source: 'wallet_core',
                eventType: 'insufficient_balance',
                details: `Debit rejected for ${id}. requested=${numericAmount}, balance=${wallet.balance}`
            });
            throw new Error('Insufficient balance.');
        }

        wallet.balance = action === 'credit'
            ? wallet.balance + numericAmount
            : wallet.balance - numericAmount;
        wallet.updatedAt = nowIso();

        writeTransaction(store, {
            walletId: id,
            walletType: type,
            ownerId: normalizedOwner,
            action,
            amount: numericAmount,
            description: sanitizeText(description || `${action} ${numericAmount}`),
            actorRole: normalizedRole || 'unknown',
            actorId: actorId || resolveOwnerForRole(normalizedRole, null),
            paymentMode: paymentMode || null
        });

        saveStore(store);
        return wallet;
    }

    function transfer({ fromType, fromOwnerId, toType, toOwnerId, amount, description, actorRole, actorId }) {
        const normalizedRole = String(actorRole || getActiveRole() || '').toLowerCase();
        const fromOwner = normalizeOwnerId(fromType, fromOwnerId);
        const toOwner = normalizeOwnerId(toType, toOwnerId);

        if (!canMutateWallet(normalizedRole, fromType, fromOwner, 'debit') || !canMutateWallet(normalizedRole, toType, toOwner, 'credit')) {
            recordSecurityEvent({
                severity: 'warning',
                source: 'wallet_core',
                eventType: 'transfer_permission_denied',
                details: `Role ${normalizedRole || 'unknown'} transfer denied ${fromType}:${fromOwner} -> ${toType}:${toOwner}`
            });
            throw new Error('You do not have permission to transfer between these wallets.');
        }

        const numericAmount = Number(amount);
        if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
            throw new Error('Invalid transfer amount.');
        }

        const store = ensureStore();
        const fromId = walletId(fromType, fromOwner);
        const toId = walletId(toType, toOwner);

        if (!store.wallets[fromId]) {
            store.wallets[fromId] = {
                id: fromId,
                type: fromType,
                ownerId: fromOwner,
                balance: 0,
                currency: 'INR',
                updatedAt: nowIso(),
                createdAt: nowIso()
            };
        }

        if (!store.wallets[toId]) {
            store.wallets[toId] = {
                id: toId,
                type: toType,
                ownerId: toOwner,
                balance: 0,
                currency: 'INR',
                updatedAt: nowIso(),
                createdAt: nowIso()
            };
        }

        if (store.wallets[fromId].balance < numericAmount) {
            throw new Error('Insufficient balance.');
        }

        store.wallets[fromId].balance -= numericAmount;
        store.wallets[fromId].updatedAt = nowIso();

        store.wallets[toId].balance += numericAmount;
        store.wallets[toId].updatedAt = nowIso();

        writeTransaction(store, {
            walletId: fromId,
            walletType: fromType,
            ownerId: fromOwner,
            action: 'transfer_out',
            amount: numericAmount,
            description: sanitizeText(description || `Transfer to ${toId}`),
            actorRole: normalizedRole || 'unknown',
            actorId: actorId || resolveOwnerForRole(normalizedRole, null),
            linkedWalletId: toId
        });

        writeTransaction(store, {
            walletId: toId,
            walletType: toType,
            ownerId: toOwner,
            action: 'transfer_in',
            amount: numericAmount,
            description: sanitizeText(description || `Transfer from ${fromId}`),
            actorRole: normalizedRole || 'unknown',
            actorId: actorId || resolveOwnerForRole(normalizedRole, null),
            linkedWalletId: fromId
        });

        saveStore(store);
        return {
            from: store.wallets[fromId],
            to: store.wallets[toId]
        };
    }

    function getTransactions(filters = {}) {
        const store = ensureStore();
        let rows = store.transactions;

        if (filters.walletId) {
            rows = rows.filter((item) => item.walletId === filters.walletId);
        }

        if (filters.walletType) {
            rows = rows.filter((item) => item.walletType === filters.walletType);
        }

        if (filters.ownerId) {
            rows = rows.filter((item) => String(item.ownerId) === String(filters.ownerId));
        }

        if (filters.action) {
            rows = rows.filter((item) => String(item.action) === String(filters.action));
        }

        return rows;
    }

    function normalizePaymentMode(mode) {
        const source = mode && typeof mode === 'object' ? mode : {};
        const normalized = {
            id: sanitizeText(source.id || '', 40).toLowerCase(),
            label: sanitizeText(source.label || source.id || 'Payment Mode', 80),
            enabled: source.enabled !== false,
            region: sanitizeText(source.region || 'global', 20).toLowerCase(),
            flows: Array.isArray(source.flows) && source.flows.length > 0
                ? source.flows.map((flow) => sanitizeText(flow, 40).toLowerCase()).filter(Boolean)
                : ['add_money', 'ride_payment', 'withdrawal', 'refund']
        };

        if (!normalized.id) {
            normalized.id = `mode_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        }

        return normalized;
    }

    function getPaymentModes() {
        const stored = parseJsonSafely(localStorage.getItem(PAYMENT_MODE_KEY) || '[]', []);
        if (Array.isArray(stored) && stored.length > 0) {
            const normalized = stored.map(normalizePaymentMode);
            localStorage.setItem(PAYMENT_MODE_KEY, JSON.stringify(normalized));
            return normalized;
        }

        const defaults = DEFAULT_PAYMENT_MODES.map(normalizePaymentMode);
        localStorage.setItem(PAYMENT_MODE_KEY, JSON.stringify(defaults));
        return defaults;
    }

    function getEnabledPaymentModes(filters = {}) {
        const flow = sanitizeText(filters.flow || '', 40).toLowerCase();
        const region = sanitizeText(filters.region || '', 20).toLowerCase();

        const modes = getPaymentModes().filter((mode) => {
            if (!mode.enabled) return false;
            if (flow && !(mode.flows || []).includes(flow)) return false;
            if (region && mode.region !== region && mode.region !== 'global') return false;
            return true;
        });

        return modes;
    }

    function setPaymentModes(modes, actorRole) {
        const role = String(actorRole || getActiveRole() || '').toLowerCase();
        if (role !== 'admin') {
            throw new Error('Only admin can change payment modes.');
        }

        if (!Array.isArray(modes) || modes.length === 0) {
            throw new Error('Payment mode list is empty.');
        }

        const normalized = modes.map(normalizePaymentMode);
        localStorage.setItem(PAYMENT_MODE_KEY, JSON.stringify(normalized));
        return normalized;
    }

    function getWithdrawalRequests(filters = {}) {
        let rows = ensureWithdrawalStore();

        if (filters.walletType) {
            rows = rows.filter((row) => String(row.walletType) === String(filters.walletType));
        }

        if (filters.ownerId) {
            rows = rows.filter((row) => String(row.ownerId) === String(filters.ownerId));
        }

        if (filters.status) {
            rows = rows.filter((row) => String(row.status) === String(filters.status));
        }

        return rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    function getTodayTotalWithdrawRequestAmount(walletType, ownerId) {
        const today = new Date();
        const y = today.getUTCFullYear();
        const m = today.getUTCMonth();
        const d = today.getUTCDate();

        const rows = getWithdrawalRequests({
            walletType,
            ownerId
        }).filter((row) => {
            const createdAt = new Date(row.createdAt);
            return createdAt.getUTCFullYear() === y && createdAt.getUTCMonth() === m && createdAt.getUTCDate() === d;
        });

        return rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    }

    function createWithdrawalRequest({
        walletType,
        ownerId,
        amount,
        method,
        destination,
        notes,
        actorRole,
        actorId,
        metadata
    }) {
        const type = walletType || 'customer';
        validateType(type);
        if (type === 'admin' || type === 'donation') {
            throw new Error('Withdrawal request is allowed only for customer/driver wallet.');
        }

        const normalizedOwner = normalizeOwnerId(type, ownerId);
        const normalizedRole = String(actorRole || getActiveRole() || '').toLowerCase();

        if (!canMutateWallet(normalizedRole, type, normalizedOwner, 'debit')) {
            recordSecurityEvent({
                severity: 'warning',
                source: 'wallet_core',
                eventType: 'withdraw_request_denied',
                details: `Role ${normalizedRole || 'unknown'} cannot request withdrawal for ${type}:${normalizedOwner}`
            });
            throw new Error('You do not have permission to request withdrawal for this wallet.');
        }

        const numericAmount = Number(amount);
        if (!Number.isFinite(numericAmount) || numericAmount < WITHDRAWAL_LIMITS.min || numericAmount > WITHDRAWAL_LIMITS.max) {
            throw new Error(`Withdrawal amount must be between ${WITHDRAWAL_LIMITS.min} and ${WITHDRAWAL_LIMITS.max}.`);
        }

        const wallet = ensureWallet(type, normalizedOwner);
        if (wallet.balance < numericAmount) {
            throw new Error('Insufficient balance.');
        }

        const todayRequested = getTodayTotalWithdrawRequestAmount(type, normalizedOwner);
        if (todayRequested + numericAmount > WITHDRAWAL_LIMITS.dailyMax) {
            throw new Error(`Daily withdrawal request limit exceeded (${WITHDRAWAL_LIMITS.dailyMax}).`);
        }

        const methodId = sanitizeText(method || '', 40).toLowerCase();
        const allowedMethods = getEnabledPaymentModes({ flow: 'withdrawal' });
        const methodInfo = allowedMethods.find((mode) => mode.id === methodId);
        if (!methodInfo) {
            throw new Error('Selected withdrawal method is not enabled by admin.');
        }

        const request = {
            id: `WDR_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
            walletType: type,
            ownerId: normalizedOwner,
            amount: numericAmount,
            method: methodInfo.id,
            methodLabel: methodInfo.label,
            destination: sanitizeText(destination, 160),
            notes: sanitizeText(notes, 240),
            status: 'pending_admin_approval',
            createdAt: nowIso(),
            updatedAt: nowIso(),
            actorRole: normalizedRole || 'unknown',
            actorId: actorId || resolveOwnerForRole(normalizedRole, null),
            metadata: metadata || {}
        };

        const rows = ensureWithdrawalStore();
        rows.unshift(request);
        saveWithdrawalStore(rows);

        const store = ensureStore();
        writeTransaction(store, {
            walletId: walletId(type, normalizedOwner),
            walletType: type,
            ownerId: normalizedOwner,
            action: 'withdraw_request',
            amount: numericAmount,
            description: `Withdrawal requested via ${methodInfo.label}`,
            actorRole: normalizedRole || 'unknown',
            actorId: actorId || resolveOwnerForRole(normalizedRole, null),
            paymentMode: methodInfo.id,
            requestId: request.id
        });
        saveStore(store);

        if (numericAmount >= 50000) {
            recordSecurityEvent({
                severity: 'warning',
                source: 'wallet_core',
                eventType: 'high_value_withdrawal_request',
                details: `${type}:${normalizedOwner} requested ${numericAmount} via ${methodInfo.id}`
            });
        }

        return request;
    }

    function reviewWithdrawalRequest({ requestId, decision, remarks, actorRole, actorId }) {
        const role = String(actorRole || getActiveRole() || '').toLowerCase();
        if (role !== 'admin') {
            throw new Error('Only admin can review withdrawal requests.');
        }

        const normalizedDecision = String(decision || '').toLowerCase();
        if (normalizedDecision !== 'approved' && normalizedDecision !== 'rejected') {
            throw new Error('Decision must be approved or rejected.');
        }

        const rows = ensureWithdrawalStore();
        const idx = rows.findIndex((row) => row.id === requestId);
        if (idx < 0) {
            throw new Error('Withdrawal request not found.');
        }

        const request = rows[idx];
        if (request.status !== 'pending_admin_approval') {
            throw new Error('Withdrawal request already reviewed.');
        }

        const store = ensureStore();
        const sourceType = request.walletType;
        const sourceOwner = normalizeOwnerId(sourceType, request.ownerId);
        const sourceWalletId = walletId(sourceType, sourceOwner);
        const adminWalletId = walletId('admin', 'platform');

        if (!store.wallets[sourceWalletId]) {
            store.wallets[sourceWalletId] = ensureWallet(sourceType, sourceOwner);
        }
        if (!store.wallets[adminWalletId]) {
            store.wallets[adminWalletId] = ensureWallet('admin', 'platform');
        }

        if (normalizedDecision === 'approved') {
            if (store.wallets[sourceWalletId].balance < Number(request.amount)) {
                throw new Error('Customer/driver wallet has insufficient balance for withdrawal.');
            }

            if (store.wallets[adminWalletId].balance < Number(request.amount)) {
                throw new Error('Admin settlement wallet has insufficient balance. Add funds first.');
            }

            store.wallets[sourceWalletId].balance -= Number(request.amount);
            store.wallets[sourceWalletId].updatedAt = nowIso();

            store.wallets[adminWalletId].balance -= Number(request.amount);
            store.wallets[adminWalletId].updatedAt = nowIso();

            writeTransaction(store, {
                walletId: sourceWalletId,
                walletType: sourceType,
                ownerId: sourceOwner,
                action: 'withdrawal_approved',
                amount: Number(request.amount),
                description: `Withdrawal approved by admin (${request.methodLabel})`,
                actorRole: 'admin',
                actorId: actorId || resolveOwnerForRole('admin', null),
                paymentMode: request.method,
                requestId: request.id
            });

            writeTransaction(store, {
                walletId: adminWalletId,
                walletType: 'admin',
                ownerId: 'platform',
                action: 'payout_processed',
                amount: Number(request.amount),
                description: `Payout sent for ${sourceType}:${sourceOwner}`,
                actorRole: 'admin',
                actorId: actorId || resolveOwnerForRole('admin', null),
                paymentMode: request.method,
                requestId: request.id
            });
        } else {
            writeTransaction(store, {
                walletId: sourceWalletId,
                walletType: sourceType,
                ownerId: sourceOwner,
                action: 'withdrawal_rejected',
                amount: Number(request.amount),
                description: 'Withdrawal rejected by admin',
                actorRole: 'admin',
                actorId: actorId || resolveOwnerForRole('admin', null),
                paymentMode: request.method,
                requestId: request.id
            });
        }

        request.status = normalizedDecision;
        request.reviewedAt = nowIso();
        request.updatedAt = nowIso();
        request.reviewedBy = actorId || resolveOwnerForRole('admin', null);
        request.remarks = sanitizeText(remarks || '', 240);

        rows[idx] = request;
        saveWithdrawalStore(rows);
        saveStore(store);
        return request;
    }

    function settlePaymentToAdmin({
        amount,
        sourceType,
        sourceOwnerId,
        paymentMode,
        description,
        actorId
    }) {
        const numericAmount = Number(amount);
        if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
            throw new Error('Invalid amount for admin settlement.');
        }

        const adminWallet = mutateBalance({
            type: 'admin',
            ownerId: 'platform',
            amount: numericAmount,
            action: 'credit',
            description: description || 'Auto payment settlement to admin wallet',
            actorRole: 'admin',
            actorId: actorId || 'system_settlement',
            paymentMode
        });

        const normalizedSourceType = allowedTypes.includes(sourceType) ? sourceType : 'customer';
        const normalizedSourceOwner = normalizeOwnerId(normalizedSourceType, sourceOwnerId);

        const store = ensureStore();
        writeTransaction(store, {
            walletId: walletId(normalizedSourceType, normalizedSourceOwner),
            walletType: normalizedSourceType,
            ownerId: normalizedSourceOwner,
            action: 'settled_to_admin',
            amount: numericAmount,
            description: sanitizeText(description || 'Payment captured and settled to admin wallet'),
            actorRole: 'system',
            actorId: actorId || 'system_settlement',
            paymentMode: paymentMode || null,
            linkedWalletId: walletId('admin', 'platform')
        });
        saveStore(store);

        return adminWallet;
    }

    function getWallet(type, ownerId) {
        return ensureWallet(type, normalizeOwnerId(type, ownerId));
    }

    function getAccessToken() {
        return (
            localStorage.getItem('accessToken') ||
            localStorage.getItem('authToken') ||
            localStorage.getItem('token') ||
            ''
        ).trim();
    }

    function getApiBaseUrl() {
        const runtimeBase = sanitizeText(window.__GOINDIARIDE_RUNTIME_API_ORIGIN__ || window.__GOINDIARIDE_API_ORIGIN__ || '', 300);
        const explicit = runtimeBase || sanitizeText(window.GOINDIARIDE_API_BASE || '', 300) || sanitizeText(localStorage.getItem(API_BASE_OVERRIDE_KEY) || '', 300);
        if (window.GoIndiaSessionContinuity && typeof window.GoIndiaSessionContinuity.getApiBases === 'function') {
            const candidates = window.GoIndiaSessionContinuity.getApiBases(explicit);
            if (Array.isArray(candidates) && candidates.length) {
                return String(candidates[0] || '').replace(/\/$/, '');
            }
        }
        if (explicit) {
            return explicit.replace(/\/$/, '');
        }

        const host = String(window.location.hostname || '').toLowerCase();
        if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') {
            return 'http://localhost:5000';
        }
        if (
            host === 'goindiaride.in' ||
            host === 'www.goindiaride.in' ||
            host.endsWith('.goindiaride.in') ||
            host === 'github.io' ||
            host.endsWith('.github.io')
        ) {
            return 'https://goindiaride.onrender.com';
        }

        return String(window.location.origin || '').replace(/\/$/, '');
    }

    function isSecureBackendReady() {
        return Boolean(getAccessToken()) && Boolean(getApiBaseUrl());
    }

    function isMutatingMethod(method) {
        return !['GET', 'HEAD', 'OPTIONS'].includes(String(method || '').toUpperCase());
    }

    function randomTokenPart() {
        const cryptoApi = window.crypto || window.msCrypto;
        if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
            const values = new Uint32Array(2);
            cryptoApi.getRandomValues(values);
            return Array.from(values).map((value) => value.toString(36)).join('');
        }
        return Math.random().toString(36).slice(2, 14);
    }

    function createIdempotencyKey(prefix = 'gir-wallet') {
        const safePrefix = sanitizeText(prefix, 32).replace(/[^A-Za-z0-9:_-]/g, '-') || 'gir-wallet';
        return `${safePrefix}:${Date.now()}:${randomTokenPart()}`.slice(0, 120);
    }

    function createFreshRequestId(prefix = 'gir-wallet-request') {
        const safePrefix = sanitizeText(prefix, 48).replace(/[^A-Za-z0-9:_-]/g, '-') || 'gir-wallet-request';
        secureRequestCounter = (secureRequestCounter + 1) % 1000000;
        return `${safePrefix}:${Date.now()}:${secureRequestCounter}:${randomTokenPart()}`.slice(0, 160);
    }

    function applyRequestFreshnessHeaders(headers, { forceNew = false } = {}) {
        const requestIdPresent = Boolean(headers['x-request-id'] || headers['X-Request-Id']);
        const timestampPresent = Boolean(headers['x-timestamp'] || headers['X-Timestamp']);

        if (forceNew || !requestIdPresent) {
            headers['x-request-id'] = createFreshRequestId('gir-wallet-live');
        }

        if (forceNew || !timestampPresent) {
            headers['x-timestamp'] = String(Date.now());
        }
    }

    function loadRazorpayCheckout() {
        if (window.Razorpay) {
            return Promise.resolve(window.Razorpay);
        }
        if (razorpayCheckoutPromise) {
            return razorpayCheckoutPromise;
        }

        razorpayCheckoutPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = RAZORPAY_CHECKOUT_SRC;
            script.async = true;
            script.onload = () => {
                if (window.Razorpay) {
                    resolve(window.Razorpay);
                    return;
                }
                reject(new Error('Razorpay Checkout could not be loaded'));
            };
            script.onerror = () => reject(new Error('Unable to load Razorpay Checkout'));
            document.head.appendChild(script);
        });

        return razorpayCheckoutPromise;
    }

    function loadPayPalCheckout(checkout = {}) {
        const clientId = sanitizeText(checkout.clientId || '', 300);
        const currency = sanitizeText(checkout.currency || 'USD', 6).toUpperCase() || 'USD';
        const key = `${clientId}:${currency}`;

        if (!clientId) {
            return Promise.reject(new Error('PayPal client id missing from backend checkout response'));
        }
        if (window.paypal && paypalCheckoutKey === key) {
            return Promise.resolve(window.paypal);
        }
        if (paypalCheckoutPromise && paypalCheckoutKey === key) {
            return paypalCheckoutPromise;
        }

        paypalCheckoutKey = key;
        paypalCheckoutPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            const params = new URLSearchParams({
                'client-id': clientId,
                currency,
                intent: 'capture',
                components: 'buttons'
            });
            script.src = `${PAYPAL_CHECKOUT_SRC}?${params.toString()}`;
            script.async = true;
            script.onload = () => {
                if (window.paypal) {
                    resolve(window.paypal);
                    return;
                }
                reject(new Error('PayPal Checkout could not be loaded'));
            };
            script.onerror = () => reject(new Error('Unable to load PayPal Checkout'));
            document.head.appendChild(script);
        });

        return paypalCheckoutPromise;
    }

    function getCheckoutPrefill() {
        const profile = getActiveProfile();
        return {
            name: sanitizeText(profile.name || profile.fullName || profile.displayName || '', 120),
            email: sanitizeText(profile.email || '', 160),
            contact: sanitizeText(profile.phone || profile.mobile || profile.phoneNumber || '', 30)
        };
    }

    async function fetchCsrfToken(forceRefresh = false) {
        if (!forceRefresh && secureCsrfCache.token && Date.now() - secureCsrfCache.fetchedAt < 10 * 60 * 1000) {
            return secureCsrfCache.token;
        }

        const response = await fetch(`${getApiBaseUrl()}/api/security/csrf-token`, {
            method: 'GET',
            credentials: 'include',
            headers: {
                Accept: 'application/json'
            }
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.csrfToken) {
            throw new Error(payload.message || 'Unable to fetch CSRF token');
        }

        secureCsrfCache = {
            token: payload.csrfToken,
            fetchedAt: Date.now()
        };

        return secureCsrfCache.token;
    }

    async function secureWalletRequest(path, options = {}) {
        const token = getAccessToken();
        if (!token) {
            throw new Error('Secure wallet session not found. Please login again.');
        }

        const method = String(options.method || 'GET').toUpperCase();
        const body = options.body || null;
        const withCsrf = Boolean(options.withCsrf || (method !== 'GET' && method !== 'HEAD'));

        const headers = {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
            ...(options.headers || {})
        };

        if (body) {
            headers['Content-Type'] = 'application/json';
        }

        if (withCsrf) {
            headers['x-csrf-token'] = await fetchCsrfToken(false);
        }

        if (isMutatingMethod(method) && !headers['X-Idempotency-Key'] && !headers['x-idempotency-key']) {
            headers['X-Idempotency-Key'] = options.idempotencyKey || createIdempotencyKey('gir-wallet-live');
        }

        const doRequest = async () => {
            if (isMutatingMethod(method)) {
                applyRequestFreshnessHeaders(headers, { forceNew: true });
            }

            const response = await fetch(`${getApiBaseUrl()}${path}`, {
                method,
                credentials: 'include',
                headers,
                body: body ? JSON.stringify(body) : undefined
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                const error = new Error(payload.message || `Secure wallet request failed (${response.status})`);
                error.status = response.status;
                error.details = payload;
                throw error;
            }

            return payload;
        };

        try {
            return await doRequest();
        } catch (error) {
            const csrfLikely = Number(error.status) === 403 && String(error.message || '').toLowerCase().includes('csrf');
            const freshnessLikely = Number(error.status) === 403 && String(error.message || '').toLowerCase().includes('freshness');
            const freshnessReason = String(error?.details?.reason || '').toLowerCase();

            if (csrfLikely && withCsrf) {
                headers['x-csrf-token'] = await fetchCsrfToken(true);
                return doRequest();
            }

            if (freshnessLikely && isMutatingMethod(method) && freshnessReason !== 'user_quarantined') {
                applyRequestFreshnessHeaders(headers, { forceNew: true });
                return doRequest();
            }

            if (freshnessLikely && freshnessReason === 'user_quarantined') {
                const quarantineUntil = error?.details?.quarantineUntil ? ` until ${error.details.quarantineUntil}` : '';
                throw new Error(`Request freshness shield ne session temporarily lock kiya hai${quarantineUntil}. Please login again and retry.`);
            }

            throw error;
        }
    }

    async function fetchSecureWalletSnapshot() {
        return secureWalletRequest('/api/wallet/my', {
            method: 'GET',
            withCsrf: false
        });
    }

    async function fetchSecurePaymentModes(flow) {
        const normalizedFlow = sanitizeText(flow || '', 40).toLowerCase();
        const suffix = normalizedFlow ? `?flow=${encodeURIComponent(normalizedFlow)}` : '';
        const payload = await secureWalletRequest(`/api/wallet/payment-modes${suffix}`, {
            method: 'GET',
            withCsrf: false
        });

        const rows = Array.isArray(payload.rows) ? payload.rows : [];
        const normalizedRows = rows.map((row) => ({
            id: String(row.modeId || row.id || ''),
            label: String(row.label || row.modeId || 'Payment Mode'),
            enabled: Boolean(row.enabled),
            region: String(row.region || 'global'),
            flows: Array.isArray(row.flows) ? row.flows : []
        }));

        return normalizedRows;
    }

    async function fetchSecureGatewayStatus(forceRefresh = false) {
        if (!forceRefresh && secureGatewayStatusCache.payload && Date.now() - secureGatewayStatusCache.fetchedAt < 15000) {
            return secureGatewayStatusCache.payload;
        }

        const payload = await secureWalletRequest('/api/wallet/gateway/status', {
            method: 'GET',
            withCsrf: false
        });
        secureGatewayStatusCache = {
            payload,
            fetchedAt: Date.now()
        };
        return payload;
    }

    function getRazorpaySetupMessage(details = {}) {
        const status = details.gatewayStatus || details.razorpay || details;
        const missing = Array.isArray(status.missingEnv) && status.missingEnv.length
            ? status.missingEnv.join(' + ')
            : 'RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET';
        const rawReason = sanitizeText(details.reason || status.message || '', 240);

        if (rawReason.toLowerCase().includes('credential') || status.configured === false || status.available === false) {
            return `Razorpay live keys backend par missing hain (${missing}). Render/backend env me keys set karke service redeploy karein.`;
        }

        return rawReason || 'Razorpay live checkout is not ready on the backend.';
    }

    function getPayPalSetupMessage(details = {}) {
        const status = details.gatewayStatus || details.paypal || details;
        const missing = Array.isArray(status.missingEnv) && status.missingEnv.length
            ? status.missingEnv.join(' + ')
            : 'PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET';
        const rawReason = sanitizeText(details.reason || status.message || '', 260);

        if (missing === 'PAYPAL_INR_TO_SETTLEMENT_RATE') {
            return 'PayPal INR direct support nahi karta. Backend env me PAYPAL_INR_TO_SETTLEMENT_RATE set karein, phir service redeploy karein.';
        }

        if (rawReason.toLowerCase().includes('credential') || status.configured === false || status.available === false) {
            return `PayPal live keys backend par missing hain (${missing}). Render/backend env me keys set karke service redeploy karein.`;
        }

        return rawReason || 'PayPal live checkout is not ready on the backend.';
    }

    async function createSecureTopupOrder({ amount, paymentMode, currency, clientReference }) {
        return secureWalletRequest('/api/wallet/topup/order', {
            method: 'POST',
            withCsrf: true,
            body: {
                amount,
                paymentMode,
                currency: currency || 'INR',
                clientReference: clientReference || null
            }
        });
    }

    async function confirmSecureTopupOrder({ orderId, providerReference, proofScreenshotDataUrl, proofScreenshotName }) {
        return secureWalletRequest('/api/wallet/topup/confirm', {
            method: 'POST',
            withCsrf: true,
            body: {
                orderId,
                providerReference,
                proofScreenshotDataUrl: proofScreenshotDataUrl || '',
                proofScreenshotName: proofScreenshotName || ''
            }
        });
    }

    async function verifyRazorpayTopupPayment({ orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
        return secureWalletRequest('/api/wallet/topup/razorpay/verify', {
            method: 'POST',
            withCsrf: true,
            body: {
                orderId,
                razorpayOrderId,
                razorpayPaymentId,
                razorpaySignature
            }
        });
    }

    async function capturePayPalTopupPayment({ orderId, paypalOrderId }) {
        return secureWalletRequest('/api/wallet/topup/paypal/capture', {
            method: 'POST',
            withCsrf: true,
            body: {
                orderId,
                paypalOrderId
            }
        });
    }

    async function openRazorpayCheckout(checkout) {
        const Razorpay = await loadRazorpayCheckout();
        return new Promise((resolve, reject) => {
            const options = {
                key: checkout.keyId,
                amount: checkout.amount,
                currency: checkout.currency || 'INR',
                name: checkout.name || 'GO India RIDE',
                description: checkout.description || 'Wallet top-up',
                order_id: checkout.providerOrderId,
                prefill: getCheckoutPrefill(),
                notes: {
                    walletOrderId: checkout.orderId || ''
                },
                theme: {
                    color: '#667eea'
                },
                handler(response) {
                    resolve({
                        orderId: checkout.orderId,
                        razorpayOrderId: response.razorpay_order_id,
                        razorpayPaymentId: response.razorpay_payment_id,
                        razorpaySignature: response.razorpay_signature
                    });
                },
                modal: {
                    ondismiss() {
                        reject(new Error('Payment was cancelled before completion'));
                    }
                }
            };

            if (checkout.method && typeof checkout.method === 'object') {
                options.method = checkout.method;
            }

            const instance = new Razorpay(options);
            instance.on('payment.failed', (response) => {
                const description = response?.error?.description || 'Razorpay payment failed';
                reject(new Error(description));
            });
            instance.open();
        });
    }

    async function openPayPalCheckout(checkout) {
        const paypal = await loadPayPalCheckout(checkout);
        return new Promise((resolve, reject) => {
            let completed = false;
            const mountId = `paypal-button-container-${Date.now()}-${randomTokenPart()}`;
            const overlay = document.createElement('div');
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(10,14,28,.62);display:flex;align-items:center;justify-content:center;padding:18px;';
            overlay.innerHTML = `
                <div style="width:min(420px,100%);background:#fff;color:#101828;border-radius:8px;box-shadow:0 22px 70px rgba(15,23,42,.28);padding:20px;">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;">
                        <div>
                            <div style="font-weight:700;font-size:18px;">PayPal Checkout</div>
                            <div style="font-size:13px;color:#667085;margin-top:4px;">${sanitizeText(checkout.walletCurrency || 'INR', 8)} ${sanitizeText(checkout.walletAmount || '', 20)} wallet top-up</div>
                        </div>
                        <button type="button" aria-label="Close PayPal Checkout" data-paypal-close style="border:0;background:#f2f4f7;border-radius:8px;width:34px;height:34px;font-size:20px;line-height:1;cursor:pointer;">&times;</button>
                    </div>
                    <div id="${mountId}"></div>
                    <div style="font-size:12px;color:#667085;margin-top:12px;">Payment will be captured securely by PayPal, then verified by GO India RIDE backend.</div>
                </div>
            `;

            const cleanup = () => {
                if (overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
            };
            const closeButton = overlay.querySelector('[data-paypal-close]');
            if (closeButton) {
                closeButton.addEventListener('click', () => {
                    cleanup();
                    if (!completed) reject(new Error('PayPal payment was cancelled before completion'));
                });
            }
            document.body.appendChild(overlay);

            paypal.Buttons({
                style: {
                    layout: 'vertical',
                    shape: 'rect',
                    label: 'paypal'
                },
                createOrder() {
                    return checkout.providerOrderId;
                },
                onApprove(data) {
                    completed = true;
                    cleanup();
                    resolve({
                        orderId: checkout.orderId,
                        paypalOrderId: data.orderID || checkout.providerOrderId
                    });
                },
                onCancel() {
                    cleanup();
                    reject(new Error('PayPal payment was cancelled before completion'));
                },
                onError(error) {
                    cleanup();
                    reject(new Error((error && error.message) || 'PayPal payment failed'));
                }
            }).render(`#${mountId}`).catch((error) => {
                cleanup();
                reject(new Error((error && error.message) || 'Unable to render PayPal Checkout'));
            });
        });
    }

    async function openPayPalRedirectCheckout(checkout) {
        const modeLabel = sanitizeText(checkout.paymentModeLabel || checkout.paymentMode || 'Online Payment Mode', 120);
        const amountText = `${sanitizeText(checkout.walletCurrency || checkout.currency || 'INR', 8)} ${sanitizeText(String(checkout.walletAmount || checkout.amount || ''), 24)}`;
        const qr = checkout.qr || {};
        const actions = checkout.actions || {};
        const actionLinks = Array.isArray(actions.links) ? actions.links : [];
        const qrImage = String(qr.imageDataUrl || qr.imageUrl || '').trim();
        const qrPayload = String(qr.payload || '').trim();
        const hasQr = Boolean(qr.available && (qrImage || qrPayload));

        return new Promise((resolve, reject) => {
            let completed = false;
            const overlay = document.createElement('div');
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(10,14,28,.62);display:flex;align-items:center;justify-content:center;padding:18px;';
            overlay.innerHTML = `
                <div style="width:min(460px,100%);max-height:92vh;overflow:auto;background:#fff;color:#101828;border-radius:8px;box-shadow:0 22px 70px rgba(15,23,42,.28);padding:20px;">
                    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px;">
                        <div>
                            <div style="font-weight:700;font-size:18px;">Secure Redirect Checkout</div>
                            <div style="font-size:13px;color:#667085;margin-top:4px;">${modeLabel} - ${amountText}</div>
                        </div>
                        <button type="button" aria-label="Close payment checkout" data-close style="border:0;background:#f2f4f7;border-radius:8px;width:34px;height:34px;font-size:20px;line-height:1;cursor:pointer;">&times;</button>
                    </div>
                    <div data-qr-wrap style="display:${hasQr ? 'block' : 'none'};border:1px solid #e4e7ec;border-radius:8px;padding:14px;margin-bottom:14px;text-align:center;background:#fcfcfd;">
                        <img data-qr-image alt="Payment QR code" style="display:none;width:min(260px,100%);height:auto;margin:0 auto 12px;border:1px solid #eaecf0;border-radius:8px;background:#fff;padding:8px;">
                        <div style="font-size:13px;color:#344054;line-height:1.45;">QR scan karke payment complete karein, ya button se payment page kholen.</div>
                    </div>
                    <div data-actions style="display:none;border:1px solid #d0d5dd;border-radius:8px;padding:12px;margin-bottom:14px;background:#f8f9fc;">
                        <div style="font-size:13px;font-weight:700;color:#344054;margin-bottom:8px;">Pay Using App / Web</div>
                        <div data-action-buttons style="display:flex;gap:8px;flex-wrap:wrap;"></div>
                    </div>
                    <div data-error style="display:none;color:#b42318;font-size:13px;margin-bottom:10px;"></div>
                    <div style="font-size:12px;color:#667085;line-height:1.45;margin-bottom:14px;">Payment complete hone ke baad niche confirm button dabayen. System secure capture verify karega.</div>
                    <div style="display:flex;gap:10px;justify-content:flex-end;">
                        <button type="button" data-cancel style="border:1px solid #d0d5dd;background:#fff;color:#101828;border-radius:8px;padding:10px 14px;font-weight:700;cursor:pointer;">Cancel</button>
                        <button type="button" data-confirm style="border:0;background:#2b145f;color:#fff;border-radius:8px;padding:10px 14px;font-weight:700;cursor:pointer;">I Have Completed Payment</button>
                    </div>
                </div>
            `;

            const cleanup = () => {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            };
            const showError = (message) => {
                const node = overlay.querySelector('[data-error]');
                if (!node) return;
                node.textContent = message;
                node.style.display = 'block';
            };
            const clearError = () => {
                const node = overlay.querySelector('[data-error]');
                if (!node) return;
                node.textContent = '';
                node.style.display = 'none';
            };
            const closeWithCancel = () => {
                cleanup();
                if (!completed) reject(new Error('Payment checkout was cancelled'));
            };
            const launchUrl = (rawUrl) => {
                const url = String(rawUrl || '').trim();
                if (!/^(https?:\/\/|upi:\/\/|tez:\/\/|phonepe:\/\/|paytmmp:\/\/|intent:\/\/)/i.test(url)) {
                    showError('Invalid payment app URL.');
                    return;
                }
                const popup = window.open(url, '_blank', 'noopener,noreferrer');
                if (!popup) window.location.href = url;
            };

            const qrImageNode = overlay.querySelector('[data-qr-image]');
            if (hasQr && qrImageNode && qrImage) {
                qrImageNode.setAttribute('src', qrImage);
                qrImageNode.style.display = 'block';
                qrImageNode.style.cursor = 'zoom-in';
                qrImageNode.title = 'Open QR in new tab';
                qrImageNode.addEventListener('click', () => {
                    const w = window.open();
                    if (w) w.document.write(`<img src="${qrImage}" alt="Payment QR" style="max-width:100%;height:auto;">`);
                });
            }

            const actionsWrap = overlay.querySelector('[data-actions]');
            const actionButtons = overlay.querySelector('[data-action-buttons]');
            if (actionsWrap && actionButtons && actionLinks.length) {
                const buttonsHtml = actionLinks.map((row) => {
                    const safeLabel = sanitizeText(row.label || 'Open', 60);
                    const safeUrl = encodeURIComponent(String(row.url || '').trim());
                    if (!safeUrl) return '';
                    return `<button type="button" data-action-url="${safeUrl}" style="border:1px solid #c7d7fe;background:#fff;color:#1f3c88;border-radius:8px;padding:8px 12px;font-size:13px;font-weight:700;cursor:pointer;">${safeLabel}</button>`;
                }).filter(Boolean).join('');
                if (buttonsHtml) {
                    actionsWrap.style.display = 'block';
                    actionButtons.innerHTML = buttonsHtml;
                    actionButtons.addEventListener('click', (event) => {
                        const target = event.target.closest('[data-action-url]');
                        if (!target) return;
                        let actionUrl = target.getAttribute('data-action-url') || '';
                        try {
                            actionUrl = decodeURIComponent(actionUrl);
                        } catch (_error) {}
                        launchUrl(actionUrl);
                    });
                }
            }

            const cancelButton = overlay.querySelector('[data-cancel]');
            const closeButton = overlay.querySelector('[data-close]');
            const confirmButton = overlay.querySelector('[data-confirm]');

            if (cancelButton) cancelButton.addEventListener('click', closeWithCancel);
            if (closeButton) closeButton.addEventListener('click', closeWithCancel);
            if (confirmButton) {
                confirmButton.addEventListener('click', async () => {
                    clearError();
                    confirmButton.disabled = true;
                    confirmButton.textContent = 'Verifying...';
                    try {
                        const confirmation = await capturePayPalTopupPayment({
                            orderId: checkout.orderId,
                            paypalOrderId: checkout.providerOrderId
                        });
                        completed = true;
                        cleanup();
                        resolve({
                            orderId: checkout.orderId,
                            paypalOrderId: checkout.providerOrderId,
                            confirmation
                        });
                    } catch (error) {
                        confirmButton.disabled = false;
                        confirmButton.textContent = 'I Have Completed Payment';
                        showError(error.message || 'Payment abhi complete nahi mila. Pehle payment approve karke phir try karein.');
                    }
                });
            }

            document.body.appendChild(overlay);
        });
    }

    async function openReferenceTopupConfirmation(checkout) {
        const label = sanitizeText(checkout.referenceLabel || 'Gateway / bank transaction reference', 120);
        const modeLabel = sanitizeText(checkout.paymentModeLabel || checkout.paymentMode || 'selected payment mode', 120);
        const amountText = `${sanitizeText(checkout.currency || 'INR', 8)} ${sanitizeText(String(checkout.amount || ''), 24)}`;
        const qr = checkout.qr || {};
        const actions = checkout.actions || {};
        const actionLinks = Array.isArray(actions.links) ? actions.links : [];
        const qrImage = String(qr.imageDataUrl || qr.imageUrl || '').trim();
        const qrPayload = String(qr.payload || '').trim();
        const hasQr = Boolean(qr.available && (qrImage || qrPayload));

        return new Promise((resolve, reject) => {
            let completed = false;
            const overlay = document.createElement('div');
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(10,14,28,.62);display:flex;align-items:center;justify-content:center;padding:18px;';
            overlay.innerHTML = `
                <div style="width:min(460px,100%);max-height:92vh;overflow:auto;background:#fff;color:#101828;border-radius:8px;box-shadow:0 22px 70px rgba(15,23,42,.28);padding:20px;">
                    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px;">
                        <div>
                            <div style="font-weight:700;font-size:18px;">Secure Payment Reference</div>
                            <div style="font-size:13px;color:#667085;margin-top:4px;">${modeLabel} - ${amountText}</div>
                        </div>
                        <button type="button" aria-label="Close payment reference" data-reference-close style="border:0;background:#f2f4f7;border-radius:8px;width:34px;height:34px;font-size:20px;line-height:1;cursor:pointer;">&times;</button>
                    </div>
                    <div data-qr-wrap style="display:${hasQr ? 'block' : 'none'};border:1px solid #e4e7ec;border-radius:8px;padding:14px;margin-bottom:14px;text-align:center;background:#fcfcfd;">
                        <img data-qr-image alt="Payment QR code" style="display:none;width:min(260px,100%);height:auto;margin:0 auto 12px;border:1px solid #eaecf0;border-radius:8px;background:#fff;padding:8px;">
                        <div data-qr-instructions style="font-size:13px;color:#344054;line-height:1.45;"></div>
                        <div data-qr-payee style="font-size:12px;color:#667085;line-height:1.45;margin-top:8px;word-break:break-word;"></div>
                        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:12px;">
                            <button type="button" data-open-qr style="display:none;border:0;background:#101828;color:#fff;border-radius:8px;padding:10px 12px;font-weight:700;cursor:pointer;">Open Payment App</button>
                            <button type="button" data-copy-qr style="display:none;border:1px solid #d0d5dd;background:#fff;color:#101828;border-radius:8px;padding:10px 12px;font-weight:700;cursor:pointer;">Copy Payment Details</button>
                        </div>
                    </div>
                    <div data-setup-note style="display:none;border:1px solid #fedf89;background:#fffaeb;color:#93370d;border-radius:8px;padding:10px 12px;font-size:13px;line-height:1.45;margin-bottom:14px;"></div>
                    <div data-mode-actions style="display:none;border:1px solid #d0d5dd;border-radius:8px;padding:12px;margin-bottom:14px;background:#f8f9fc;">
                        <div style="font-size:13px;font-weight:700;color:#344054;margin-bottom:8px;">Pay Using Mobile App</div>
                        <div data-mode-action-buttons style="display:flex;gap:8px;flex-wrap:wrap;"></div>
                        <div style="font-size:12px;color:#667085;line-height:1.4;margin-top:8px;">App me payment complete karke is screen par wapas aakar UTR/reference submit karein.</div>
                    </div>
                    <label style="display:block;font-size:13px;font-weight:700;color:#344054;margin-bottom:6px;">${label}</label>
                    <input data-provider-reference type="text" autocomplete="off" placeholder="UTR / gateway reference" style="width:100%;box-sizing:border-box;border:1px solid #d0d5dd;border-radius:8px;padding:12px;font-size:15px;margin-bottom:10px;">
                    <label style="display:block;font-size:13px;font-weight:700;color:#344054;margin-bottom:6px;">Payment Screenshot (optional but recommended)</label>
                    <input data-proof-file type="file" accept="image/png,image/jpeg,image/webp" style="width:100%;box-sizing:border-box;border:1px solid #d0d5dd;border-radius:8px;padding:10px;font-size:13px;margin-bottom:8px;background:#fff;">
                    <div data-proof-status style="font-size:12px;color:#667085;line-height:1.4;margin-bottom:10px;">Screenshot attach karne se admin approval fast ho jata hai.</div>
                    <div data-reference-error style="display:none;color:#b42318;font-size:13px;margin-bottom:10px;"></div>
                    <div style="font-size:12px;color:#667085;line-height:1.45;margin-bottom:14px;">Payment complete hone ke baad UTR/reference submit karein. QR ko dusre phone se scan karwa sakte hain.</div>
                    <div style="display:flex;gap:10px;justify-content:flex-end;">
                        <button type="button" data-reference-cancel style="border:1px solid #d0d5dd;background:#fff;color:#101828;border-radius:8px;padding:10px 14px;font-weight:700;cursor:pointer;">Cancel</button>
                        <button type="button" data-reference-confirm style="border:0;background:#2b145f;color:#fff;border-radius:8px;padding:10px 14px;font-weight:700;cursor:pointer;">Confirm Payment</button>
                    </div>
                </div>
            `;

            const cleanup = () => {
                if (overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
            };
            const showError = (message) => {
                const node = overlay.querySelector('[data-reference-error]');
                if (!node) return;
                node.textContent = message;
                node.style.display = 'block';
            };
            const clearError = () => {
                const node = overlay.querySelector('[data-reference-error]');
                if (!node) return;
                node.textContent = '';
                node.style.display = 'none';
            };
            const closeWithCancel = () => {
                cleanup();
                if (!completed) {
                    reject(new Error('Payment reference confirmation was cancelled'));
                }
            };
            const launchUrl = (rawUrl) => {
                const url = String(rawUrl || '').trim();
                if (!/^(https?:\/\/|upi:\/\/|tez:\/\/|phonepe:\/\/|paytmmp:\/\/|intent:\/\/)/i.test(url)) {
                    showError('Invalid payment app URL.');
                    return;
                }
                if (/^https?:\/\//i.test(url)) {
                    const popup = window.open(url, '_blank', 'noopener,noreferrer');
                    if (!popup) {
                        window.location.href = url;
                    }
                    return;
                }
                window.location.href = url;
            };
            const compressProofImage = (file) => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onerror = () => reject(new Error('Screenshot read nahi ho paya.'));
                reader.onload = () => {
                    const image = new Image();
                    image.onerror = () => reject(new Error('Screenshot parse nahi ho paya.'));
                    image.onload = () => {
                        const maxWidth = 1200;
                        const scale = Math.min(1, maxWidth / Math.max(1, image.width));
                        const canvas = document.createElement('canvas');
                        canvas.width = Math.max(1, Math.round(image.width * scale));
                        canvas.height = Math.max(1, Math.round(image.height * scale));
                        const context = canvas.getContext('2d');
                        if (!context) {
                            reject(new Error('Screenshot process nahi ho paya.'));
                            return;
                        }
                        context.drawImage(image, 0, 0, canvas.width, canvas.height);
                        let quality = 0.82;
                        let dataUrl = canvas.toDataURL('image/jpeg', quality);
                        while (dataUrl.length > 110000 && quality > 0.38) {
                            quality -= 0.1;
                            dataUrl = canvas.toDataURL('image/jpeg', quality);
                        }
                        if (dataUrl.length > 120000) {
                            reject(new Error('Screenshot size bahut badi hai. Chhoti image upload karein.'));
                            return;
                        }
                        resolve(dataUrl);
                    };
                    image.src = String(reader.result || '');
                };
                reader.readAsDataURL(file);
            });

            const imageNode = overlay.querySelector('[data-qr-image]');
            if (hasQr && imageNode && qrImage) {
                imageNode.setAttribute('src', qrImage);
                imageNode.style.display = 'block';
                imageNode.style.cursor = 'zoom-in';
                imageNode.title = 'Open QR in new tab';
                imageNode.addEventListener('click', () => {
                    const w = window.open();
                    if (w) {
                        w.document.write(`<img src="${qrImage}" alt="Payment QR" style="max-width:100%;height:auto;">`);
                    }
                });
            }
            const instructionsNode = overlay.querySelector('[data-qr-instructions]');
            if (instructionsNode && hasQr) {
                instructionsNode.textContent = sanitizeText(qr.instructions || 'Dusre phone se QR scan karke payment karein. Payment ke baad reference submit karein.', 240);
            }
            const payeeNode = overlay.querySelector('[data-qr-payee]');
            if (payeeNode && hasQr) {
                const payee = sanitizeText(qr.payee || '', 120);
                payeeNode.textContent = payee ? `Payee: ${payee} | Order: ${sanitizeText(checkout.orderId, 80)}` : `Order: ${sanitizeText(checkout.orderId, 80)}`;
            }
            const setupNode = overlay.querySelector('[data-setup-note]');
            if (!hasQr && setupNode && qr && qr.available === false && qr.setupMessage) {
                setupNode.textContent = sanitizeText(qr.setupMessage, 240);
                setupNode.style.display = 'block';
            }
            const modeActionsWrap = overlay.querySelector('[data-mode-actions]');
            const modeActionButtons = overlay.querySelector('[data-mode-action-buttons]');
            if (modeActionsWrap && modeActionButtons && actionLinks.length) {
                const buttonsHtml = actionLinks.map((row) => {
                    const safeId = sanitizeText(row.id || 'action', 40).replace(/[^a-z0-9_-]/gi, '');
                    const safeLabel = sanitizeText(row.label || 'Pay', 60);
                    const safeUrl = encodeURIComponent(String(row.url || '').trim());
                    if (!safeUrl) return '';
                    return `<button type="button" data-action-id="${safeId}" data-action-url="${safeUrl}" style="border:1px solid #c7d7fe;background:#fff;color:#1f3c88;border-radius:8px;padding:8px 12px;font-size:13px;font-weight:700;cursor:pointer;">${safeLabel}</button>`;
                }).filter(Boolean).join('');
                if (buttonsHtml) {
                    modeActionsWrap.style.display = 'block';
                    modeActionButtons.innerHTML = buttonsHtml;
                    modeActionButtons.addEventListener('click', (event) => {
                        const target = event.target.closest('[data-action-url]');
                        if (!target) return;
                        const encodedUrl = target.getAttribute('data-action-url') || '';
                        let actionUrl = '';
                        try {
                            actionUrl = decodeURIComponent(encodedUrl);
                        } catch (_error) {
                            actionUrl = encodedUrl;
                        }
                        launchUrl(actionUrl);
                    });
                } else if (setupNode && !setupNode.textContent.trim() && actions && actions.setupMessage) {
                    setupNode.textContent = sanitizeText(actions.setupMessage, 240);
                    setupNode.style.display = 'block';
                }
            } else if (setupNode && !setupNode.textContent.trim() && actions && actions.setupMessage) {
                setupNode.textContent = sanitizeText(actions.setupMessage, 240);
                setupNode.style.display = 'block';
            }
            const openQrButton = overlay.querySelector('[data-open-qr]');
            if (openQrButton && qrPayload && /^upi:\/\//i.test(qrPayload)) {
                openQrButton.style.display = 'inline-flex';
                openQrButton.addEventListener('click', () => {
                    launchUrl(qrPayload);
                });
            }
            const copyQrButton = overlay.querySelector('[data-copy-qr]');
            if (copyQrButton && (qrPayload || qr.payee)) {
                copyQrButton.style.display = 'inline-flex';
                copyQrButton.addEventListener('click', async () => {
                    const text = qrPayload || String(qr.payee || '');
                    try {
                        await navigator.clipboard.writeText(text);
                        copyQrButton.textContent = 'Copied';
                    } catch (_error) {
                        showError('Copy nahi ho paya. QR scan karein ya payment details manually use karein.');
                    }
                });
            }

            const input = overlay.querySelector('[data-provider-reference]');
            const proofFileInput = overlay.querySelector('[data-proof-file]');
            const proofStatus = overlay.querySelector('[data-proof-status]');
            const confirmButton = overlay.querySelector('[data-reference-confirm]');
            const cancelButton = overlay.querySelector('[data-reference-cancel]');
            const closeButton = overlay.querySelector('[data-reference-close]');
            let proofScreenshotDataUrl = '';
            let proofScreenshotName = '';

            if (proofFileInput) {
                proofFileInput.addEventListener('change', async () => {
                    clearError();
                    const file = proofFileInput.files && proofFileInput.files[0] ? proofFileInput.files[0] : null;
                    if (!file) {
                        proofScreenshotDataUrl = '';
                        proofScreenshotName = '';
                        if (proofStatus) proofStatus.textContent = 'Screenshot attach karne se admin approval fast ho jata hai.';
                        return;
                    }
                    if (proofStatus) proofStatus.textContent = 'Screenshot optimize ho raha hai...';
                    try {
                        proofScreenshotDataUrl = await compressProofImage(file);
                        proofScreenshotName = sanitizeText(file.name || 'payment-proof.jpg', 160);
                        if (proofStatus) {
                            const kb = Math.round((proofScreenshotDataUrl.length * 0.75) / 1024);
                            proofStatus.textContent = `Attached: ${proofScreenshotName} (${kb} KB approx)`;
                        }
                    } catch (error) {
                        proofScreenshotDataUrl = '';
                        proofScreenshotName = '';
                        if (proofStatus) proofStatus.textContent = error.message || 'Screenshot attach nahi ho paya.';
                        showError(error.message || 'Screenshot attach nahi ho paya.');
                    }
                });
            }

            if (cancelButton) cancelButton.addEventListener('click', closeWithCancel);
            if (closeButton) closeButton.addEventListener('click', closeWithCancel);
            if (confirmButton) {
                confirmButton.addEventListener('click', async () => {
                    clearError();
                    const providerReference = String(input?.value || '').trim();
                    if (providerReference.length < 5) {
                        showError('Gateway reference / UTR required hai. Payment complete karke valid reference enter karein.');
                        return;
                    }
                    confirmButton.disabled = true;
                    confirmButton.textContent = 'Submitting...';
                    try {
                        const confirmation = await confirmSecureTopupOrder({
                            orderId: checkout.orderId,
                            providerReference,
                            proofScreenshotDataUrl,
                            proofScreenshotName
                        });
                        completed = true;
                        cleanup();
                        resolve({
                            orderId: checkout.orderId,
                            providerReference,
                            confirmation
                        });
                    } catch (error) {
                        confirmButton.disabled = false;
                        confirmButton.textContent = 'Confirm Payment';
                        showError(error.message || 'Payment reference verify nahi ho paya.');
                    }
                });
            }

            document.body.appendChild(overlay);
            if (input) input.focus();
        });
    }

    async function startSecureTopupCheckout({ amount, paymentMode, currency, clientReference }) {
        const orderPayload = await createSecureTopupOrder({
            amount,
            paymentMode,
            currency: currency || 'INR',
            clientReference
        });
        const order = orderPayload.order || orderPayload;
        const checkout = orderPayload.checkout || null;

        if (checkout && checkout.provider === 'paypal_redirect' && checkout.available) {
            const payment = await openPayPalRedirectCheckout(checkout);
            return {
                order,
                checkout,
                payment,
                confirmation: payment.confirmation,
                liveGateway: 'paypal'
            };
        }

        if (checkout && checkout.provider === 'customer_reference' && checkout.available) {
            const payment = await openReferenceTopupConfirmation(checkout);
            return {
                order,
                checkout,
                payment,
                confirmation: payment.confirmation,
                liveGateway: 'customer_reference'
            };
        }

        if (checkout && checkout.provider === 'paypal' && checkout.available) {
            const payment = await openPayPalCheckout(checkout);
            const confirmation = await capturePayPalTopupPayment(payment);
            return {
                order,
                checkout,
                payment,
                confirmation,
                liveGateway: 'paypal'
            };
        }

        if (checkout && checkout.provider === 'paypal' && checkout.available === false) {
            throw new Error(getPayPalSetupMessage(checkout));
        }

        if (checkout && checkout.provider === 'razorpay' && checkout.available) {
            const payment = await openRazorpayCheckout(checkout);
            const confirmation = await verifyRazorpayTopupPayment(payment);
            return {
                order,
                checkout,
                payment,
                confirmation,
                liveGateway: 'razorpay'
            };
        }

        if (checkout && checkout.provider === 'razorpay' && checkout.available === false) {
            throw new Error(getRazorpaySetupMessage(checkout));
        }

        throw new Error('Selected payment mode is not connected to a live checkout yet. Please choose another enabled mode or submit a valid gateway reference / UTR.');
    }

    async function createSecureWithdrawalRequest({ amount, method, destination, notes }) {
        return secureWalletRequest('/api/wallet/withdrawals', {
            method: 'POST',
            withCsrf: true,
            body: {
                amount,
                method,
                destination,
                notes: notes || ''
            }
        });
    }

    async function fetchSecureWalletTransactions({ walletType, ownerId, limit = 50 } = {}) {
        const params = new URLSearchParams();
        if (walletType) params.set('walletType', walletType);
        if (ownerId) params.set('ownerId', ownerId);
        params.set('limit', String(limit));

        const payload = await secureWalletRequest(`/api/wallet/transactions?${params.toString()}`, {
            method: 'GET',
            withCsrf: false
        });

        return Array.isArray(payload.rows) ? payload.rows : [];
    }

    async function fetchSecureWithdrawalRequests({ walletType, ownerId, status } = {}) {
        const params = new URLSearchParams();
        if (walletType) params.set('walletType', walletType);
        if (ownerId) params.set('ownerId', ownerId);
        if (status) params.set('status', status);

        const query = params.toString();
        const payload = await secureWalletRequest(`/api/wallet/withdrawals${query ? `?${query}` : ''}`, {
            method: 'GET',
            withCsrf: false
        });

        return Array.isArray(payload.rows) ? payload.rows : [];
    }

    async function fetchSecureAdminWalletOverview() {
        return secureWalletRequest('/api/wallet/admin/overview', {
            method: 'GET',
            withCsrf: false
        });
    }

    async function fetchSecureAdminWithdrawalQueue(status) {
        const suffix = status ? `?status=${encodeURIComponent(status)}` : '';
        return secureWalletRequest(`/api/wallet/admin/withdrawals${suffix}`, {
            method: 'GET',
            withCsrf: false
        });
    }

    async function fetchSecureAdminTopupQueue(status) {
        const suffix = status ? `?status=${encodeURIComponent(status)}` : '';
        return secureWalletRequest(`/api/wallet/admin/topups${suffix}`, {
            method: 'GET',
            withCsrf: false
        });
    }

    async function reviewSecureWithdrawalRequest({ requestId, decision, remarks }) {
        return secureWalletRequest(`/api/wallet/admin/withdrawals/${encodeURIComponent(requestId)}/review`, {
            method: 'POST',
            withCsrf: true,
            body: {
                decision,
                remarks: remarks || ''
            }
        });
    }

    async function reviewSecureTopupOrder({ orderId, decision, remarks }) {
        return secureWalletRequest(`/api/wallet/admin/topups/${encodeURIComponent(orderId)}/review`, {
            method: 'POST',
            withCsrf: true,
            body: {
                decision,
                remarks: remarks || ''
            }
        });
    }

    async function updateSecurePaymentModes(modes) {
        return secureWalletRequest('/api/wallet/admin/payment-modes', {
            method: 'PUT',
            withCsrf: true,
            body: {
                modes
            }
        });
    }

    async function adjustSecureWallet(payload) {
        return secureWalletRequest('/api/wallet/admin/wallet-adjust', {
            method: 'POST',
            withCsrf: true,
            body: payload || {}
        });
    }

    function bootstrapDefaults() {
        ensureWallet('donation', 'pool');
        ensureWallet('admin', 'platform');
        getPaymentModes();
        ensureWithdrawalStore();
        ensureSecurityLog();
    }

    bootstrapDefaults();

    window.WalletCore = {
        getWallet,
        listWallets,
        getTransactions,
        getPaymentModes,
        getEnabledPaymentModes,
        setPaymentModes,
        getWithdrawalRequests,
        createWithdrawalRequest,
        reviewWithdrawalRequest,
        settlePaymentToAdmin,
        getSecurityEvents() {
            return ensureSecurityLog();
        },
        recordSecurityEvent,
        credit(payload) {
            return mutateBalance({ ...payload, action: 'credit' });
        },
        debit(payload) {
            return mutateBalance({ ...payload, action: 'debit' });
        },
        transfer,
        resolveOwnerForRole,
        walletId,

        // Secure backend mode (production API)
        isSecureBackendReady,
        getApiBaseUrl,
        secureWalletRequest,
        fetchSecureWalletSnapshot,
        fetchSecurePaymentModes,
        fetchSecureGatewayStatus,
        fetchSecureWalletTransactions,
        fetchSecureWithdrawalRequests,
        createSecureTopupOrder,
        confirmSecureTopupOrder,
        verifyRazorpayTopupPayment,
        capturePayPalTopupPayment,
        startSecureTopupCheckout,
        getRazorpaySetupMessage,
        getPayPalSetupMessage,
        createIdempotencyKey,
        createSecureWithdrawalRequest,
        fetchSecureAdminWalletOverview,
        fetchSecureAdminWithdrawalQueue,
        fetchSecureAdminTopupQueue,
        reviewSecureWithdrawalRequest,
        reviewSecureTopupOrder,
        updateSecurePaymentModes,
        adjustSecureWallet
    };
})();




