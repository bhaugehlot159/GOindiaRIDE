/* ======================================
   CENTRAL WALLET CORE
   Wallet types: customer, driver, admin, donation
   Admin has full control over add/withdraw/payment modes.
   ====================================== */

(function initWalletCore() {
    const WALLET_STORAGE_KEY = 'goindiaride_wallet_store_v1';
    const PAYMENT_MODE_KEY = 'goindiaride_payment_modes_v1';
    const TX_LIMIT = 200;

    const DEFAULT_PAYMENT_MODES = [
        { id: 'upi', label: 'UPI', enabled: true },
        { id: 'card', label: 'Card', enabled: true },
        { id: 'netbanking', label: 'Net Banking', enabled: true },
        { id: 'wallet', label: 'Wallet', enabled: true },
        { id: 'cash', label: 'Cash', enabled: true }
    ];

    const allowedTypes = ['customer', 'driver', 'admin', 'donation'];

    function nowIso() {
        return new Date().toISOString();
    }

    function getActiveRole() {
        return String(localStorage.getItem('userRole') || '').toLowerCase();
    }

    function getActiveProfile() {
        const role = getActiveRole();

        if (role === 'driver') {
            try {
                return JSON.parse(localStorage.getItem('currentDriver') || '{}');
            } catch (error) {
                return {};
            }
        }

        if (role === 'admin') {
            try {
                return JSON.parse(localStorage.getItem('currentAdmin') || '{}');
            } catch (error) {
                return {};
            }
        }

        try {
            return JSON.parse(localStorage.getItem('currentUser') || '{}');
        } catch (error) {
            return {};
        }
    }

    function ensureStore() {
        let store;
        try {
            store = JSON.parse(localStorage.getItem(WALLET_STORAGE_KEY) || '{}');
        } catch (error) {
            store = {};
        }

        if (!store || typeof store !== 'object') {
            store = {};
        }

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

    function mutateBalance({ type, ownerId, amount, action, description, actorRole, actorId, paymentMode }) {
        validateType(type);

        const normalizedOwner = normalizeOwnerId(type, ownerId);
        const normalizedRole = String(actorRole || getActiveRole() || '').toLowerCase();

        if (!canMutateWallet(normalizedRole, type, normalizedOwner, action)) {
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
            description: description || `${action} ${numericAmount}`,
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
            description: description || `Transfer to ${toId}`,
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
            description: description || `Transfer from ${fromId}`,
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

        return rows;
    }

    function getPaymentModes() {
        try {
            const modes = JSON.parse(localStorage.getItem(PAYMENT_MODE_KEY) || '[]');
            if (Array.isArray(modes) && modes.length > 0) {
                return modes;
            }
        } catch (error) {
            // Ignore parsing error and reset with defaults.
        }

        localStorage.setItem(PAYMENT_MODE_KEY, JSON.stringify(DEFAULT_PAYMENT_MODES));
        return DEFAULT_PAYMENT_MODES;
    }

    function setPaymentModes(modes, actorRole) {
        const role = String(actorRole || getActiveRole() || '').toLowerCase();
        if (role !== 'admin') {
            throw new Error('Only admin can change payment modes.');
        }

        if (!Array.isArray(modes) || modes.length === 0) {
            throw new Error('Payment mode list is empty.');
        }

        localStorage.setItem(PAYMENT_MODE_KEY, JSON.stringify(modes));
        return modes;
    }

    function getWallet(type, ownerId) {
        return ensureWallet(type, normalizeOwnerId(type, ownerId));
    }

    function bootstrapDefaults() {
        ensureWallet('donation', 'pool');
        ensureWallet('admin', 'platform');
    }

    bootstrapDefaults();

    window.WalletCore = {
        getWallet,
        listWallets,
        getTransactions,
        getPaymentModes,
        setPaymentModes,
        credit(payload) {
            return mutateBalance({ ...payload, action: 'credit' });
        },
        debit(payload) {
            return mutateBalance({ ...payload, action: 'debit' });
        },
        transfer,
        resolveOwnerForRole,
        walletId
    };
})();
