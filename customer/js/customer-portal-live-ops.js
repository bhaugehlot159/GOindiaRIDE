(function () {
    'use strict';

    function safeText(value, fallback) {
        var text = String(value == null ? '' : value)
            .replace(/[<>]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        return text || fallback || '';
    }

    function parseRows(key) {
        try {
            var parsed = JSON.parse(localStorage.getItem(key) || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch (_error) {
            return [];
        }
    }

    function getBookingRows() {
        return [
            'goindiaride_active_bookings',
            'bookings',
            'customerBookings',
            'goindiaride_live_customer_booking_queue_v1'
        ].reduce(function (rows, key) {
            return rows.concat(parseRows(key));
        }, []);
    }

    function ensureCommandCenter() {
        if (document.getElementById('customerPortalLiveCommand')) return;
        var header = document.querySelector('.portal-page-header');
        if (!header || !header.parentNode) return;
        var node = document.createElement('section');
        node.id = 'customerPortalLiveCommand';
        node.className = 'customer-portal-live-command';
        node.setAttribute('aria-label', 'Customer portal live command center');
        node.innerHTML =
            '<div class="customer-portal-live-status">' +
                statusMarkup('portalLiveBackend', 'Backend sync', 'Checking...', 'attention') +
                statusMarkup('portalLiveBookings', 'Bookings', 'Checking...', 'attention') +
                statusMarkup('portalLiveWallet', 'Wallet', 'Ready', 'ready') +
                statusMarkup('portalLiveSupport', 'Support', 'Ready', 'ready') +
            '</div>' +
            '<div class="customer-portal-live-grid">' +
                cardMarkup('car', 'Book ride', 'Quick local, airport, rental, and outstation booking flows.', 'Book Now', 'book') +
                cardMarkup('calendar-check', 'My bookings', 'Active rides, scheduled rides, and ride history stay synced.', 'Open Bookings', 'bookings') +
                cardMarkup('wallet', 'Wallet', 'Payment wallet, donation wallet, transfer, withdraw, rewards.', 'Open Wallet', 'wallet') +
                cardMarkup('headset', 'Support', 'Booking, payment, driver, and general issue help center.', 'Open Support', 'support') +
                cardMarkup('shield-alt', 'SOS safety', 'Emergency contacts, police, ambulance, and location sharing.', 'Open SOS', 'sos') +
                cardMarkup('user-check', 'Profile', 'Customer profile, preferences, notifications, and support settings.', 'Open Profile', 'profile') +
            '</div>';
        header.insertAdjacentElement('afterend', node);
        node.querySelectorAll('[data-portal-live-action]').forEach(function (button) {
            button.addEventListener('click', function () {
                runAction(button.getAttribute('data-portal-live-action'));
            });
        });
    }

    function statusMarkup(id, label, value, state) {
        return '<div class="customer-portal-live-pill" id="' + id + '" data-state="' + state + '">' +
            '<span>' + label + '</span><strong>' + value + '</strong>' +
        '</div>';
    }

    function cardMarkup(icon, title, copy, action, key) {
        return '<article class="customer-portal-live-card">' +
            '<span class="customer-portal-live-icon"><i class="fas fa-' + icon + '"></i></span>' +
            '<div class="customer-portal-live-title">' + title + '</div>' +
            '<p class="customer-portal-live-copy">' + copy + '</p>' +
            '<button type="button" class="customer-portal-live-action" data-portal-live-action="' + key + '">' + action + '</button>' +
        '</article>';
    }

    function setStatus(id, value, state) {
        var node = document.getElementById(id);
        if (!node) return;
        var strong = node.querySelector('strong');
        if (strong) strong.textContent = value;
        node.setAttribute('data-state', state || 'ready');
    }

    function refresh() {
        ensureCommandCenter();
        var rows = getBookingRows();
        var active = rows.filter(function (ride) {
            var status = safeText(ride.status, '').toLowerCase();
            return status !== 'completed' && status !== 'cancelled';
        });
        var walletMode = window.WalletCore && typeof WalletCore.isSecureBackendReady === 'function' && WalletCore.isSecureBackendReady()
            ? 'Secure backend ready'
            : 'Local view ready';
        setStatus('portalLiveBackend', navigator.onLine ? 'Online checks active' : 'Offline queue active', navigator.onLine ? 'ready' : 'attention');
        setStatus('portalLiveBookings', active.length ? (active.length + ' active ride' + (active.length > 1 ? 's' : '')) : (rows.length + ' saved ride' + (rows.length === 1 ? '' : 's')), active.length ? 'ready' : 'attention');
        setStatus('portalLiveWallet', walletMode, 'ready');
        setStatus('portalLiveSupport', 'Help and SOS ready', 'ready');
    }

    function runAction(action) {
        if (action === 'book') {
            if (typeof openBookingModal === 'function') return openBookingModal('local');
            return showSectionFallback('homeSection');
        }
        if (action === 'bookings') return showSectionFallback('bookingsSection');
        if (action === 'wallet') return showSectionFallback('walletSection');
        if (action === 'profile') return showSectionFallback('profileSection');
        if (action === 'support') {
            if (typeof openModal === 'function') return openModal('supportChatModal');
            return showSectionFallback('profileSection');
        }
        if (action === 'sos') {
            if (typeof openModal === 'function') return openModal('sosModal');
            var sos = document.getElementById('sosButton');
            if (sos) sos.click();
        }
    }

    function showSectionFallback(sectionId) {
        if (typeof showSection === 'function') {
            showSection(sectionId);
            return;
        }
        document.querySelectorAll('.section').forEach(function (section) {
            section.classList.toggle('active', section.id === sectionId);
        });
        document.querySelectorAll('.bottom-nav .nav-btn').forEach(function (button) {
            button.classList.toggle('active', button.getAttribute('data-section') === sectionId);
        });
    }

    function boot() {
        ensureCommandCenter();
        refresh();
        window.addEventListener('storage', refresh);
        window.addEventListener('online', refresh);
        window.addEventListener('offline', refresh);
        window.addEventListener('goindiaride:customer-bookings-updated', refresh);
        setInterval(refresh, 22000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }

    window.CustomerPortalLiveOps = {
        refresh: refresh,
        runAction: runAction
    };
})();
