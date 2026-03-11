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
        { id: 'upi_qr', label: 'UPI QR Scan', enabled: true, region: 'india', flows: ['add_money'] },
        { id: 'bharat_qr', label: 'Bharat QR', enabled: true, region: 'india', flows: ['add_money'] },
        { id: 'debit_card', label: 'Debit Card', enabled: true, region: 'india', flows: ['add_money', 'ride_payment', 'refund'] },
        { id: 'credit_card', label: 'Credit Card', enabled: true, region: 'india', flows: ['add_money', 'ride_payment', 'refund'] },
        { id: 'netbanking', label: 'Net Banking', enabled: true, region: 'india', flows: ['add_money', 'withdrawal'] },
        { id: 'imps', label: 'IMPS', enabled: true, region: 'india', flows: ['withdrawal'] },
        { id: 'neft_rtgs', label: 'NEFT/RTGS', enabled: true, region: 'india', flows: ['withdrawal'] },
        { id: 'paytm_wallet', label: 'Paytm Wallet', enabled: true, region: 'india', flows: ['add_money', 'ride_payment'] },
        { id: 'phonepe_wallet', label: 'PhonePe Wallet', enabled: true, region: 'india', flows: ['add_money', 'ride_payment'] },
        { id: 'googlepay_wallet', label: 'Google Pay Wallet', enabled: true, region: 'india', flows: ['add_money', 'ride_payment'] },

        // International
        { id: 'stripe_cards', label: 'Stripe (Cards)', enabled: true, region: 'international', flows: ['add_money', 'ride_payment', 'refund'] },
        { id: 'paypal', label: 'PayPal', enabled: true, region: 'international', flows: ['add_money', 'withdrawal', 'refund'] },
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
    let secureCsrfCache = { token: null, fetchedAt: 0 };

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

        return getPaymentModes().filter((mode) => {
            if (!mode.enabled) return false;
            if (flow && !(mode.flows || []).includes(flow)) return false;
            if (region && mode.region !== region && mode.region !== 'global') return false;
            return true;
        });
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
        const explicit = sanitizeText(window.GOINDIARIDE_API_BASE || '', 300) || sanitizeText(localStorage.getItem(API_BASE_OVERRIDE_KEY) || '', 300);
        if (explicit) {
            return explicit.replace(/\/$/, '');
        }

        const host = String(window.location.hostname || '').toLowerCase();
        if (host === 'localhost' || host === '127.0.0.1') {
            return 'http://localhost:5000';
        }

        return String(window.location.origin || '').replace(/\/$/, '');
    }

    function isSecureBackendReady() {
        return Boolean(getAccessToken()) && Boolean(getApiBaseUrl());
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

        const doRequest = async () => {
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
                throw error;
            }

            return payload;
        };

        try {
            return await doRequest();
        } catch (error) {
            const csrfLikely = Number(error.status) === 403 && String(error.message || '').toLowerCase().includes('csrf');
            if (csrfLikely && withCsrf) {
                headers['x-csrf-token'] = await fetchCsrfToken(true);
                return doRequest();
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
        return rows.map((row) => ({
            id: String(row.modeId || row.id || ''),
            label: String(row.label || row.modeId || 'Payment Mode'),
            enabled: Boolean(row.enabled),
            region: String(row.region || 'global'),
            flows: Array.isArray(row.flows) ? row.flows : []
        }));
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

    async function confirmSecureTopupOrder({ orderId, providerReference }) {
        return secureWalletRequest('/api/wallet/topup/confirm', {
            method: 'POST',
            withCsrf: true,
            body: {
                orderId,
                providerReference
            }
        });
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
        fetchSecureWalletTransactions,
        fetchSecureWithdrawalRequests,
        createSecureTopupOrder,
        confirmSecureTopupOrder,
        createSecureWithdrawalRequest,
        fetchSecureAdminWalletOverview,
        fetchSecureAdminWithdrawalQueue,
        reviewSecureWithdrawalRequest,
        updateSecurePaymentModes,
        adjustSecureWallet
    };
})();




