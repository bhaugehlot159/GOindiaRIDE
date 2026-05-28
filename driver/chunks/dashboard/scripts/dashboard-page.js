                let currentDriver = null;
        let isOnline = true;
        let secureDriverWalletSnapshot = null;
        let secureDriverWalletSyncedAt = 0;

        window.addEventListener('load', async function() {
            console.log('📄 Driver Dashboard Loading');

            const storedDriver = localStorage.getItem('currentDriver');
            const storedRole = localStorage.getItem('userRole');

            if (!storedDriver || storedRole !== 'driver') {
                console.log('❌ Not logged in');
                alert('❌ Please login as driver first');
                window.location.href = '/pages/login.html';
                return;
            }

            currentDriver = JSON.parse(storedDriver);
            console.log('✅ Driver logged in:', currentDriver.name);

            await loadDashboard();
            loadRides();
            loadProfile();
            loadEarnings();
            loadRatings();
            ensureDriverAlertsPanel();
            renderDriverAlerts();
            await initializeDriverWalletView();

            setInterval(async () => {
                loadRides();
                await loadDashboard();
                renderDriverAlerts();
                const walletTab = document.getElementById('walletTab');
                if (walletTab && walletTab.classList.contains('active')) {
                    await renderDriverWalletPanel({ forceSync: false });
                }
            }, 15000);
        });

        async function loadDashboard() {
            if (isSecureDriverWalletMode()) {
                await refreshSecureDriverWalletSnapshot(false);
            }

            const bookings = JSON.parse(localStorage.getItem('bookings')) || [];
            const driverBookings = bookings.filter(b => b.driverId === currentDriver.id);
            const completedBookings = driverBookings.filter(b => b.status === 'completed');

            const today = new Date().toDateString();
            const todayBookings = completedBookings.filter(b => new Date(b.createdAt).toDateString() === today);

            const todayEarnings = todayBookings.reduce((sum, b) => sum + ((b.totalFare || 0) * 0.7), 0);
            const totalEarnings = completedBookings.reduce((sum, b) => sum + ((b.totalFare || 0) * 0.7), 0);

            document.getElementById('welcomeMsg').textContent = `Welcome back, ${currentDriver.name}!`;
            document.getElementById('userName').textContent = currentDriver.name;
            document.getElementById('todayEarnings').textContent = `₹${Math.round(todayEarnings)}`;
            document.getElementById('todayRides').textContent = todayBookings.length;
            document.getElementById('totalEarnings').textContent = `₹${Math.round(totalEarnings)}`;
            document.getElementById('totalRides').textContent = completedBookings.length;

            const ratings = JSON.parse(localStorage.getItem(`ratings_${currentDriver.id}`)) || [];
            if (ratings.length > 0) {
                const avgRating = (ratings.reduce((a, b) => a + b.rating, 0) / ratings.length).toFixed(1);
                document.getElementById('avgRating').textContent = `${avgRating} ⭐`;
                document.getElementById('ratingCount').textContent = `${ratings.length} ratings`;
            }

            const initials = currentDriver.name.split(' ').map(n => n[0]).join('').toUpperCase();
            document.getElementById('userAvatar').textContent = initials;

            const walletSummaryNode = document.getElementById('driverWalletBalanceSummary');
            if (walletSummaryNode) {
                const snapshot = getDriverWalletSnapshot();
                walletSummaryNode.textContent = formatWalletCurrency(snapshot.driverBalance || 0);
            }
        }

        function formatWalletCurrency(amount) {
            const value = Number(amount || 0);
            return new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency: 'INR',
                maximumFractionDigits: 2
            }).format(value);
        }

        function getDriverWalletOwnerId() {
            if (!currentDriver) return 'driver_default';
            return String(currentDriver.id || currentDriver.driverId || 'driver_default');
        }

        function isSecureDriverWalletMode() {
            return Boolean(
                window.WalletCore &&
                typeof WalletCore.isSecureBackendReady === 'function' &&
                WalletCore.isSecureBackendReady()
            );
        }

        function syncDriverLegacyWalletStore(balance, transactions = []) {
            const normalizedBalance = Number(balance || 0);
            const legacyRows = Array.isArray(transactions)
                ? transactions.map((row) => ({
                    type: row.source || row.action || row.type || 'wallet_entry',
                    amount: Number(row.amount || 0),
                    description: row.description || row.methodLabel || row.method || 'Wallet transaction',
                    date: row.createdAt || row.date || new Date().toISOString()
                }))
                : [];

            localStorage.setItem('wallet_data', JSON.stringify({
                balance: normalizedBalance,
                transactions: legacyRows.slice(0, 100)
            }));
        }

        async function refreshSecureDriverWalletSnapshot(forceSync = false) {
            if (!isSecureDriverWalletMode() || !window.WalletCore || typeof WalletCore.fetchSecureWalletSnapshot !== 'function') {
                return null;
            }

            if (!forceSync && secureDriverWalletSnapshot && Date.now() - secureDriverWalletSyncedAt < 15000) {
                return secureDriverWalletSnapshot;
            }

            try {
                const payload = await WalletCore.fetchSecureWalletSnapshot();
                secureDriverWalletSnapshot = payload || null;
                secureDriverWalletSyncedAt = Date.now();
                return secureDriverWalletSnapshot;
            } catch (error) {
                console.warn('Secure driver wallet snapshot failed:', error);
                return secureDriverWalletSnapshot;
            }
        }

        function getDriverWalletSnapshot() {
            const liveMode = isSecureDriverWalletMode();

            if (liveMode && secureDriverWalletSnapshot && secureDriverWalletSnapshot.wallet) {
                const driverBalance = Number(secureDriverWalletSnapshot.wallet.balance || 0);
                syncDriverLegacyWalletStore(driverBalance, secureDriverWalletSnapshot.transactions || []);
                return {
                    driverBalance
                };
            }

            if (!liveMode) {
                return {
                    driverBalance: 0
                };
            }

            return {
                driverBalance: 0
            };

            const ownerId = getDriverWalletOwnerId();
            if (window.WalletCore && typeof WalletCore.getWallet === 'function') {
                const wallet = WalletCore.getWallet('driver', ownerId);
                syncDriverLegacyWalletStore(wallet.balance || 0, WalletCore.getTransactions({ walletType: 'driver', ownerId }).slice(0, 30));
                return {
                    driverBalance: Number(wallet.balance || 0)
                };
            }

            const fallback = JSON.parse(localStorage.getItem('wallet_data') || '{"balance":0}');
            return {
                driverBalance: Number(fallback.balance || 0)
            };
        }

        async function getDriverWalletMethodOptions(flow) {
            if (!isSecureDriverWalletMode()) {
                return [{
                    id: flow === 'add_money' ? 'live_payment_required' : '',
                    label: flow === 'add_money' ? 'Live payment login required' : 'Live wallet login required'
                }];
            }

            if (isSecureDriverWalletMode() && window.WalletCore && typeof WalletCore.fetchSecurePaymentModes === 'function') {
                try {
                    const secureModes = await WalletCore.fetchSecurePaymentModes(flow);
                    if (Array.isArray(secureModes) && secureModes.length) {
                        return secureModes.map((mode) => ({
                            id: String(mode.id || ''),
                            label: String(mode.label || mode.id || 'Payment Mode')
                        }));
                    }
                } catch (error) {
                    console.warn('Driver wallet payment mode fetch failed:', error);
                }
            }

            if (flow === 'withdrawal') {
                return [
                    { id: 'imps', label: 'IMPS Transfer (India)' },
                    { id: 'neft_rtgs', label: 'NEFT / RTGS (India)' },
                    { id: 'paypal', label: 'PayPal (International)' },
                    { id: 'swift_wire', label: 'SWIFT Wire (International)' },
                    { id: 'sepa', label: 'SEPA Transfer (International)' },
                    { id: 'ach', label: 'ACH Transfer (International)' },
                    { id: 'wise', label: 'Wise Transfer (International)' }
                ];
            }

            return [
                { id: 'upi_intent', label: 'UPI Intent (India)' },
                { id: 'upi_qr', label: 'UPI QR Scan (India)' },
                { id: 'bharat_qr', label: 'Bharat QR (India)' },
                { id: 'rupay_card', label: 'RuPay Card (India)' },
                { id: 'net_banking', label: 'Net Banking (India)' },
                { id: 'razorpay', label: 'Razorpay Gateway (India)' },
                { id: 'cashfree', label: 'Cashfree Gateway (India)' },
                { id: 'visa_master_amex', label: 'Visa / MasterCard / Amex (Global)' },
                { id: 'stripe_cards', label: 'Stripe Cards (International)' },
                { id: 'paypal', label: 'PayPal Checkout (International)' },
                { id: 'apple_pay', label: 'Apple Pay (International)' },
                { id: 'google_pay_intl', label: 'Google Pay International' },
                { id: 'alipay', label: 'Alipay (International)' },
                { id: 'wechat_pay', label: 'WeChat Pay (International)' },
                { id: 'international_qr', label: 'International QR' }
            ];
        }

        async function renderDriverWalletMethodOptions() {
            const addSelect = document.getElementById('driverWalletAddMethod');
            const withdrawSelect = document.getElementById('driverWalletWithdrawMethod');
            if (!addSelect || !withdrawSelect) return;

            const addModes = await getDriverWalletMethodOptions('add_money');
            const withdrawModes = await getDriverWalletMethodOptions('withdrawal');

            addSelect.innerHTML = addModes.map((mode) => `<option value="${mode.id}">${mode.label}</option>`).join('');
            withdrawSelect.innerHTML = withdrawModes.map((mode) => `<option value="${mode.id}">${mode.label}</option>`).join('');
        }

        async function renderDriverWalletPanel(options = {}) {
            const modeNode = document.getElementById('driverWalletModeStatus');
            const balanceNode = document.getElementById('driverWalletTabBalance');
            const pendingNode = document.getElementById('driverWalletPendingCount');
            const txNode = document.getElementById('driverWalletTransactionList');
            const withdrawNode = document.getElementById('driverWalletWithdrawalList');

            if (!balanceNode || !pendingNode || !txNode || !withdrawNode) return;

            const liveMode = isSecureDriverWalletMode();

            if (liveMode) {
                await refreshSecureDriverWalletSnapshot(Boolean(options.forceSync));
            }

            if (modeNode) {
                const paypalStatus = secureDriverWalletSnapshot && secureDriverWalletSnapshot.paymentGatewayStatus
                    ? secureDriverWalletSnapshot.paymentGatewayStatus.paypal
                    : null;
                const razorpayStatus = secureDriverWalletSnapshot && secureDriverWalletSnapshot.paymentGatewayStatus
                    ? secureDriverWalletSnapshot.paymentGatewayStatus.razorpay
                    : null;
                const paypalMissing = liveMode && paypalStatus && paypalStatus.configured === false;
                const razorpayMissing = liveMode && razorpayStatus && razorpayStatus.configured === false;
                const anyGatewayReady = liveMode && (
                    (paypalStatus && paypalStatus.available) ||
                    (razorpayStatus && razorpayStatus.available)
                );
                modeNode.textContent = !liveMode
                    ? 'Secure backend session not found. Please login again to use live wallet actions.'
                    : anyGatewayReady
                        ? 'LIVE secure backend + secure gateway checkout active. Payment methods and withdrawal approvals are controlled by admin.'
                    : paypalMissing && window.WalletCore && typeof WalletCore.getPayPalSetupMessage === 'function'
                        ? WalletCore.getPayPalSetupMessage(paypalStatus)
                    : razorpayMissing && window.WalletCore && typeof WalletCore.getRazorpaySetupMessage === 'function'
                        ? WalletCore.getRazorpaySetupMessage(razorpayStatus)
                        : 'LIVE secure backend + secure gateway checkout active. Payment methods and withdrawal approvals are controlled by admin.';
                modeNode.style.color = liveMode && anyGatewayReady ? '#0b8f5d' : '#b54708';
            }

            const ownerId = getDriverWalletOwnerId();
            const snapshot = getDriverWalletSnapshot();
            balanceNode.textContent = formatWalletCurrency(snapshot.driverBalance || 0);

            const allowLegacyWalletFallback = false;
            let txRows = [];
            if (liveMode && secureDriverWalletSnapshot && Array.isArray(secureDriverWalletSnapshot.transactions)) {
                txRows = secureDriverWalletSnapshot.transactions.slice(0, 15);
            } else if (allowLegacyWalletFallback && window.WalletCore && typeof WalletCore.getTransactions === 'function') {
                txRows = WalletCore.getTransactions({ walletType: 'driver', ownerId }).slice(0, 15);
            } else {
                txRows = [];
            }

            if (!txRows.length) {
                txNode.innerHTML = '<div class="empty-state"><p>No wallet transactions yet.</p></div>';
            } else {
                txNode.innerHTML = txRows.map((row) => {
                    const action = String(row.action || row.type || row.source || '').toLowerCase();
                    const direction = String(row.direction || '').toLowerCase();
                    const isCredit = direction === 'credit' || ['credit', 'transfer_in', 'topup_confirmed', 'payment_settlement', 'earning', 'add_money'].includes(action);
                    const amount = Number(row.amount || 0);
                    const label = row.description || row.source || row.type || 'Wallet entry';
                    const time = new Date(row.createdAt || row.date || Date.now()).toLocaleString();
                    return `<div class="wallet-row"><div><div class="wallet-row-main">${label}</div><div class="wallet-row-sub">${time}</div></div><div class="wallet-row-amount ${isCredit ? 'credit' : 'debit'}">${isCredit ? '+' : '-'}${formatWalletCurrency(Math.abs(amount))}</div></div>`;
                }).join('');
            }

            let withdrawalRows = [];
            if (liveMode && secureDriverWalletSnapshot && Array.isArray(secureDriverWalletSnapshot.withdrawals)) {
                withdrawalRows = secureDriverWalletSnapshot.withdrawals.slice(0, 15);
            } else if (allowLegacyWalletFallback && window.WalletCore && typeof WalletCore.getWithdrawalRequests === 'function') {
                withdrawalRows = WalletCore.getWithdrawalRequests({ walletType: 'driver', ownerId }).slice(0, 15);
            }

            pendingNode.textContent = String(withdrawalRows.filter((row) => String(row.status || '').toLowerCase() === 'pending_admin_approval').length);

            if (!withdrawalRows.length) {
                withdrawNode.innerHTML = '<div class="empty-state"><p>No withdrawal request yet.</p></div>';
            } else {
                withdrawNode.innerHTML = withdrawalRows.map((row) => {
                    const status = String(row.status || 'pending').replaceAll('_', ' ').toUpperCase();
                    const method = row.methodLabel || row.method || 'Withdrawal';
                    const time = new Date(row.createdAt || Date.now()).toLocaleString();
                    return `<div class="wallet-row"><div><div class="wallet-row-main">${method} <span class="wallet-badge">${status}</span></div><div class="wallet-row-sub">${time}</div></div><div class="wallet-row-amount debit">-${formatWalletCurrency(row.amount || 0)}</div></div>`;
                }).join('');
            }
        }

        async function initializeDriverWalletView() {
            await renderDriverWalletMethodOptions();
            await renderDriverWalletPanel({ forceSync: true });
        }

        async function handleDriverWalletAddMoney() {
            const amount = Number.parseFloat(document.getElementById('driverWalletAddAmount')?.value || 0);
            const method = String(document.getElementById('driverWalletAddMethod')?.value || '').trim();
            const providerReference = String(document.getElementById('driverWalletGatewayRef')?.value || '').trim();

            if (!isSecureDriverWalletMode()) {
                showError('Secure backend session required. Please login again.');
                return;
            }
            if (!window.WalletCore || typeof WalletCore.startSecureTopupCheckout !== 'function') {
                showError('Real payment ke liye enabled online payment mode required hai. Demo/manual wallet top-up disabled hai. Please hard refresh and login again.');
                return;
            }
            if (!Number.isFinite(amount) || amount < 10) {
                showError('Please enter valid amount (minimum Rs 10).');
                return;
            }
            if (!method) {
                showError('Please select payment method.');
                return;
            }

            try {
                const clientReference = `DRVTOPUP_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
                if (window.WalletCore && typeof WalletCore.startSecureTopupCheckout === 'function') {
                    const checkoutResult = await WalletCore.startSecureTopupCheckout({
                        amount,
                        paymentMode: method,
                        currency: 'INR',
                        clientReference
                    });
                    window.__goindiarideDriverTopupApprovalPending = Boolean(
                        checkoutResult &&
                        checkoutResult.confirmation &&
                        (
                            checkoutResult.confirmation.approvalRequired === true ||
                            String(checkoutResult.confirmation.order?.status || '').toLowerCase() === 'pending_admin_approval'
                        )
                    );
                    window.__goindiarideDriverTopupApprovalGateway = checkoutResult.liveGateway || checkoutResult.checkout?.provider || '';
                } else {
                    if (providerReference.length < 5) {
                        showError('Gateway reference / UTR is required for secure confirmation.');
                        return;
                    }

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

                    await WalletCore.confirmSecureTopupOrder({
                        orderId,
                        providerReference
                    });
                }

                document.getElementById('driverWalletAddAmount').value = '';
                document.getElementById('driverWalletGatewayRef').value = '';
                await refreshSecureDriverWalletSnapshot(true);
                await renderDriverWalletPanel({ forceSync: false });
                await loadDashboard();
                if (window.__goindiarideDriverTopupApprovalPending) {
                    const approvalGateway = String(window.__goindiarideDriverTopupApprovalGateway || '').toLowerCase();
                    showSuccess(approvalGateway === 'upi_app_redirect'
                        ? 'Payment request submitted. Wallet top-up admin approval queue me chala gaya hai.'
                        : 'Payment proof submitted. Wallet top-up admin approval queue me chala gaya hai.');
                } else {
                    showSuccess('Wallet top-up confirmed. Settlement is controlled by admin wallet flow.');
                }
                window.__goindiarideDriverTopupApprovalPending = false;
                window.__goindiarideDriverTopupApprovalGateway = '';
            } catch (error) {
                showError(error.message || 'Wallet top-up failed.');
                window.__goindiarideDriverTopupApprovalPending = false;
                window.__goindiarideDriverTopupApprovalGateway = '';
            }
        }

        async function handleDriverWalletWithdrawalRequest() {
            const amount = Number.parseFloat(document.getElementById('driverWalletWithdrawAmount')?.value || 0);
            const method = String(document.getElementById('driverWalletWithdrawMethod')?.value || '').trim();
            const destination = String(document.getElementById('driverWalletWithdrawDestination')?.value || '').trim();
            const notes = String(document.getElementById('driverWalletWithdrawNote')?.value || '').trim();

            if (!isSecureDriverWalletMode()) {
                showError('Secure backend session required. Please login again.');
                return;
            }
            if (!Number.isFinite(amount) || amount < 100) {
                showError('Withdrawal amount minimum Rs 100 required.');
                return;
            }
            if (!method) {
                showError('Please select withdrawal method.');
                return;
            }
            if (destination.length < 4) {
                showError('Please enter valid withdrawal destination.');
                return;
            }

            try {
                await WalletCore.createSecureWithdrawalRequest({
                    amount,
                    method,
                    destination,
                    notes
                });

                document.getElementById('driverWalletWithdrawAmount').value = '';
                document.getElementById('driverWalletWithdrawDestination').value = '';
                document.getElementById('driverWalletWithdrawNote').value = '';
                await refreshSecureDriverWalletSnapshot(true);
                await renderDriverWalletPanel({ forceSync: false });
                await loadDashboard();
                showSuccess('Withdrawal request submitted. Admin approval is required before payout.');
            } catch (error) {
                showError(error.message || 'Withdrawal request failed.');
            }
        }

        function loadRides() {
            // Use shared database if available, otherwise fall back to localStorage
            let bookings;
            if (typeof BookingDB !== 'undefined' && BookingDB.getAll) {
                bookings = BookingDB.getAll();
            } else {
                bookings = JSON.parse(localStorage.getItem('bookings')) ||
                          JSON.parse(localStorage.getItem('goride_bookings')) || [];
            }

            const driverBookings = bookings.filter(b => b.driverId === currentDriver.id);

            // Also show unassigned pending bookings
            const unassignedBookings = bookings.filter(b =>
                b.status === 'pending' && !b.driverId
            );

            const pendingRides = [...driverBookings.filter(b =>
                b.status === 'pending' || b.status === 'confirmed' ||
                b.status === 'driver_assigned' || b.status === 'active'
            ), ...unassignedBookings.slice(0, 5)]; // Show max 5 unassigned

            const completedRides = driverBookings.filter(b => b.status === 'completed');

            const pendingList = document.getElementById('pendingRidesList');
            if (pendingRides.length === 0) {
                pendingList.innerHTML = `<div class="empty-state"><i class="fas fa-inbox"></i><p>No pending rides. Check back soon!</p></div>`;
            } else {
                pendingList.innerHTML = pendingRides.map(ride => {
                    const isAssigned = ride.driverId === currentDriver.id;
                    const buttonText = isAssigned ? 'Start Ride' : 'Accept';
                    const buttonAction = isAssigned ? `startRide('${ride.id}')` : `acceptRideAction('${ride.id}')`;

                    return `
                    <div class="ride-card pending">
                        <div class="ride-info">
                            <div class="ride-route"><i class="fas fa-location-dot"></i> ${ride.pickup} → ${ride.dropoff}</div>
                            <div class="ride-details">
                                <span><i class="fas fa-calendar"></i> ${new Date(ride.createdAt).toLocaleDateString()}</span>
                                <span><i class="fas fa-tag"></i> ${ride.rideType}</span>
                                <span><i class="fas fa-money-bill"></i> ₹${Math.round((ride.totalFare || 0) * 0.7)}</span>
                            </div>
                            <div class="customer-info">
                                <strong>Customer:</strong> ${ride.customerName || 'Unknown'} | <strong>Rating:</strong> 5.0
                            </div>
                        </div>
                        <div class="ride-actions">
                            <button class="ride-btn primary" onclick="${buttonAction}"><i class="fas fa-check"></i> ${buttonText}</button>
                            ${!isAssigned ? `<button class="ride-btn" onclick="declineRide('${ride.id}')"><i class="fas fa-times"></i> Decline</button>` : ''}
                        </div>
                    </div>
                `;
                }).join('');
            }

            const completedList = document.getElementById('completedRidesList');
            if (completedRides.length === 0) {
                completedList.innerHTML = `<div class="empty-state"><i class="fas fa-inbox"></i><p>No completed rides yet</p></div>`;
            } else {
                completedList.innerHTML = completedRides.map(ride => `
                    <div class="ride-card completed">
                        <div class="ride-info">
                            <div class="ride-route"><i class="fas fa-location-dot"></i> ${ride.pickup} → ${ride.dropoff}</div>
                            <div class="ride-details">
                                <span><i class="fas fa-calendar"></i> ${new Date(ride.createdAt).toLocaleDateString()}</span>
                                <span><i class="fas fa-clock"></i> ${ride.duration || '30 mins'}</span>
                                <span><i class="fas fa-money-bill"></i> ₹${Math.round((ride.totalFare || 0) * 0.7)}</span>
                            </div>
                            <div class="customer-info">
                                <strong>Customer:</strong> ${ride.customerName || 'Unknown'} | <strong>Rating:</strong> 5.0
                            </div>
                        </div>
                    </div>
                `).join('');
            }
        }

        function loadProfile() {
            const initials = currentDriver.name.split(' ').map(n => n[0]).join('').toUpperCase();
            document.getElementById('profileAvatar').textContent = initials;
            document.getElementById('profileName').textContent = currentDriver.name;
            document.getElementById('profileEmail').textContent = currentDriver.email;
            document.getElementById('profilePhone').textContent = currentDriver.phone;

            const joinDate = new Date(currentDriver.createdAt || Date.now());
            document.getElementById('profileMemberSince').textContent = joinDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });

            document.getElementById('vehicleName').textContent = currentDriver.vehicleType || 'Vehicle';
            document.getElementById('vehicleNumber').textContent = `Registration: ${currentDriver.vehicleNumber}`;
            document.getElementById('vehicleType').textContent = currentDriver.vehicleType || 'Economy';

            const ratings = JSON.parse(localStorage.getItem(`ratings_${currentDriver.id}`)) || [];
            if (ratings.length > 0) {
                const avgRating = (ratings.reduce((a, b) => a + b.rating, 0) / ratings.length).toFixed(1);
                document.getElementById('profileRating').textContent = `${'⭐'.repeat(Math.round(avgRating))} (${avgRating})`;
            }

            document.getElementById('editName').value = currentDriver.name;
            document.getElementById('editEmail').value = currentDriver.email;
            document.getElementById('editPhone').value = currentDriver.phone;
        }

        function loadEarnings() {
            const bookings = JSON.parse(localStorage.getItem('bookings')) || [];
            const driverBookings = bookings.filter(b => b.driverId === currentDriver.id && b.status === 'completed');

            const totalEarnings = driverBookings.reduce((sum, b) => sum + ((b.totalFare || 0) * 0.7), 0);

            const today = new Date().toDateString();
            const todayEarnings = driverBookings
                .filter(b => new Date(b.createdAt).toDateString() === today)
                .reduce((sum, b) => sum + ((b.totalFare || 0) * 0.7), 0);

            document.getElementById('totalEarningsDisplay').textContent = `₹${Math.round(totalEarnings)}`;
            document.getElementById('todayEarningsDisplay').textContent = `₹${Math.round(todayEarnings)}`;

            const weekStart = new Date();
            weekStart.setDate(weekStart.getDate() - weekStart.getDay());
            const weekEarnings = driverBookings
                .filter(b => new Date(b.createdAt) >= weekStart)
                .reduce((sum, b) => sum + ((b.totalFare || 0) * 0.7), 0);
            document.getElementById('weekEarningsDisplay').textContent = `₹${Math.round(weekEarnings)}`;

            const monthStart = new Date();
            monthStart.setDate(1);
            const monthEarnings = driverBookings
                .filter(b => new Date(b.createdAt) >= monthStart)
                .reduce((sum, b) => sum + ((b.totalFare || 0) * 0.7), 0);
            document.getElementById('monthEarningsDisplay').textContent = `₹${Math.round(monthEarnings)}`;

            const detailList = document.getElementById('earningsDetail');
            if (driverBookings.length === 0) {
                detailList.innerHTML = `<div class="empty-state"><i class="fas fa-chart-bar"></i><p>No earnings data yet</p></div>`;
            } else {
                detailList.innerHTML = driverBookings.map(ride => `
                    <div style="padding: 1rem; border-bottom: 1px solid #eee; display: flex; justify-content: space-between;">
                        <div>
                            <strong>${ride.pickup} → ${ride.dropoff}</strong><br>
                            <small style="color: #999;">${new Date(ride.createdAt).toLocaleDateString()}</small>
                        </div>
                        <strong style="color: #4caf50;">+₹${Math.round((ride.totalFare || 0) * 0.7)}</strong>
                    </div>
                `).join('');
            }
        }

        function loadRatings() {
            const ratings = JSON.parse(localStorage.getItem(`ratings_${currentDriver.id}`)) || [];

            const ratingsList = document.getElementById('ratingsList');
            if (ratings.length === 0) {
                ratingsList.innerHTML = `<div class="empty-state"><i class="fas fa-star"></i><p>No ratings yet. Complete rides to get ratings!</p></div>`;
            } else {
                ratingsList.innerHTML = ratings.map(r => `
                    <div class="rating-item">
                        <div class="rating-info">
                            <div class="rating-customer">${r.customerName || 'Customer'}</div>
                            <div class="rating-date">${new Date(r.date).toLocaleDateString()}</div>
                            ${r.comment ? `<div class="rating-text">"${r.comment}"</div>` : ''}
                        </div>
                        <div class="rating-stars">${'⭐'.repeat(r.rating)}</div>
                    </div>
                `).join('');
            }
        }

        function switchTab(tabName, buttonNode) {
            document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
            document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));

            const targetTab = document.getElementById(tabName + 'Tab');
            if (targetTab) {
                targetTab.classList.add('active');
            }

            if (buttonNode) {
                buttonNode.classList.add('active');
            } else {
                const fallbackBtn = document.querySelector(`.tab-button[onclick*="'${tabName}'"]`);
                if (fallbackBtn) fallbackBtn.classList.add('active');
            }

            if (tabName === 'wallet') {
                renderDriverWalletPanel({ forceSync: true }).catch((error) => {
                    console.warn('Driver wallet render failed:', error);
                });
            }
        }
        function openEditProfileModal() {
            document.getElementById('editProfileModal').classList.add('active');
        }

        function closeEditProfileModal() {
            document.getElementById('editProfileModal').classList.remove('active');
        }

        function saveProfile(e) {
            e.preventDefault();

            currentDriver.name = document.getElementById('editName').value;
            currentDriver.email = document.getElementById('editEmail').value;
            currentDriver.phone = document.getElementById('editPhone').value;

            let drivers = JSON.parse(localStorage.getItem('drivers')) || [];
            const idx = drivers.findIndex(d => d.id === currentDriver.id);
            if (idx !== -1) {
                drivers[idx] = currentDriver;
                localStorage.setItem('drivers', JSON.stringify(drivers));
                localStorage.setItem('goride_drivers', JSON.stringify(drivers));
                localStorage.setItem('goindiaride_drivers', JSON.stringify(drivers));
                localStorage.setItem('currentDriver', JSON.stringify(currentDriver));
            }

            showSuccess('✅ Profile updated!');
            loadProfile();
            loadDashboard();
            closeEditProfileModal();
        }

        function renderDriverAlerts() {
            const host = document.getElementById('driverAlertsPanel');
            if (!host || typeof PortalAlerts === 'undefined') return;

            const alerts = PortalAlerts.getAlertsForRole('driver').slice(0, 5);
            host.innerHTML = alerts.length
                ? alerts.map((a) => `
                    <div class="portal-alert-item">
                        <strong>${a.title}</strong><div>${a.message}</div>
                        <div class="portal-alert-meta">${PortalAlerts.timeAgo(a.createdAt)}${a.rideId ? ` • Ride ${a.rideId}` : ''}</div>
                    </div>
                `).join('')
                : '<div class="portal-alert-item">No driver alerts right now.</div>';
        }

        function ensureDriverAlertsPanel() {
            if (document.getElementById('driverAlertsPanel')) return;
            const header = document.querySelector('.header-section');
            if (!header) return;

            const panel = document.createElement('div');
            panel.className = 'portal-alerts-panel';
            panel.innerHTML = '<div class="portal-alerts-title">🔔 Driver Alerts</div><div id="driverAlertsPanel"></div>';
            header.appendChild(panel);
            renderDriverAlerts();
        }

        function editVehicle() {
            alert('🚗 Vehicle edit feature coming soon!');
        }

        function acceptRide() {
            alert('🚗 Finding nearby rides...');
        }

        function acceptRideAction(rideId) {
            // Use shared database if available
            if (typeof BookingDB !== 'undefined' && BookingDB.update) {
                const booking = BookingDB.getById(rideId);
                if (booking) {
                    BookingDB.update(rideId, {
                        driverId: currentDriver.id,
                        driverName: currentDriver.name,
                        driverPhone: currentDriver.phone,
                        driverVehicle: currentDriver.vehicle,
                        status: 'driver_assigned',
                        assignedAt: new Date().toISOString()
                    });
                }
            } else {
                // Fallback to localStorage
                let bookings = JSON.parse(localStorage.getItem('bookings')) || [];
                const idx = bookings.findIndex(b => b.id === rideId);
                if (idx !== -1) {
                    bookings[idx].driverId = currentDriver.id;
                    bookings[idx].driverName = currentDriver.name;
                    bookings[idx].status = 'driver_assigned';
                    bookings[idx].assignedAt = new Date().toISOString();
                    localStorage.setItem('bookings', JSON.stringify(bookings));
                }
            }

            loadRides();
            loadDashboard();

            if (typeof PortalAlerts !== 'undefined') {
                PortalAlerts.pushAlert({
                    title: 'Driver Assigned',
                    message: `${currentDriver.name} accepted ride request.`,
                    rideId: rideId,
                    type: 'success',
                    roles: ['admin', 'customer', 'driver']
                });
                renderDriverAlerts();
            }

            if (typeof showSuccessToast === 'function') {
                showSuccessToast('Ride accepted! Customer has been notified.', 'Ride Accepted');
            } else {
                showSuccess('✅ Ride accepted!');
            }
        }

        function startRide(rideId) {
            // Update ride status to 'in_progress'
            if (typeof BookingDB !== 'undefined' && BookingDB.update) {
                BookingDB.update(rideId, {
                    status: 'ride_started',
                    startedAt: new Date().toISOString()
                });
            } else {
                let bookings = JSON.parse(localStorage.getItem('bookings')) || [];
                const idx = bookings.findIndex(b => b.id === rideId);
                if (idx !== -1) {
                    bookings[idx].status = 'ride_started';
                    bookings[idx].startedAt = new Date().toISOString();
                    localStorage.setItem('bookings', JSON.stringify(bookings));
                }
            }

            loadRides();

            if (typeof PortalAlerts !== 'undefined') {
                PortalAlerts.pushAlert({
                    title: 'Ride Started',
                    message: `${currentDriver.name} started the trip.`,
                    rideId: rideId,
                    type: 'info',
                    roles: ['admin', 'customer', 'driver']
                });
                renderDriverAlerts();
            }

            if (typeof showSuccessToast === 'function') {
                showSuccessToast('Ride has started. Have a safe journey!', 'Ride Started');
            } else {
                showSuccess('✅ Ride started!');
            }

            // Note: In production, ride completion should be manually triggered by the driver
            // For demo purposes, rides auto-complete after 30 seconds (can be disabled)
            const DEMO_MODE = true; // Set to false in production
            if (DEMO_MODE) {
                setTimeout(() => {
                    completeRide(rideId);
                }, 30000); // 30 seconds for demo
            }
        }

        function completeRide(rideId) {
            if (typeof BookingDB !== 'undefined' && BookingDB.update) {
                BookingDB.update(rideId, {
                    status: 'completed',
                    completedAt: new Date().toISOString(),
                    duration: Math.floor(Math.random() * 30) + 15 + ' mins'
                });
            } else {
                let bookings = JSON.parse(localStorage.getItem('bookings')) || [];
                const idx = bookings.findIndex(b => b.id === rideId);
                if (idx !== -1) {
                    bookings[idx].status = 'completed';
                    bookings[idx].completedAt = new Date().toISOString();
                    bookings[idx].duration = Math.floor(Math.random() * 30) + 15 + ' mins';
                    localStorage.setItem('bookings', JSON.stringify(bookings));
                }
            }

            loadRides();
            loadDashboard();

            if (typeof PortalAlerts !== 'undefined') {
                PortalAlerts.pushAlert({
                    title: 'Ride Completed',
                    message: `${currentDriver.name} completed the trip successfully.`,
                    rideId: rideId,
                    type: 'success',
                    roles: ['admin', 'customer', 'driver']
                });
                renderDriverAlerts();
            }

            if (typeof showSuccessToast === 'function') {
                showSuccessToast('Ride completed successfully!', 'Ride Completed');
            }
        }

        function declineRide(rideId) {
            if (confirm('Are you sure you want to decline this ride?')) {
                if (typeof showWarningToast === 'function') {
                    showWarningToast('Ride declined', 'Declined');
                } else {
                    showSuccess('❌ Ride declined');
                }
            }
        }

        function viewRoute() {
            alert('🗺️ Map view coming soon!');
        }

        function toggleOnlineStatus() {
            isOnline = !isOnline;
            const badge = document.getElementById('statusBadge');

            if (isOnline) {
                badge.className = 'status-badge';
                badge.innerHTML = '<i class="fas fa-circle"></i> Online';
                showSuccess('✅ You are now online');
            } else {
                badge.className = 'status-badge offline';
                badge.innerHTML = '<i class="fas fa-circle"></i> Offline';
                showSuccess('❌ You are now offline');
            }
        }

        function showSuccess(msg) {
            document.getElementById('successText').textContent = msg;
            document.getElementById('successMessage').classList.add('show');
            setTimeout(() => document.getElementById('successMessage').classList.remove('show'), 3000);
        }

        function showError(msg) {
            document.getElementById('errorText').textContent = msg;
            document.getElementById('errorMessage').classList.add('show');
            setTimeout(() => document.getElementById('errorMessage').classList.remove('show'), 3000);
        }

                function goHome() {
            window.location.href = '../index.html';
        }

        function logout() {
            if (confirm('Logout?')) {
                localStorage.removeItem('currentDriver');
                localStorage.removeItem('userRole');
                localStorage.removeItem('accessToken');
                localStorage.removeItem('authToken');
                localStorage.removeItem('token');
                alert('✅ Logged out');
                window.location.href = '/pages/login.html';
            }
        }

        window.onclick = (e) => {
            if (e.target.id === 'editProfileModal') closeEditProfileModal();
        }

        console.log('🚀 Driver Dashboard loaded');
