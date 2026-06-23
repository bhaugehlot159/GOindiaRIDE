(function () {
    'use strict';

    var storageKeys = [
        'bookings',
        'goride_bookings',
        'goindiaride_active_bookings',
        'customerBookings',
        'customer_bookings',
        'goindiaride_admin_customer_bookings_current_v1',
        'goindiaride_live_customer_booking_queue_v1'
    ];
    var driverGpsTimer = null;

    function safeText(value, fallback) {
        var text = String(value == null ? '' : value)
            .replace(/[<>]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        return text || fallback || '';
    }

    function safeNumber(value, fallback) {
        var parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : (fallback || 0);
    }

    function parseJsonArray(raw) {
        try {
            var parsed = JSON.parse(raw || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch (_error) {
            return [];
        }
    }

    function getCurrentUserSafe() {
        if (typeof currentUser !== 'undefined' && currentUser) return currentUser;
        try {
            return JSON.parse(localStorage.getItem('currentUser') || '{}') || {};
        } catch (_error) {
            return {};
        }
    }

    function getRideId(ride) {
        return safeText(ride && (ride.bookingId || ride.id || ride.referenceId || ride._id), '');
    }

    function mergeRidesById(rows) {
        var map = {};
        var loose = [];
        rows.forEach(function (ride) {
            if (!ride || typeof ride !== 'object') return;
            var id = getRideId(ride);
            if (!id) {
                loose.push(ride);
                return;
            }
            map[id] = Object.assign({}, map[id] || {}, ride);
        });
        return loose.concat(Object.keys(map).map(function (id) { return map[id]; }));
    }

    function getAllRides() {
        if (typeof getCustomerBookingsFromStore === 'function') {
            try {
                var authoritativeRows = getCustomerBookingsFromStore();
                if (Array.isArray(authoritativeRows)) {
                    return authoritativeRows.slice().sort(function (a, b) {
                        return new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime();
                    });
                }
            } catch (_error) {}
        }

        var bridge = window.__GOINDIARIDE_CUSTOMER_RUNTIME_BRIDGE__;
        var bridgeRows = Array.isArray(window.__GOINDIARIDE_CUSTOMER_DASHBOARD_BOOKINGS__)
            ? window.__GOINDIARIDE_CUSTOMER_DASHBOARD_BOOKINGS__
            : [];
        var localRows = [];
        storageKeys.forEach(function (key) {
            localRows = localRows.concat(parseJsonArray(localStorage.getItem(key)));
        });
        var rows = mergeRidesById(bridgeRows.concat(localRows));
        if (bridge && typeof bridge.getBookings === 'function') {
            bridge.getBookings({ forceSync: false, background: true })
                .then(function () { setTimeout(refreshCommandCenter, 80); })
                .catch(function () {});
        }
        return rows.sort(function (a, b) {
            return new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime();
        });
    }

    function findRide(rideId) {
        var target = safeText(rideId, '');
        if (!target) return null;
        var bridge = window.__GOINDIARIDE_CUSTOMER_RUNTIME_BRIDGE__;
        if (bridge && typeof bridge.findRideById === 'function') {
            var bridged = bridge.findRideById(target);
            if (bridged) return bridged;
        }
        return getAllRides().find(function (ride) {
            return [ride.id, ride.bookingId, ride.referenceId, ride._id].map(function (value) {
                return safeText(value, '');
            }).indexOf(target) >= 0;
        }) || null;
    }

    function formatInrLive(amount) {
        try {
            return new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency: 'INR',
                maximumFractionDigits: 2
            }).format(safeNumber(amount, 0));
        } catch (_error) {
            return 'Rs ' + safeNumber(amount, 0).toFixed(2);
        }
    }

    function getRideBuckets() {
        var rides = getAllRides();
        var active = rides.filter(function (ride) {
            var status = safeText(ride.status, '').toLowerCase();
            return status !== 'completed' && status !== 'cancelled';
        });
        var completed = rides.filter(function (ride) {
            return safeText(ride.status, '').toLowerCase() === 'completed';
        });
        return { rides: rides, active: active, completed: completed };
    }

    function getWalletLabel() {
        var secure = typeof isSecureWalletMode === 'function' && isSecureWalletMode();
        var balanceNode = document.getElementById('walletBalance');
        var balance = balanceNode ? safeText(balanceNode.textContent, 'Rs 0.00') : 'Rs 0.00';
        return secure ? 'Live backend ready - ' + balance : 'Login needed - ' + balance;
    }

    function ensureCommandCenter() {
        if (document.getElementById('dashboardLiveCommand')) return;
        var header = document.querySelector('.header-section');
        var stats = document.querySelector('.stats-grid');
        if (!header || !stats || !header.parentNode) return;

        var node = document.createElement('section');
        node.id = 'dashboardLiveCommand';
        node.className = 'dashboard-live-command';
        node.setAttribute('aria-label', 'Live customer dashboard command center');
        node.innerHTML =
            '<div class="live-command-status">' +
                liveStatusMarkup('liveBackendStatus', 'Backend sync', 'Checking...', 'attention') +
                liveStatusMarkup('liveRideStatus', 'Ride operations', 'Checking...', 'attention') +
                liveStatusMarkup('liveWalletStatus', 'Wallet payments', 'Checking...', 'attention') +
                liveStatusMarkup('liveSupportStatus', 'Support center', 'Ready', 'ready') +
            '</div>' +
            '<div class="live-feature-grid">' +
                featureMarkup('route', 'Live tracking', 'Open active ride tracking, driver status, and share-trip tools.', 'Track Ride', 'tracking') +
                featureMarkup('receipt', 'History & receipts', 'View completed rides, download receipt details, and submit ratings.', 'Open History', 'history') +
                featureMarkup('wallet', 'Wallet & payments', 'Check balance, payment mode status, top-up, and withdrawal queue.', 'Open Wallet', 'wallet') +
                featureMarkup('comments', 'Messages', 'Driver chat and customer support conversations stay one tap away.', 'Open Messages', 'messages') +
                featureMarkup('shield-alt', 'Safety toolkit', 'SOS, police, ambulance, and admin alert actions are live.', 'Safety Panel', 'safety') +
                featureMarkup('user-check', 'Profile', 'Keep customer details and verified mobile ready for bookings.', 'Open Profile', 'profile') +
            '</div>';
        header.parentNode.insertBefore(node, stats);

        node.querySelectorAll('[data-live-action]').forEach(function (button) {
            button.addEventListener('click', function () {
                runLiveAction(button.getAttribute('data-live-action'));
            });
        });
    }

    function liveStatusMarkup(id, label, value, state) {
        return '<div class="live-status-pill" id="' + id + '" data-state="' + state + '">' +
            '<span class="live-status-label">' + label + '</span>' +
            '<strong class="live-status-value">' + value + '</strong>' +
        '</div>';
    }

    function featureMarkup(icon, title, copy, action, key) {
        return '<article class="live-feature-card" data-live-card="' + key + '">' +
            '<span class="live-feature-icon"><i class="fas fa-' + icon + '"></i></span>' +
            '<div class="live-feature-title">' + title + '</div>' +
            '<p class="live-feature-copy">' + copy + '</p>' +
            '<button type="button" class="live-feature-action" data-live-action="' + key + '">' + action + '</button>' +
        '</article>';
    }

    function setStatus(id, value, state) {
        var node = document.getElementById(id);
        if (!node) return;
        var valueNode = node.querySelector('.live-status-value');
        if (valueNode) valueNode.textContent = value;
        node.setAttribute('data-state', state || 'ready');
    }

    function refreshCommandCenter() {
        ensureCommandCenter();
        var buckets = getRideBuckets();
        var secure = typeof isSecureWalletMode === 'function' && isSecureWalletMode();
        var user = getCurrentUserSafe();
        var hasProfile = Boolean(user && (user.email || user.phone || user.fullname || user.name));
        var unreadBadge = document.getElementById('unreadBadge');
        var unread = unreadBadge ? safeNumber(unreadBadge.textContent, 0) : 0;

        setStatus('liveBackendStatus', navigator.onLine ? 'Online checks active' : 'Offline fallback active', navigator.onLine ? 'ready' : 'attention');
        setStatus('liveRideStatus', buckets.active.length ? (buckets.active.length + ' active ride' + (buckets.active.length > 1 ? 's' : '')) : (buckets.completed.length + ' completed ride' + (buckets.completed.length === 1 ? '' : 's')), buckets.active.length ? 'ready' : 'attention');
        setStatus('liveWalletStatus', getWalletLabel(), secure ? 'ready' : 'attention');
        setStatus('liveSupportStatus', unread ? (unread + ' unread message' + (unread > 1 ? 's' : '')) : (hasProfile ? 'Profile linked and ready' : 'Guest fallback ready'), 'ready');
    }

    function runLiveAction(action) {
        var buckets = getRideBuckets();
        if (action === 'tracking') {
            if (buckets.active.length) {
                openTrackingFallback(getRideId(buckets.active[0]));
            } else if (typeof goToBooking === 'function') {
                goToBooking();
            }
            return;
        }
        if (action === 'history' && typeof switchTab === 'function') return switchTab('history');
        if (action === 'wallet' && typeof switchTab === 'function') return switchTab('wallet');
        if (action === 'messages' && typeof switchTab === 'function') return switchTab('messages');
        if (action === 'profile' && typeof switchTab === 'function') return switchTab('profile');
        if (action === 'safety') {
            var panel = document.querySelector('.emergency-panel');
            if (panel && typeof panel.scrollIntoView === 'function') panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    function modalShell(title, subtitle, bodyHtml) {
        closeLiveModal();
        var modal = document.createElement('div');
        modal.className = 'live-ops-modal';
        modal.id = 'dashboardLiveOpsModal';
        modal.innerHTML =
            '<div class="live-ops-dialog" role="dialog" aria-modal="true">' +
                '<div class="live-ops-head">' +
                    '<div><h3>' + title + '</h3><p>' + subtitle + '</p></div>' +
                    '<button type="button" class="live-ops-close" data-live-close aria-label="Close"><i class="fas fa-times"></i></button>' +
                '</div>' +
                '<div class="live-ops-body">' + bodyHtml + '</div>' +
            '</div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', function (event) {
            if (event.target === modal || event.target.closest('[data-live-close]')) closeLiveModal();
        });
        return modal;
    }

    function closeLiveModal() {
        clearDriverGpsTimer();
        var existing = document.getElementById('dashboardLiveOpsModal');
        if (existing) existing.remove();
    }

    function clearDriverGpsTimer() {
        if (driverGpsTimer) {
            clearInterval(driverGpsTimer);
            driverGpsTimer = null;
        }
    }

    function rideField(label, value) {
        return '<div class="live-ops-field"><span>' + label + '</span><strong>' + safeText(value, '-').slice(0, 160) + '</strong></div>';
    }

    function driverGpsPanelMarkup() {
        return '<section class="live-driver-gps" data-live-driver-gps data-state="loading">' +
            '<div class="live-driver-gps-head">' +
                '<span><i class="fas fa-location-crosshairs"></i> Driver live GPS</span>' +
                '<strong data-driver-gps-status>Checking...</strong>' +
            '</div>' +
            '<div class="live-driver-gps-body" data-driver-gps-body>' +
                '<p>Checking assigned driver location from the live tracking backend.</p>' +
            '</div>' +
        '</section>';
    }

    function getBridge() {
        return window.__GOINDIARIDE_CUSTOMER_RUNTIME_BRIDGE__;
    }

    function formatDriverGpsTime(value) {
        var time = new Date(value || 0).getTime();
        if (!Number.isFinite(time) || !time) return 'time unavailable';
        var seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
        if (seconds < 60) return seconds + 's ago';
        var minutes = Math.round(seconds / 60);
        if (minutes < 60) return minutes + 'm ago';
        var hours = Math.round(minutes / 60);
        return hours + 'h ago';
    }

    function getDriverGpsRows(response) {
        return response && Array.isArray(response.items) ? response.items : [];
    }

    async function fetchDriverGps(rideId) {
        var bridge = getBridge();
        if (!bridge || typeof bridge.requestLiveTracking !== 'function') {
            return { ok: false, reason: 'live_tracking_bridge_unavailable' };
        }
        var id = safeText(rideId, '');
        if (!id) {
            return { ok: false, reason: 'booking_id_missing' };
        }
        return bridge.requestLiveTracking('GET', '/locations?bookingId=' + encodeURIComponent(id) + '&subjectType=driver&status=tracking&limit=5');
    }

    function renderDriverGps(modal, response, rideId) {
        var panel = modal && modal.querySelector('[data-live-driver-gps]');
        if (!panel) return;
        var statusNode = panel.querySelector('[data-driver-gps-status]');
        var bodyNode = panel.querySelector('[data-driver-gps-body]');
        if (!statusNode || !bodyNode) return;

        var rows = getDriverGpsRows(response);
        var row = rows[0];
        if (!response || response.ok === false) {
            panel.setAttribute('data-state', 'attention');
            statusNode.textContent = 'Login required';
            bodyNode.innerHTML = '<p>Driver GPS needs a signed-in booking session. Ride ' + safeText(rideId, '-') + ' is still protected.</p>';
            return;
        }
        if (!row) {
            panel.setAttribute('data-state', 'attention');
            statusNode.textContent = response.accessScope === 'customer_waiting_for_assigned_driver' ? 'Driver pending' : 'Waiting for GPS';
            bodyNode.innerHTML = '<p>No assigned driver GPS point is available yet. This will update after driver assignment and driver app tracking starts.</p>';
            return;
        }

        var lat = safeNumber(row.lat, 0);
        var lng = safeNumber(row.lng, 0);
        var accuracy = row.accuracy == null ? '-' : Math.round(safeNumber(row.accuracy, 0)) + 'm';
        var freshness = row.safety && row.safety.freshnessStatus ? row.safety.freshnessStatus : safeText(row.status, 'tracking');
        var updatedAt = row.updatedAt || row.lastReportedAt || row.capturedAt;
        var mapsUrl = 'https://www.google.com/maps?q=' + encodeURIComponent(lat.toFixed(6) + ',' + lng.toFixed(6));
        var embedUrl = 'https://maps.google.com/maps?q=' + encodeURIComponent(lat.toFixed(6) + ',' + lng.toFixed(6)) + '&z=15&output=embed';

        panel.setAttribute('data-state', freshness === 'fresh' || freshness === 'warm' ? 'ready' : 'attention');
        statusNode.textContent = freshness + ' | ' + formatDriverGpsTime(updatedAt);
        bodyNode.innerHTML =
            '<iframe class="live-driver-map" title="Assigned driver live location" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="' + embedUrl + '"></iframe>' +
            '<div class="live-driver-gps-meta">' +
                '<span>Lat ' + lat.toFixed(6) + '</span>' +
                '<span>Lng ' + lng.toFixed(6) + '</span>' +
                '<span>Accuracy ' + accuracy + '</span>' +
                '<span>Updated ' + formatDriverGpsTime(updatedAt) + '</span>' +
            '</div>' +
            '<a class="live-driver-map-link" href="' + mapsUrl + '" target="_blank" rel="noopener"><i class="fas fa-map-location-dot"></i> Open driver on map</a>';
    }

    function startDriverGpsRefresh(modal, rideId) {
        clearDriverGpsTimer();
        var id = safeText(rideId, '');
        if (!id || !modal) return;
        var refresh = async function () {
            if (!document.body.contains(modal)) {
                clearDriverGpsTimer();
                return;
            }
            renderDriverGps(modal, await fetchDriverGps(id), id);
        };
        refresh();
        driverGpsTimer = setInterval(refresh, 15000);
    }

    function openTrackingFallback(rideId) {
        var ride = findRide(rideId) || {};
        var id = getRideId(ride) || safeText(rideId, 'Ride');
        var status = safeText(ride.status, 'pending').toLowerCase();
        var activeIndex = status.indexOf('driver') >= 0 ? 1 : status.indexOf('trip') >= 0 || status.indexOf('started') >= 0 ? 2 : status.indexOf('completed') >= 0 ? 3 : 0;
        var body =
            '<div class="live-trip-progress">' +
                ['Booked', 'Driver assigned', 'On trip', 'Completed'].map(function (step, index) {
                    return '<div class="live-trip-step ' + (index <= activeIndex ? 'is-active' : '') + '">' + step + '</div>';
                }).join('') +
            '</div>' +
            '<div class="live-ops-grid">' +
                rideField('Ride ID', id) +
                rideField('Status', safeText(ride.status, 'Pending admin or driver update')) +
                rideField('Pickup', ride.pickup || ride.pickupLocation) +
                rideField('Drop', ride.dropoff || ride.dropLocation || ride.drop) +
                rideField('Fare', formatInrLive(ride.totalFare || ride.fare || ride.amount || 0)) +
                rideField('Vehicle', ride.vehicleType || ride.rideType || 'Assigned after approval') +
            '</div>' +
            driverGpsPanelMarkup() +
            '<div class="live-ops-actions">' +
                '<button type="button" data-live-refresh-driver><i class="fas fa-arrows-rotate"></i> Refresh Driver GPS</button>' +
                '<button type="button" data-live-share><i class="fas fa-share-alt"></i> Share Trip</button>' +
                '<button type="button" data-live-safety><i class="fas fa-shield-alt"></i> Open Safety</button>' +
                '<button type="button" data-live-copy><i class="fas fa-copy"></i> Copy Ride ID</button>' +
            '</div>';
        var modal = modalShell('Live Trip Tracking', 'Runtime tracking is connected. If live GPS is delayed, this panel shows the latest synced ride state.', body);
        startDriverGpsRefresh(modal, id);
        modal.querySelector('[data-live-refresh-driver]')?.addEventListener('click', async function () {
            renderDriverGps(modal, await fetchDriverGps(id), id);
        });
        modal.querySelector('[data-live-share]')?.addEventListener('click', function () {
            var text = 'GO India RIDE trip ' + id + ': ' + safeText(ride.pickup || ride.pickupLocation, 'Pickup') + ' to ' + safeText(ride.dropoff || ride.dropLocation || ride.drop, 'Drop') + '. Status: ' + safeText(ride.status, 'Pending') + '.';
            window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
        });
        modal.querySelector('[data-live-safety]')?.addEventListener('click', function () {
            closeLiveModal();
            runLiveAction('safety');
        });
        modal.querySelector('[data-live-copy]')?.addEventListener('click', function () {
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(id).catch(function () {});
            toast('Ride ID copied: ' + id, 'success');
        });
    }

    function openReceiptModal(rideId) {
        var ride = findRide(rideId) || {};
        var id = getRideId(ride) || safeText(rideId, 'Ride');
        var body =
            '<div class="live-ops-grid">' +
                rideField('Receipt ID', id) +
                rideField('Date', new Date(ride.createdAt || ride.updatedAt || Date.now()).toLocaleString()) +
                rideField('Pickup', ride.pickup || ride.pickupLocation) +
                rideField('Drop', ride.dropoff || ride.dropLocation || ride.drop) +
                rideField('Distance', safeNumber(ride.distance || ride.distanceKm, 0) + ' km') +
                rideField('Total fare', formatInrLive(ride.totalFare || ride.fare || ride.amount || 0)) +
            '</div>' +
            '<div class="live-ops-actions">' +
                '<button type="button" data-live-print><i class="fas fa-print"></i> Print Receipt</button>' +
                '<button type="button" data-live-copy><i class="fas fa-copy"></i> Copy Summary</button>' +
                '<button type="button" data-live-history><i class="fas fa-history"></i> Ride History</button>' +
            '</div>';
        var modal = modalShell('Ride Receipt', 'Receipt details are loaded from your latest synced dashboard ride record.', body);
        modal.querySelector('[data-live-print]')?.addEventListener('click', function () { window.print(); });
        modal.querySelector('[data-live-copy]')?.addEventListener('click', function () {
            var text = 'Receipt ' + id + ' | ' + safeText(ride.pickup || ride.pickupLocation, '-') + ' to ' + safeText(ride.dropoff || ride.dropLocation || ride.drop, '-') + ' | ' + formatInrLive(ride.totalFare || ride.fare || ride.amount || 0);
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(function () {});
            toast('Receipt summary copied.', 'success');
        });
        modal.querySelector('[data-live-history]')?.addEventListener('click', function () {
            closeLiveModal();
            if (typeof switchTab === 'function') switchTab('history');
        });
    }

    function openRatingModal(rideId) {
        var selected = 5;
        var body =
            '<div class="live-rating-row">' +
                [1, 2, 3, 4, 5].map(function (value) {
                    return '<button type="button" class="live-rating-star ' + (value === 5 ? 'is-selected' : '') + '" data-rating="' + value + '">' + value + '</button>';
                }).join('') +
            '</div>' +
            '<textarea class="live-rating-note" id="liveRatingNote" placeholder="Optional feedback for this ride"></textarea>' +
            '<div class="live-ops-actions">' +
                '<button type="button" data-live-submit><i class="fas fa-star"></i> Submit Rating</button>' +
            '</div>';
        var modal = modalShell('Rate Your Ride', 'Ratings help keep driver quality and support workflows current.', body);
        modal.querySelectorAll('[data-rating]').forEach(function (button) {
            button.addEventListener('click', function () {
                selected = safeNumber(button.getAttribute('data-rating'), 5);
                modal.querySelectorAll('[data-rating]').forEach(function (item) {
                    item.classList.toggle('is-selected', safeNumber(item.getAttribute('data-rating'), 0) <= selected);
                });
            });
        });
        modal.querySelector('[data-live-submit]')?.addEventListener('click', function () {
            var note = safeText(document.getElementById('liveRatingNote')?.value, '');
            saveRating(rideId, selected, note);
            closeLiveModal();
            toast('Thanks. Rating saved and sync queued.', 'success');
        });
    }

    function saveRating(rideId, rating, note) {
        var rows = parseJsonArray(localStorage.getItem('goindiaride_customer_ride_reviews_v1'));
        var user = getCurrentUserSafe();
        var ride = findRide(rideId) || {};
        var customerName = safeText(user.fullname || user.name || user.customerName || ride.customerName, '');
        var city = safeText(ride.dropCity || ride.pickupCity || ride.city || ride.dropoff || ride.dropLocation || ride.drop || ride.pickup || ride.pickupLocation || user.city || user.address, '');
        rows.unshift({
            rideId: safeText(rideId, 'ride'),
            rating: rating,
            comment: note,
            customerName: customerName,
            city: city,
            createdAt: new Date().toISOString(),
            syncStatus: navigator.onLine ? 'queued_for_backend' : 'offline_queue'
        });
        localStorage.setItem('goindiaride_customer_ride_reviews_v1', JSON.stringify(rows.slice(0, 50)));
        var bridge = window.__GOINDIARIDE_CUSTOMER_RUNTIME_BRIDGE__;
        if (bridge && typeof bridge.requestBusiness === 'function') {
            bridge.requestBusiness('POST', '/reviews', {
                userKey: typeof bridge.getRuntimeUserKey === 'function' ? bridge.getRuntimeUserKey() : 'customer',
                targetType: 'ride',
                targetId: safeText(rideId, 'ride'),
                rating: rating,
                comment: note,
                customerName: customerName,
                city: city,
                locale: 'en-IN'
            }).catch(function () {});
        }
    }

    function toast(message, type) {
        if (type === 'success' && typeof showSuccessToast === 'function') {
            showSuccessToast(message, 'Customer Dashboard');
            return;
        }
        if (typeof showWarningToast === 'function') {
            showWarningToast(message, 'Customer Dashboard');
            return;
        }
        var node = document.createElement('div');
        node.textContent = message;
        node.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2000;background:#111827;color:#fff;padding:12px 14px;border-radius:12px;box-shadow:0 14px 30px rgba(15,23,42,.22);font-weight:700;';
        document.body.appendChild(node);
        setTimeout(function () { node.remove(); }, 2600);
    }

    function wrapActions() {
        var existingTrack = window.trackRide;
        window.trackRide = function (rideId) {
            if (typeof existingTrack === 'function') {
                try { existingTrack.apply(this, arguments); } catch (_error) {}
            }
            setTimeout(function () {
                if (!document.getElementById('ff-runtime-card-live-tracking')) openTrackingFallback(rideId);
            }, 520);
        };

        window.viewReceipt = function (rideId) {
            openReceiptModal(rideId);
        };

        window.rateRide = function (rideId) {
            openRatingModal(rideId);
        };
    }

    function boot() {
        ensureCommandCenter();
        refreshCommandCenter();
        wrapActions();
        window.addEventListener('storage', refreshCommandCenter);
        window.addEventListener('online', refreshCommandCenter);
        window.addEventListener('offline', refreshCommandCenter);
        window.addEventListener('goindiaride:customer-bookings-updated', refreshCommandCenter);
        setInterval(refreshCommandCenter, 20000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }

    window.CustomerDashboardLiveOps = {
        refresh: refreshCommandCenter,
        openTracking: openTrackingFallback,
        openReceipt: openReceiptModal,
        openRating: openRatingModal
    };
})();
