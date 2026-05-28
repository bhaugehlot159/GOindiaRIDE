        const ADMIN_REVIEW_INBOX_KEY = 'goindiaride_admin_review_inbox_v1';
        const ADMIN_DASHBOARD_EMAIL_BATCH_SIZE = 3;
        const ADMIN_DASHBOARD_EMAIL_INTERVAL_MS = 25000;
        let adminDashboardEmailFlushInProgress = false;

        window.addEventListener('load', () => {
            const admin = localStorage.getItem('currentAdmin');
            const role = localStorage.getItem('userRole');
            if (!admin || role !== 'admin') {
                window.location.href = '/pages/login.html';
                return;
            }
            try {
                const adminData = JSON.parse(admin);
                document.getElementById('adminName').textContent = adminData.name || 'Admin';
                document.getElementById('adminAvatar').textContent = (adminData.name || 'A')[0].toUpperCase();
            } catch (e) {
                window.location.href = '/pages/login.html';
            }
            loadDashboardData();
            ensureAdminAlertsPanel();
            renderAdminAlerts();
            ensureAdminReviewInboxPanel();
            renderAdminReviewInbox();
            flushAdminReviewInboxEmailDispatch();
            window.addEventListener('online', flushAdminReviewInboxEmailDispatch);
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    flushAdminReviewInboxEmailDispatch();
                }
            });
        });

        function loadAdminBookingsFromStore() {
            const merged = new Map();
            const sourceLists = [];

            if (typeof BookingDB !== 'undefined' && BookingDB.getAll) {
                const bookingDbItems = BookingDB.getAll();
                if (Array.isArray(bookingDbItems) && bookingDbItems.length) {
                    sourceLists.push(bookingDbItems);
                }
            }

            ['bookings', 'goride_bookings', ADMIN_REVIEW_INBOX_KEY].forEach((key) => {
                try {
                    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
                    if (Array.isArray(parsed) && parsed.length) {
                        sourceLists.push(parsed);
                    }
                } catch (_error) {
                    // Ignore malformed local data and keep checking other sources.
                }
            });

            sourceLists.forEach((items) => {
                items.forEach((item) => {
                    if (!item || typeof item !== 'object') return;
                    const bookingId = String(item.id || item.bookingId || '').trim();
                    if (!bookingId) return;
                    const existing = merged.get(bookingId) || {};
                    merged.set(bookingId, {
                        ...existing,
                        ...item,
                        id: bookingId,
                        bookingId,
                        adminEmailDispatch: {
                            ...(existing.adminEmailDispatch || {}),
                            ...((item.adminEmailDispatch && typeof item.adminEmailDispatch === 'object') ? item.adminEmailDispatch : {})
                        },
                        customerEmailDispatch: {
                            ...(existing.customerEmailDispatch || {}),
                            ...((item.customerEmailDispatch && typeof item.customerEmailDispatch === 'object') ? item.customerEmailDispatch : {})
                        }
                    });
                });
            });

            return Array.from(merged.values());
        }

        function isAdminPendingBooking(booking) {
            if (!booking || typeof booking !== 'object') return false;
            const status = String(booking.status || '').trim().toLowerCase();
            const adminReviewStatus = String(booking.adminReviewStatus || '').trim().toLowerCase();
            const backendStatus = String(booking.backendStatus || '').trim().toLowerCase();

            return (
                status === 'pending' ||
                status === 'pending_admin_review' ||
                status === 'confirmed' ||
                status === 'driver_assigned' ||
                status === 'ride_started' ||
                adminReviewStatus === 'pending' ||
                backendStatus === 'created'
            );
        }

        function formatAdminInboxTime(isoValue) {
            const time = Date.parse(String(isoValue || '').trim());
            if (!Number.isFinite(time)) return 'recent';
            const deltaMs = Math.max(0, Date.now() - time);
            const deltaMinutes = Math.floor(deltaMs / 60000);
            if (deltaMinutes < 1) return 'just now';
            if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
            const deltaHours = Math.floor(deltaMinutes / 60);
            if (deltaHours < 24) return `${deltaHours}h ago`;
            return `${Math.floor(deltaHours / 24)}d ago`;
        }

        function loadAdminReviewInboxStore() {
            try {
                const parsed = JSON.parse(localStorage.getItem(ADMIN_REVIEW_INBOX_KEY) || '[]');
                return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object') : [];
            } catch (_error) {
                return [];
            }
        }

        function saveAdminReviewInboxStore(items) {
            const normalized = Array.isArray(items)
                ? items.filter((item) => item && typeof item === 'object').slice(0, 120)
                : [];
            localStorage.setItem(ADMIN_REVIEW_INBOX_KEY, JSON.stringify(normalized));
        }

        function mergeDispatchState(existingValue, updates = {}) {
            const base = existingValue && typeof existingValue === 'object' ? existingValue : {};
            const next = updates && typeof updates === 'object' ? updates : {};
            return {
                ...base,
                ...next,
                state: String(next.state || base.state || 'pending').trim() || 'pending',
                updatedAt: next.updatedAt || base.updatedAt || new Date().toISOString()
            };
        }

        function updateAdminBookingDeliveryState(bookingId, updates = {}) {
            const safeBookingId = String(bookingId || '').trim();
            if (!safeBookingId) return null;

            ['bookings', 'goride_bookings'].forEach((key) => {
                try {
                    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
                    if (!Array.isArray(parsed)) return;
                    const idx = parsed.findIndex((item) => String(item.id || item.bookingId || '').trim() === safeBookingId);
                    if (idx === -1) return;

                    const existing = parsed[idx] || {};
                    parsed[idx] = {
                        ...existing,
                        ...updates,
                        id: safeBookingId,
                        bookingId: safeBookingId,
                        adminEmailDispatch: mergeDispatchState(existing.adminEmailDispatch, updates.adminEmailDispatch || {}),
                        customerEmailDispatch: mergeDispatchState(existing.customerEmailDispatch, updates.customerEmailDispatch || {})
                    };
                    localStorage.setItem(key, JSON.stringify(parsed));
                } catch (_error) {
                    // Ignore malformed local booking stores.
                }
            });

            const inboxItems = loadAdminReviewInboxStore();
            const idx = inboxItems.findIndex((item) => String(item.id || item.bookingId || '').trim() === safeBookingId);
            const existing = idx >= 0 ? inboxItems[idx] : {};
            const merged = {
                ...existing,
                ...updates,
                id: safeBookingId,
                bookingId: safeBookingId,
                adminEmailDispatch: mergeDispatchState(existing.adminEmailDispatch, updates.adminEmailDispatch || {}),
                customerEmailDispatch: mergeDispatchState(existing.customerEmailDispatch, updates.customerEmailDispatch || {})
            };

            if (idx >= 0) {
                inboxItems[idx] = merged;
            } else {
                inboxItems.unshift(merged);
            }

            saveAdminReviewInboxStore(inboxItems);
            return merged;
        }

        function getAdminFallbackApiBases() {
            const candidates = [];
            const host = String(window.location.hostname || '').toLowerCase();
            const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';

            const addCandidate = (value) => {
                const text = String(value || '').trim().replace(/\/$/, '');
                if (!text || candidates.includes(text)) return;
                candidates.push(text);
            };

            addCandidate(window.__GOINDIARIDE_RUNTIME_API_ORIGIN__ || window.__GOINDIARIDE_API_ORIGIN__ || '');
            addCandidate(window.GOINDIARIDE_API_BASE || '');
            addCandidate(localStorage.getItem('goindiaride_api_base') || '');
            if (isLocalHost) {
                addCandidate('http://localhost:5000');
            }
            addCandidate('https://goindiaride.onrender.com');

            return candidates;
        }

        async function adminDashboardFetchWithTimeout(url, options = {}, timeoutMs = 65000) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort('request_timeout'), timeoutMs);
            try {
                return await fetch(url, {
                    ...options,
                    signal: controller.signal
                });
            } finally {
                clearTimeout(timer);
            }
        }

        function classifyAdminDashboardRequestFailure(apiBase, error) {
            const rawMessage = String((error && error.message) || error || '').trim();
            const normalized = rawMessage.toLowerCase();
            if (normalized.includes('request_timeout') || normalized.includes('signal is aborted without reason')) {
                return 'request_timeout';
            }
            if (
                normalized.includes('failed to fetch') ||
                normalized.includes('networkerror') ||
                normalized.includes('load failed') ||
                normalized.includes('preflight') ||
                normalized.includes('blocked by cors policy') ||
                normalized.includes('access-control-allow-headers')
            ) {
                return String(apiBase || '').startsWith(window.location.origin) ? 'network_error' : 'preflight_blocked';
            }
            return rawMessage || 'server_send_failed';
        }

        function resolveAdminMailLabel(booking) {
            const state = String(booking?.adminEmailDispatch?.state || '').trim().toLowerCase();
            if (state === 'sent') return 'admin mail sent';
            if (state === 'sending') return 'admin mail sending';
            if (state === 'queued') return 'admin mail queued';
            return 'admin mail pending';
        }

        async function sendAdminInboxBookingEmail(booking, reason = 'admin_dashboard_retry') {
            if (!booking || typeof booking !== 'object') return { ok: false, reason: 'missing_booking' };
            const bookingId = String(booking.id || booking.bookingId || '').trim();
            if (!bookingId) return { ok: false, reason: 'missing_booking_id' };

            updateAdminBookingDeliveryState(bookingId, {
                adminEmailDispatch: {
                    state: 'sending',
                    reason,
                    updatedAt: new Date().toISOString()
                }
            });

            const payload = {
                bookingId,
                customerId: String(booking.customerId || '').trim(),
                customerName: String(booking.customerName || booking.customerSnapshot?.name || '').trim(),
                customerEmail: String(booking.customerEmail || booking.customerSnapshot?.email || '').trim(),
                customerPhone: String(booking.customerPhone || booking.customerSnapshot?.phone || '').trim(),
                pickup: String(booking.pickup || booking.pickupLocation || '').trim(),
                drop: String(booking.dropoff || booking.drop || booking.dropLocation || '').trim(),
                rideDate: String(booking.rideDate || '').trim(),
                rideTime: String(booking.rideTime || '').trim(),
                returnDate: String(booking.returnTrip?.returnDate || '').trim(),
                returnTime: String(booking.returnTrip?.returnTime || '').trim(),
                tripPlan: String(booking.tripPlan || '').trim(),
                paymentMethod: String(booking.paymentMethod || '').trim(),
                vehicleType: String(booking.rideType || booking.vehicleType || '').trim(),
                passengers: Number(booking.passengers || 1),
                luggage: String(booking.luggage || '').trim(),
                notes: String(booking.notes || '').trim(),
                stops: Array.isArray(booking.stops) ? booking.stops : [],
                specialRequests: booking.customerFeatures?.specialRequests || {},
                safetyAccessibility: booking.customerFeatures?.safetyAccessibility || {},
                distanceKm: Number(booking.distance || booking.distanceKm || 0),
                amount: Number(booking.totalFare || booking.amount || 0),
                currency: 'INR',
                fallbackReason: reason
            };

            const apiBases = getAdminFallbackApiBases();
            let lastReason = String(reason || 'admin_dashboard_retry').trim() || 'admin_dashboard_retry';
            for (const apiBase of apiBases) {
                try {
                    const response = await adminDashboardFetchWithTimeout(`${apiBase}/api/bookings/fallback/admin-alert-email`, {
                        method: 'POST',
                        keepalive: true,
                        cache: 'no-store',
                        headers: {
                            Accept: 'application/json',
                            'Content-Type': 'application/json',
                            'x-request-id': `gir-admin-inbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                            'x-timestamp': String(Date.now()),
                            'x-idempotency-key': `gir-admin-inbox:${bookingId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
                            'x-booking-client': 'goindiaride-web'
                        },
                        body: JSON.stringify(payload)
                    }, 65000);

                    const data = await response.json().catch(() => ({}));
                    if (response.ok && data && data.ok !== false) {
                        updateAdminBookingDeliveryState(bookingId, {
                            adminEmailDispatch: {
                                state: data.adminEmail && data.adminEmail.sent === true ? 'sent' : 'pending',
                                reason: data.adminEmail && data.adminEmail.sent === true ? '' : String(data.adminEmail?.reason || ''),
                                updatedAt: new Date().toISOString()
                            },
                            customerEmailDispatch: mergeDispatchState(
                                booking.customerEmailDispatch,
                                {
                                    state: data.customerEmail && data.customerEmail.sent === true
                                        ? 'sent'
                                        : (data.customerEmail && data.customerEmail.queued === true ? 'queued' : String(booking.customerEmailDispatch?.state || 'pending')),
                                    reason: String(data.customerEmail?.reason || ''),
                                    updatedAt: new Date().toISOString()
                                }
                            )
                        });
                        return { ok: true, data };
                    }
                    lastReason = String(data.adminEmail?.reason || data.message || `http_${response.status}`).trim() || 'server_send_failed';
                } catch (error) {
                    lastReason = classifyAdminDashboardRequestFailure(apiBase, error);
                }
            }

            updateAdminBookingDeliveryState(bookingId, {
                adminEmailDispatch: {
                    state: 'pending',
                    reason: lastReason,
                    updatedAt: new Date().toISOString()
                }
            });
            return { ok: false, reason: lastReason };
        }

        async function flushAdminReviewInboxEmailDispatch() {
            if (adminDashboardEmailFlushInProgress) return;

            const pendingItems = loadAdminBookingsFromStore()
                .filter((booking) => isAdminPendingBooking(booking))
                .filter((booking) => String(booking.adminEmailDispatch?.state || '').trim().toLowerCase() !== 'sent')
                .sort((a, b) => Date.parse(String(b.createdAt || '')) - Date.parse(String(a.createdAt || '')))
                .slice(0, ADMIN_DASHBOARD_EMAIL_BATCH_SIZE);

            if (!pendingItems.length) return;

            adminDashboardEmailFlushInProgress = true;
            try {
                for (const booking of pendingItems) {
                    await sendAdminInboxBookingEmail(booking);
                }

                if (typeof renderAdminReviewInbox === 'function') {
                    renderAdminReviewInbox();
                }
            } finally {
                adminDashboardEmailFlushInProgress = false;
            }
        }

        function loadDashboardData() {
            // Use shared database if available, otherwise fall back to localStorage
            let bookings, customers, drivers;

            bookings = loadAdminBookingsFromStore();

            if (typeof DriverDB !== 'undefined' && DriverDB.getAll) {
                drivers = DriverDB.getAll();
            } else {
                drivers = JSON.parse(localStorage.getItem('drivers')) ||
                         JSON.parse(localStorage.getItem('goride_drivers')) || [];
            }

            customers = JSON.parse(localStorage.getItem('users')) ||
                       JSON.parse(localStorage.getItem('goride_users')) || [];

            const completed = bookings.filter(b => b.status === 'completed').length;
            const pending = bookings.filter((b) => isAdminPendingBooking(b)).length;
            const cancelled = bookings.filter(b => b.status === 'cancelled').length;
            const revenue = bookings.filter(b => b.status === 'completed').reduce((sum, b) => sum + (b.totalFare || 0), 0);
            const activeDrv = drivers.filter(d => d.status === 'available' || d.isOnline).length;

            // Get total donations
            let totalDonations = 0;
            customers.forEach(c => {
                const donations = JSON.parse(localStorage.getItem('customerDonations_' + c.id)) || [];
                totalDonations += donations.reduce((sum, d) => sum + (d.amount || 0), 0);
            });

            document.getElementById('totalBookings').textContent = bookings.length;
            document.getElementById('completedRides').textContent = completed;
            document.getElementById('pendingBookings').textContent = pending;
            document.getElementById('cancelledRides').textContent = cancelled;
            document.getElementById('totalRevenue').textContent = '₹' + Math.round(revenue);
            document.getElementById('activeDrivers').textContent = activeDrv + ' / ' + drivers.length;
            document.getElementById('totalCustomers').textContent = customers.length;
            document.getElementById('totalDonations').textContent = '₹' + Math.round(totalDonations);
        }

        // Real-time sync for admin dashboard
        setInterval(() => {
            loadDashboardData();
            ensureAdminAlertsPanel();
            renderAdminAlerts();
            ensureAdminReviewInboxPanel();
            renderAdminReviewInbox();
            flushAdminReviewInboxEmailDispatch();
        }, ADMIN_DASHBOARD_EMAIL_INTERVAL_MS);

        function renderAdminAlerts() {
            const host = document.getElementById('adminAlertsPanel');
            if (!host || typeof PortalAlerts === 'undefined') return;

            const alerts = PortalAlerts.getAlertsForRole('admin').slice(0, 6);
            host.innerHTML = alerts.length
                ? alerts.map((a) => `
                    <div class="portal-alert-item">
                        <strong>${a.title}</strong><div>${a.message}</div>
                        <div class="portal-alert-meta">${PortalAlerts.timeAgo(a.createdAt)}${a.rideId ? ` • Ride ${a.rideId}` : ''}</div>
                    </div>
                `).join('')
                : '<div class="portal-alert-item">No live alerts yet.</div>';
        }

        function ensureAdminAlertsPanel() {
            if (document.getElementById('adminAlertsPanel')) return;
            const container = document.querySelector('.main-content');
            if (!container) return;

            const panel = document.createElement('div');
            panel.className = 'portal-alerts-panel';
            panel.innerHTML = '<div class="portal-alerts-title">🔔 Live Platform Alerts (Admin Control)</div><div id="adminAlertsPanel"></div>';
            container.appendChild(panel);
            renderAdminAlerts();
        }

        function renderAdminReviewInbox() {
            const host = document.getElementById('adminReviewInboxPanel');
            if (!host) return;

            const items = loadAdminBookingsFromStore()
                .filter((booking) => isAdminPendingBooking(booking))
                .sort((a, b) => Date.parse(String(b.createdAt || '')) - Date.parse(String(a.createdAt || '')))
                .slice(0, 8);

            host.innerHTML = items.length
                ? items.map((booking) => {
                    const bookingId = String(booking.id || booking.bookingId || 'RID').trim();
                    const pickup = String(booking.pickup || booking.pickupLocation || 'N/A').trim();
                    const drop = String(booking.dropoff || booking.drop || booking.dropLocation || 'N/A').trim();
                    const customerName = String(booking.customerName || booking.customerSnapshot?.name || 'Customer').trim();
                    const totalFare = Number(booking.totalFare || booking.amount || 0);
                    const mode = String(booking.mode || booking.backendStatus || 'pending_review').trim();
                    const mailLabel = resolveAdminMailLabel(booking);
                    return `
                        <div class="portal-alert-item">
                            <strong>${bookingId}</strong><div>${pickup} -> ${drop}</div>
                            <div class="portal-alert-meta">${customerName} • ₹${Math.round(totalFare)} • ${mode} • ${mailLabel} • ${formatAdminInboxTime(booking.createdAt)}</div>
                        </div>
                    `;
                }).join('')
                : '<div class="portal-alert-item">No pending admin review bookings yet.</div>';
        }

        function ensureAdminReviewInboxPanel() {
            if (document.getElementById('adminReviewInboxPanel')) return;
            const container = document.querySelector('.main-content');
            if (!container) return;

            const panel = document.createElement('div');
            panel.className = 'portal-alerts-panel';
            panel.innerHTML = '<div class="portal-alerts-title">Admin Review Inbox</div><div id="adminReviewInboxPanel"></div>';
            container.appendChild(panel);
            renderAdminReviewInbox();
        }

        function goHome() {
            window.location.href = '../index.html';
        }

        function showLogoutModal() {
            document.getElementById('logoutModal').classList.add('active');
        }

        function cancelLogout() {
            document.getElementById('logoutModal').classList.remove('active');
        }

        function confirmLogout() {
            localStorage.removeItem('currentAdmin');
            localStorage.removeItem('userRole');
                localStorage.removeItem('accessToken');
                localStorage.removeItem('authToken');
                localStorage.removeItem('token');
            localStorage.removeItem('admin2FAEmail');
            localStorage.removeItem('admin2FAOTP');
            localStorage.removeItem('admin2FAMethod');
            window.location.href = '/pages/login.html';
        }

        window.onclick = function(event) {
            const modal = document.getElementById('logoutModal');
            if (event.target === modal) {
                cancelLogout();
            }
        }
