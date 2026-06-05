(function () {
    'use strict';

    var RECEIPT_PREF_KEY = 'goindiaride.customer.profile.receipt-email.v1';
    var SAFETY_CONTACT_KEY = 'goindiaride.customer.profile.safety-contact.v1';

    function safeText(value, fallback) {
        var text = String(value == null ? '' : value)
            .replace(/[<>]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        return text || fallback || '';
    }

    function isValidEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeText(value, '').toLowerCase());
    }

    function normalizePhone(value) {
        if (typeof normalizeDashboardPhoneValue === 'function') {
            return normalizeDashboardPhoneValue(value || '');
        }
        return safeText(value, '');
    }

    function getUser() {
        if (typeof currentUser !== 'undefined' && currentUser) return currentUser;
        try {
            return JSON.parse(localStorage.getItem('currentUser') || '{}') || {};
        } catch (_error) {
            return {};
        }
    }

    function getProfileSnapshot() {
        var user = getUser();
        var name = safeText(document.getElementById('profileNameInput')?.value || user.fullname || user.name, '');
        var email = safeText(document.getElementById('profileEmailInput')?.value || user.email, '');
        var savedPhone = normalizePhone(user.phone || user.mobile);
        var phone = normalizePhone(document.getElementById('profilePhoneInput')?.value || savedPhone);
        var phoneVerified = Boolean(phone && savedPhone && phone === savedPhone && (user.isPhoneVerified || user.phoneVerified));
        try {
            var runtimeProfile = JSON.parse(localStorage.getItem('goindiaride.profile.runtime') || '{}') || {};
            var runtimePhone = normalizePhone(runtimeProfile.phone || runtimeProfile.mobile || savedPhone);
            phoneVerified = phoneVerified || Boolean(phone && runtimePhone && phone === runtimePhone && (runtimeProfile.isPhoneVerified || runtimeProfile.phoneVerified));
        } catch (_error) {}
        return { name: name, email: email, phone: phone, phoneVerified: phoneVerified };
    }

    function setCardState(feature, status, state, actionLabel) {
        var card = document.querySelector('[data-profile-feature="' + feature + '"]');
        var statusNode = document.getElementById('profileFeature' + feature.charAt(0).toUpperCase() + feature.slice(1) + 'Status');
        if (feature === 'otp') statusNode = document.getElementById('profileFeatureOtpStatus');
        if (statusNode) statusNode.textContent = status;
        if (card) {
            card.setAttribute('data-state', state || 'attention');
            var action = card.querySelector('b');
            if (action && actionLabel) action.textContent = actionLabel;
        }
    }

    function refreshFeatureStates() {
        var profile = getProfileSnapshot();
        var personalReady = Boolean(profile.name && isValidEmail(profile.email) && profile.phone);
        var receiptPref = readPreference(RECEIPT_PREF_KEY);
        var safetyPref = readPreference(SAFETY_CONTACT_KEY);
        var receiptReady = isValidEmail(profile.email) && receiptPref.email === profile.email;
        var safetyReady = Boolean(profile.phone && profile.phoneVerified && safetyPref.phone === profile.phone);
        var secureBadge = document.querySelector('.profile-secure-badge');

        setCardState('personal', personalReady ? 'Complete and ready' : 'Name, email, or mobile missing', personalReady ? 'ready' : 'attention', 'Open');
        setCardState('otp', profile.phoneVerified ? 'Mobile verified' : 'OTP verification required', profile.phoneVerified ? 'ready' : 'attention', profile.phoneVerified ? 'Verified' : 'Verify');
        setCardState('receipts', receiptReady ? 'Receipts will go to ' + profile.email : (isValidEmail(profile.email) ? 'Tap to save receipt email' : 'Add valid email first'), receiptReady ? 'ready' : 'attention', receiptReady ? 'Ready' : 'Save');
        setCardState('safety', safetyReady ? 'Emergency contact enabled' : (profile.phoneVerified ? 'Tap to enable safety contact' : 'Verify mobile first'), safetyReady ? 'ready' : 'attention', safetyReady ? 'Enabled' : 'Enable');

        if (secureBadge) {
            var hasToken = typeof getDashboardAccessToken === 'function' && Boolean(getDashboardAccessToken());
            secureBadge.innerHTML = hasToken
                ? '<i class="fas fa-lock"></i> Secure backend sync'
                : '<i class="fas fa-lock"></i> Secure local sync';
        }
    }

    function readPreference(key) {
        try {
            return JSON.parse(localStorage.getItem(key) || '{}') || {};
        } catch (_error) {
            return {};
        }
    }

    function savePreference(key, payload) {
        localStorage.setItem(key, JSON.stringify(Object.assign({}, payload, {
            updatedAt: new Date().toISOString()
        })));
        refreshFeatureStates();
    }

    function toast(message, type) {
        if (type === 'success' && typeof showSuccessToast === 'function') {
            showSuccessToast(message, 'Profile');
            return;
        }
        if (typeof showWarningToast === 'function') {
            showWarningToast(message, 'Profile');
            return;
        }
        var node = document.createElement('div');
        node.textContent = message;
        node.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2000;background:#111827;color:#fff;padding:12px 14px;border-radius:12px;box-shadow:0 14px 30px rgba(15,23,42,.22);font-weight:700;';
        document.body.appendChild(node);
        setTimeout(function () { node.remove(); }, 2600);
    }

    function focusField(selector) {
        var editor = document.querySelector('.profile-account-editor');
        var field = document.querySelector(selector);
        if (editor && typeof editor.scrollIntoView === 'function') editor.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (field) {
            setTimeout(function () {
                field.focus();
                if (typeof field.select === 'function') field.select();
            }, 260);
        }
    }

    function runPersonalDetails() {
        var profile = getProfileSnapshot();
        if (!profile.name) return focusField('#profileNameInput');
        if (!isValidEmail(profile.email)) return focusField('#profileEmailInput');
        if (!profile.phone) return focusField('#profilePhoneInput');
        focusField('#profileNameInput');
        toast('Personal details are open and ready to edit.', 'success');
    }

    async function runOtpUpdates() {
        var profile = getProfileSnapshot();
        if (!profile.phone) {
            focusField('#profilePhoneInput');
            toast('Enter mobile number first, then send OTP.', 'warning');
            return;
        }
        if (profile.phoneVerified) {
            focusField('#profilePhoneOtpInput');
            toast('Mobile is already verified. Use OTP only when changing number.', 'success');
            return;
        }
        if (typeof sendProfilePhoneOtp === 'function') {
            await sendProfilePhoneOtp();
            focusField('#profilePhoneOtpInput');
            refreshFeatureStates();
            return;
        }
        focusField('#profilePhoneOtpInput');
    }

    function runReceiptsEmail() {
        var profile = getProfileSnapshot();
        if (!isValidEmail(profile.email)) {
            focusField('#profileEmailInput');
            toast('Add a valid email to receive receipts.', 'warning');
            return;
        }
        savePreference(RECEIPT_PREF_KEY, {
            email: profile.email,
            customerName: profile.name,
            enabled: true
        });
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(profile.email).catch(function () {});
        }
        toast('Receipt email saved: ' + profile.email, 'success');
    }

    function runSafetyContact() {
        var profile = getProfileSnapshot();
        if (!profile.phone) {
            focusField('#profilePhoneInput');
            toast('Add mobile number before enabling safety contact.', 'warning');
            return;
        }
        if (!profile.phoneVerified) {
            focusField('#profilePhoneOtpInput');
            toast('Verify mobile before enabling safety contact.', 'warning');
            return;
        }
        savePreference(SAFETY_CONTACT_KEY, {
            phone: profile.phone,
            customerName: profile.name,
            enabled: true
        });
        var panel = document.querySelector('.emergency-panel');
        if (panel && typeof panel.scrollIntoView === 'function') {
            panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        toast('Safety contact enabled with verified mobile.', 'success');
    }

    function wireFeatureCards() {
        document.querySelectorAll('[data-profile-feature]').forEach(function (card) {
            if (card.dataset.profileLiveReady === '1') return;
            card.dataset.profileLiveReady = '1';
            card.addEventListener('click', function () {
                var feature = card.getAttribute('data-profile-feature');
                if (feature === 'personal') runPersonalDetails();
                if (feature === 'otp') runOtpUpdates();
                if (feature === 'receipts') runReceiptsEmail();
                if (feature === 'safety') runSafetyContact();
            });
        });
    }

    function wrapRefreshFunctions() {
        if (window.__GOINDIARIDE_PROFILE_LIVE_WRAPPED__) return;
        window.__GOINDIARIDE_PROFILE_LIVE_WRAPPED__ = true;
        ['saveProfileDetails', 'sendProfilePhoneOtp', 'verifyAndSaveProfilePhone', 'loadProfile'].forEach(function (name) {
            var original = window[name];
            if (typeof original !== 'function') return;
            window[name] = async function () {
                var result = await original.apply(this, arguments);
                setTimeout(refreshFeatureStates, 180);
                return result;
            };
        });
    }

    function boot() {
        wireFeatureCards();
        wrapRefreshFunctions();
        refreshFeatureStates();
        ['profileNameInput', 'profileEmailInput', 'profilePhoneInput', 'profilePhoneOtpInput'].forEach(function (id) {
            var node = document.getElementById(id);
            if (node) node.addEventListener('input', refreshFeatureStates);
        });
        window.addEventListener('storage', refreshFeatureStates);
        setTimeout(refreshFeatureStates, 1200);
        setTimeout(refreshFeatureStates, 2800);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }

    window.CustomerProfileLiveFeatures = {
        refresh: refreshFeatureStates,
        enableReceiptsEmail: runReceiptsEmail,
        enableSafetyContact: runSafetyContact
    };
})();
