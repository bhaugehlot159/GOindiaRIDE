        // LOAD RIDES
        // ----------------------------------------====

        let secureWalletSnapshot = null;
        let secureWalletSyncedAt = 0;
        let secureWalletSnapshotInFlight = null;

        function isSecureWalletMode() {
            return Boolean(
                window.WalletCore &&
                typeof WalletCore.isSecureBackendReady === 'function' &&
                WalletCore.isSecureBackendReady()
            );
        }

        function getCustomerWalletOwnerId() {
            const identity = getDashboardCustomerIdentity();
            return String(identity.primaryId || currentUser?.id || currentUser?.userId || 'customer_default');
        }

        function formatInr(amount) {
            const value = Number(amount || 0);
            return new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency: 'INR',
                maximumFractionDigits: 2
            }).format(value);
        }

        function syncLegacyWalletStore(balance) {
            const ownerId = getCustomerWalletOwnerId();
            const walletKey = 'wallet_' + ownerId;
            const existing = JSON.parse(localStorage.getItem(walletKey) || '{}');
            localStorage.setItem(walletKey, JSON.stringify({
                balance: Number(balance || 0),
                transactions: Array.isArray(existing.transactions) ? existing.transactions : []
            }));
        }

        async function refreshSecureWalletSnapshot(forceSync = false) {
            if (!isSecureWalletMode() || !window.WalletCore || typeof WalletCore.fetchSecureWalletSnapshot !== 'function') {
                return null;
            }

            if (!forceSync && secureWalletSnapshot && Date.now() - secureWalletSyncedAt < 15000) {
                return secureWalletSnapshot;
            }
            if (secureWalletSnapshotInFlight) {
                return secureWalletSnapshotInFlight;
            }

            secureWalletSnapshotInFlight = (async () => {
                const payload = await WalletCore.fetchSecureWalletSnapshot();
                secureWalletSnapshot = payload || null;
                secureWalletSyncedAt = Date.now();
                return secureWalletSnapshot;
            })();

            try {
                return await secureWalletSnapshotInFlight;
            } catch (error) {
                console.warn('Secure wallet snapshot failed:', error);
                return secureWalletSnapshot;
            } finally {
                secureWalletSnapshotInFlight = null;
            }
        }

        function getWalletSnapshotForDashboard() {
            const liveMode = isSecureWalletMode();

            if (liveMode && secureWalletSnapshot && secureWalletSnapshot.wallet) {
                const customerBalance = Number(secureWalletSnapshot.wallet.balance || 0);
                const donationBalance = Number((secureWalletSnapshot.donationWallet && secureWalletSnapshot.donationWallet.balance) || 0);
                syncLegacyWalletStore(customerBalance);
                return {
                    customerBalance,
                    donationBalance
                };
            }

            if (!liveMode) {
                return {
                    customerBalance: 0,
                    donationBalance: 0
                };
            }

            return {
                customerBalance: 0,
                donationBalance: 0
            };

            const ownerId = getCustomerWalletOwnerId();

            if (window.WalletCore && typeof WalletCore.getWallet === 'function') {
                const customerWallet = WalletCore.getWallet('customer', ownerId);
                const donationWallet = WalletCore.getWallet('donation', 'pool');
                syncLegacyWalletStore(Number(customerWallet.balance || 0));
                return {
                    customerBalance: Number(customerWallet.balance || 0),
                    donationBalance: Number(donationWallet.balance || 0)
                };
            }

            const legacy = JSON.parse(localStorage.getItem('wallet_' + ownerId) || '{"balance":0}');
            return {
                customerBalance: Number(legacy.balance || 0),
                donationBalance: 0
            };
        }

        async function getWalletMethodOptions(flow) {
            const flowId = String(flow || '').trim().toLowerCase();
            const defaultModes = flowId === 'withdrawal'
                ? [
                    { id: 'upi', label: 'UPI' },
                    { id: 'imps', label: 'IMPS' },
                    { id: 'neft_rtgs', label: 'NEFT/RTGS' },
                    { id: 'swift_wire', label: 'SWIFT Wire' }
                ]
                : [
                    { id: 'upi_intent', label: 'UPI Intent (PhonePe, Google Pay, Paytm)' },
                    { id: 'upi_qr', label: 'UPI QR Scan' },
                    { id: 'bharat_qr', label: 'Bharat QR' },
                    { id: 'phonepe_wallet', label: 'PhonePe Wallet' },
                    { id: 'googlepay_wallet', label: 'Google Pay Wallet' },
                    { id: 'paytm_wallet', label: 'Paytm Wallet' },
                    { id: 'rupay_card', label: 'RuPay Card' },
                    { id: 'visa_master_amex', label: 'Visa / MasterCard / Amex' },
                    { id: 'net_banking', label: 'Net Banking' },
                    { id: 'razorpay', label: 'Razorpay Gateway' },
                    { id: 'cashfree', label: 'Cashfree Gateway' },
                    { id: 'stripe_cards', label: 'Stripe Cards' },
                    { id: 'paypal', label: 'PayPal Checkout' },
                    { id: 'apple_pay', label: 'Apple Pay' },
                    { id: 'google_pay_intl', label: 'Google Pay International' },
                    { id: 'alipay', label: 'Alipay' },
                    { id: 'wechat_pay', label: 'WeChat Pay' },
                    { id: 'international_qr', label: 'International QR' }
                ];

            if (!isSecureWalletMode()) {
                return [{
                    id: flow === 'add_money' ? 'live_payment_required' : '',
                    label: flow === 'add_money' ? 'Live payment login required' : 'Live wallet login required'
                }];
            }

            const modeMap = new Map();
            const upsertModes = (rows) => {
                (Array.isArray(rows) ? rows : []).forEach((mode) => {
                    const id = String(mode.id || mode.modeId || '').trim();
                    if (!id) return;
                    const label = String(mode.label || mode.modeId || id || 'Payment Mode').trim();
                    modeMap.set(id, { id, label });
                });
            };

            if (isSecureWalletMode() && secureWalletSnapshot && Array.isArray(secureWalletSnapshot.paymentModes)) {
                upsertModes(secureWalletSnapshot.paymentModes.filter((mode) => {
                    const flows = Array.isArray(mode.flows) ? mode.flows.map((item) => String(item || '').toLowerCase()) : [];
                    return !flowId || flows.includes(flowId);
                }));
            }

            if (window.WalletCore && typeof WalletCore.getEnabledPaymentModes === 'function') {
                const modes = WalletCore.getEnabledPaymentModes({ flow: flow });
                upsertModes(modes);
            }

            upsertModes(defaultModes);
            const merged = Array.from(modeMap.values());
            if (merged.length) return merged;

            if (isSecureWalletMode() && window.WalletCore && typeof WalletCore.fetchSecurePaymentModes === 'function') {
                try {
                    const secureModes = await WalletCore.fetchSecurePaymentModes(flow);
                    upsertModes(secureModes);
                    const backendMerged = Array.from(modeMap.values());
                    if (backendMerged.length) return backendMerged;
                } catch (error) {
                    console.warn('Secure payment mode fetch failed:', error);
                }
            }

            return defaultModes;
        }

        async function renderWalletMethodOptions() {
            const addSelect = document.getElementById('walletAddMethod');
            const withdrawSelect = document.getElementById('walletWithdrawMethod');
            if (!addSelect || !withdrawSelect) return;

            const [addModes, withdrawModes] = await Promise.all([
                getWalletMethodOptions('add_money'),
                getWalletMethodOptions('withdrawal')
            ]);

            addSelect.innerHTML = addModes.map((mode) => '<option value="' + mode.id + '">' + mode.label + '</option>').join('');
            withdrawSelect.innerHTML = withdrawModes.map((mode) => '<option value="' + mode.id + '">' + mode.label + '</option>').join('');
        }

        async function renderWalletPanel(options = {}) {
            const ownerId = getCustomerWalletOwnerId();
            const forceSync = Boolean(options.forceSync);
            const skipRefresh = Boolean(options.skipRefresh);
            const balanceNode = document.getElementById('customerWalletTabBalance');
            const donationNode = document.getElementById('donationWalletTabBalance');
            const txNode = document.getElementById('walletTransactionList');
            const requestNode = document.getElementById('walletWithdrawalList');
            const modeNode = document.getElementById('walletModeStatus');
            if (!balanceNode || !donationNode || !txNode || !requestNode) return;

            if (isSecureWalletMode() && !skipRefresh) {
                await refreshSecureWalletSnapshot(forceSync);
            }

            if (modeNode) {
                const live = isSecureWalletMode();
                const paypalStatus = secureWalletSnapshot && secureWalletSnapshot.paymentGatewayStatus
                    ? secureWalletSnapshot.paymentGatewayStatus.paypal
                    : null;
                const razorpayStatus = secureWalletSnapshot && secureWalletSnapshot.paymentGatewayStatus
                    ? secureWalletSnapshot.paymentGatewayStatus.razorpay
                    : null;
                const paypalMissing = live && paypalStatus && paypalStatus.configured === false;
                const razorpayMissing = live && razorpayStatus && razorpayStatus.configured === false;
                const anyGatewayReady = live && (
                    (paypalStatus && paypalStatus.available) ||
                    (razorpayStatus && razorpayStatus.available)
                );
                modeNode.textContent = !live
                    ? 'Live payment login required. Demo/local wallet top-up is disabled.'
                    : anyGatewayReady
                        ? 'LIVE Secure Backend + secure gateway checkout active (CSRF + token + idempotency + server wallet).'
                    : paypalMissing && window.WalletCore && typeof WalletCore.getPayPalSetupMessage === 'function'
                        ? WalletCore.getPayPalSetupMessage(paypalStatus)
                    : razorpayMissing && window.WalletCore && typeof WalletCore.getRazorpaySetupMessage === 'function'
                        ? WalletCore.getRazorpaySetupMessage(razorpayStatus)
                        : 'LIVE Secure Backend + secure gateway checkout active (CSRF + token + idempotency + server wallet).';
                modeNode.style.color = live && anyGatewayReady ? '#0b8f5d' : '#b54708';
            }

            const snapshot = getWalletSnapshotForDashboard();
            balanceNode.textContent = formatInr(snapshot.customerBalance);
            donationNode.textContent = formatInr(snapshot.donationBalance);

            const allowLegacyWalletFallback = false;
            let txRows = [];
            if (isSecureWalletMode() && secureWalletSnapshot && Array.isArray(secureWalletSnapshot.transactions)) {
                txRows = secureWalletSnapshot.transactions.slice(0, 12);
            } else if (allowLegacyWalletFallback && window.WalletCore && typeof WalletCore.getTransactions === 'function') {
                txRows = WalletCore.getTransactions({ walletType: 'customer', ownerId: ownerId }).slice(0, 12);
            } else {
                txRows = [];
            }

            if (!txRows.length) {
                txNode.innerHTML = '<div class="empty-state"><p>No wallet transactions yet.</p></div>';
            } else {
                txNode.innerHTML = txRows.map((row) => {
                    const action = String(row.action || row.type || row.source || '').toLowerCase();
                    const direction = String(row.direction || '').toLowerCase();
                    const isCredit = direction === 'credit' || ['credit', 'transfer_in', 'cashback', 'added', 'topup_confirmed', 'payment_settlement'].includes(action);
                    const amount = Number(row.amount || 0);
                    const cssClass = isCredit ? 'credit' : 'debit';
                    const sign = isCredit ? '+' : '-';
                    const label = row.description || row.type || row.source || 'Wallet entry';
                    const time = new Date(row.createdAt || row.date || Date.now()).toLocaleString();
                    return '<div class="wallet-row"><div><div class="wallet-row-main">' + label + '</div><div class="wallet-row-sub">' + time + '</div></div><div class="wallet-row-amount ' + cssClass + '">' + sign + formatInr(Math.abs(amount)) + '</div></div>';
                }).join('');
            }

            let withdrawalRows = [];
            if (isSecureWalletMode() && secureWalletSnapshot && Array.isArray(secureWalletSnapshot.withdrawals)) {
                withdrawalRows = secureWalletSnapshot.withdrawals.slice(0, 12);
            } else if (allowLegacyWalletFallback && window.WalletCore && typeof WalletCore.getWithdrawalRequests === 'function') {
                withdrawalRows = WalletCore.getWithdrawalRequests({ walletType: 'customer', ownerId: ownerId }).slice(0, 12);
            }

            if (!withdrawalRows.length) {
                requestNode.innerHTML = '<div class="empty-state"><p>No withdrawal request yet.</p></div>';
            } else {
                requestNode.innerHTML = withdrawalRows.map((row) => {
                    const status = String(row.status || 'pending').replaceAll('_', ' ').toUpperCase();
                    const time = new Date(row.createdAt || Date.now()).toLocaleString();
                    return '<div class="wallet-row"><div><div class="wallet-row-main">' + (row.methodLabel || row.method || 'Withdrawal') + ' - ' + status + '</div><div class="wallet-row-sub">' + time + '</div></div><div class="wallet-row-amount debit">-' + formatInr(row.amount || 0) + '</div></div>';
                }).join('');
            }
        }

        async function initializeWalletView() {
            await renderWalletMethodOptions();
            await renderWalletPanel({ forceSync: false, skipRefresh: true });

            if (isSecureWalletMode()) {
                refreshSecureWalletSnapshot(true)
                    .then(async () => {
                        await renderWalletMethodOptions();
                        await renderWalletPanel({ forceSync: false, skipRefresh: true });
                    })
                    .catch(() => {});
            }
        }

        async function handleWalletAddMoney() {
            const amount = Number.parseFloat(document.getElementById('walletAddAmount')?.value || 0);
            const method = String(document.getElementById('walletAddMethod')?.value || '').trim();
            const ownerId = getCustomerWalletOwnerId();

            if (!Number.isFinite(amount) || amount < 10) {
                alert('Please enter valid amount (minimum Rs 10).');
                return;
            }
            if (!method) {
                alert('Please select payment method.');
                return;
            }
            if (!isSecureWalletMode() || !window.WalletCore || typeof WalletCore.startSecureTopupCheckout !== 'function') {
                alert('Real payment ke liye live login/session aur enabled online payment mode required hai. Demo/local wallet add disabled hai. Please login again and try Add Money.');
                return;
            }

            try {
                if (isSecureWalletMode() && window.WalletCore && typeof WalletCore.startSecureTopupCheckout === 'function') {
                    const clientReference = 'WEBTOPUP_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
                    const checkoutResult = await WalletCore.startSecureTopupCheckout({
                        amount,
                        paymentMode: method,
                        currency: 'INR',
                        clientReference
                    });

                    await refreshSecureWalletSnapshot(true);
                    const approvalPending = Boolean(
                        checkoutResult &&
                        checkoutResult.confirmation &&
                        (
                            checkoutResult.confirmation.approvalRequired === true ||
                            String(checkoutResult.confirmation.order?.status || '').toLowerCase() === 'pending_admin_approval'
                        )
                    );
                    window.__goindiarideTopupApprovalPending = approvalPending;
                    window.__goindiarideTopupApprovalGateway = checkoutResult.liveGateway || checkoutResult.checkout?.provider || '';
                } else if (isSecureWalletMode() && window.WalletCore && typeof WalletCore.createSecureTopupOrder === 'function') {
                    const clientReference = 'WEBTOPUP_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
                    const orderPayload = await WalletCore.createSecureTopupOrder({
                        amount,
                        paymentMode: method,
                        currency: 'INR',
                        clientReference
                    });

                    const order = orderPayload.order || orderPayload;
                    const orderId = order.orderId || order.id;

                    if (!orderId) {
                        throw new Error('Top-up order response invalid.');
                    }

                    const providerReference = prompt('Payment gateway reference / UTR enter karein (secure settlement):', '');
                    if (!providerReference || providerReference.trim().length < 5) {
                        alert('Top-up order created. Complete payment and re-submit with valid gateway reference.');
                        return;
                    }

                    await WalletCore.confirmSecureTopupOrder({
                        orderId,
                        providerReference: providerReference.trim()
                    });

                    await refreshSecureWalletSnapshot(true);
                } else if (window.WalletCore && typeof WalletCore.credit === 'function') {
                    WalletCore.credit({
                        type: 'customer',
                        ownerId: ownerId,
                        amount: amount,
                        description: 'Customer wallet top-up via ' + method,
                        actorRole: 'customer',
                        actorId: ownerId,
                        paymentMode: method
                    });

                    if (typeof WalletCore.settlePaymentToAdmin === 'function') {
                        WalletCore.settlePaymentToAdmin({
                            amount: amount,
                            sourceType: 'customer',
                            sourceOwnerId: ownerId,
                            paymentMode: method,
                            description: 'Customer top-up auto settlement',
                            actorId: ownerId
                        });
                    }

                    syncLegacyWalletStore(WalletCore.getWallet('customer', ownerId).balance);
                } else {
                    const walletKey = 'wallet_' + ownerId;
                    const legacy = JSON.parse(localStorage.getItem(walletKey) || '{"balance":0,"transactions":[]}');
                    legacy.balance = Number(legacy.balance || 0) + amount;
                    legacy.transactions = Array.isArray(legacy.transactions) ? legacy.transactions : [];
                    legacy.transactions.unshift({
                        type: 'added',
                        amount: amount,
                        description: 'Wallet top-up via ' + method,
                        date: new Date().toISOString()
                    });
                    localStorage.setItem(walletKey, JSON.stringify(legacy));
                }

                document.getElementById('walletAddAmount').value = '';
                await loadDashboard();
                await renderWalletPanel({ forceSync: false });
                if (window.__goindiarideTopupApprovalPending) {
                    const approvalGateway = String(window.__goindiarideTopupApprovalGateway || '').toLowerCase();
                    alert(approvalGateway === 'upi_app_redirect'
                        ? 'Payment request submitted. Wallet top-up admin approval queue me chala gaya hai.'
                        : 'Payment proof submitted. Wallet top-up admin approval queue me chala gaya hai.');
                } else {
                    alert('Payment reference accepted. Wallet top-up successful.');
                }
                window.__goindiarideTopupApprovalPending = false;
                window.__goindiarideTopupApprovalGateway = '';
            } catch (error) {
                alert(error.message || 'Wallet top-up failed.');
                window.__goindiarideTopupApprovalPending = false;
                window.__goindiarideTopupApprovalGateway = '';
            }
        }

        async function handleWalletWithdrawalRequest() {
            const amount = Number.parseFloat(document.getElementById('walletWithdrawAmount')?.value || 0);
            const method = String(document.getElementById('walletWithdrawMethod')?.value || '').trim();
            const destination = String(document.getElementById('walletWithdrawDestination')?.value || '').trim();
            const notes = String(document.getElementById('walletWithdrawNote')?.value || '').trim();
            const ownerId = getCustomerWalletOwnerId();

            if (!Number.isFinite(amount) || amount < 100) {
                alert('Withdrawal amount minimum Rs 100 required.');
                return;
            }
            if (!method) {
                alert('Please select withdrawal method.');
                return;
            }
            if (destination.length < 4) {
                alert('Please enter valid withdrawal destination.');
                return;
            }

            try {
                if (isSecureWalletMode() && window.WalletCore && typeof WalletCore.createSecureWithdrawalRequest === 'function') {
                    await WalletCore.createSecureWithdrawalRequest({
                        amount,
                        method,
                        destination,
                        notes
                    });

                    await refreshSecureWalletSnapshot(true);
                } else if (window.WalletCore && typeof WalletCore.createWithdrawalRequest === 'function') {
                    WalletCore.createWithdrawalRequest({
                        walletType: 'customer',
                        ownerId: ownerId,
                        amount: amount,
                        method: method,
                        destination: destination,
                        notes: notes,
                        actorRole: 'customer',
                        actorId: ownerId,
                        metadata: {
                            source: 'customer_dashboard',
                            userAgent: navigator.userAgent
                        }
                    });
                } else {
                    alert('Wallet core not available. Please refresh the page.');
                    return;
                }

                document.getElementById('walletWithdrawAmount').value = '';
                document.getElementById('walletWithdrawDestination').value = '';
                document.getElementById('walletWithdrawNote').value = '';
                await renderWalletPanel({ forceSync: false });
                alert('Withdrawal request submitted. Admin approval required.');
            } catch (error) {
                alert(error.message || 'Withdrawal request failed.');
            }
        }
