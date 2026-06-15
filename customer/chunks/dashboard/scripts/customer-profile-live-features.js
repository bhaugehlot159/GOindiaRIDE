(function () {
    'use strict';

    var RECEIPT_PREF_KEY = 'goindiaride.customer.profile.receipt-email.v1';
    var SAFETY_CONTACT_KEY = 'goindiaride.customer.profile.safety-contact.v1';
    var activeFeature = 'personal';
    var FEATURE_META = {
        personal: { kicker: 'Profile', title: 'Personal Details' },
        otp: { kicker: 'Security', title: 'OTP Protected Updates' },
        receipts: { kicker: 'Receipts', title: 'Receipt Email' },
        safety: { kicker: 'Safety', title: 'Safety Contact' }
    };

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

    function setText(id, value) {
        var node = document.getElementById(id);
        if (node) node.textContent = value || '';
    }

    function setPanelMessage(id, message, type) {
        var node = document.getElementById(id);
        if (!node) return;
        node.textContent = message || '';
        node.dataset.state = type || '';
        if (type === 'error') node.style.color = '#b91c1c';
        else if (type === 'success') node.style.color = '#080c12';
        else if (type === 'warning') node.style.color = '#b45309';
        else node.style.color = '';
    }

    function selectFeature(feature, options) {
        var nextFeature = FEATURE_META[feature] ? feature : 'personal';
        var meta = FEATURE_META[nextFeature];
        activeFeature = nextFeature;
        var editor = document.querySelector('.profile-account-editor');
        if (editor) editor.setAttribute('data-active-profile-feature', nextFeature);
        setText('profileEditorKicker', meta.kicker);
        setText('profileEditorTitle', meta.title);

        document.querySelectorAll('[data-profile-panel]').forEach(function (panel) {
            var isActive = panel.getAttribute('data-profile-panel') === nextFeature;
            panel.classList.toggle('is-active', isActive);
            panel.hidden = !isActive;
        });

        document.querySelectorAll('[data-profile-feature]').forEach(function (card) {
            var isActive = card.getAttribute('data-profile-feature') === nextFeature;
            card.setAttribute('data-active', isActive ? 'true' : 'false');
            card.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });

        if (options && options.focusSelector) {
            focusField(options.focusSelector);
        }
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
        var personalReady = Boolean(profile.name && isValidEmail(profile.email));
        var receiptPref = readPreference(RECEIPT_PREF_KEY);
        var safetyPref = readPreference(SAFETY_CONTACT_KEY);
        var receiptReady = isValidEmail(profile.email) && receiptPref.email === profile.email;
        var safetyReady = Boolean(profile.phone && profile.phoneVerified && safetyPref.phone === profile.phone);
        var secureBadge = document.querySelector('.profile-secure-badge');

        setCardState('personal', personalReady ? 'Complete and ready' : 'Name or email missing', personalReady ? 'ready' : 'attention', 'Open');
        setCardState('otp', profile.phoneVerified ? 'Mobile verified' : 'OTP verification required', profile.phoneVerified ? 'ready' : 'attention', profile.phoneVerified ? 'Verified' : 'Verify');
        setCardState('receipts', receiptReady ? 'Receipts will go to ' + profile.email : (isValidEmail(profile.email) ? 'Tap to save receipt email' : 'Add valid email first'), receiptReady ? 'ready' : 'attention', receiptReady ? 'Ready' : 'Save');
        setCardState('safety', safetyReady ? 'Emergency contact enabled' : (profile.phoneVerified ? 'Tap to enable safety contact' : 'Verify mobile first'), safetyReady ? 'ready' : 'attention', safetyReady ? 'Enabled' : 'Enable');

        if (secureBadge) {
            var hasToken = typeof getDashboardAccessToken === 'function' && Boolean(getDashboardAccessToken());
            secureBadge.innerHTML = hasToken
                ? '<i class="fas fa-lock"></i> Secure backend sync'
                : '<i class="fas fa-lock"></i> Secure local sync';
        }

        setPanelMessage('profilePersonalPanelStatus', personalReady
            ? 'Personal details are complete. Use OTP protected updates for mobile changes.'
            : 'Add name and valid email to complete personal details.', personalReady ? 'success' : 'warning');
        setText('profileReceiptsEmailText', profile.email || 'Add email in Personal details');
        setPanelMessage('profileReceiptPanelStatus', receiptReady
            ? 'Receipt email saved for ride receipts and booking updates.'
            : (isValidEmail(profile.email) ? 'Click Save Receipt Email to use this email for receipts.' : 'Add a valid email in Personal details first.'), receiptReady ? 'success' : 'warning');
        setText('profileSafetyPhoneText', profile.phone
            ? (profile.phoneVerified ? 'Verified mobile: ' + profile.phone : 'Mobile needs OTP: ' + profile.phone)
            : 'Add mobile in OTP protected updates');
        setPanelMessage('profileSafetyPanelStatus', safetyReady
            ? 'Safety contact enabled with your verified mobile.'
            : (profile.phoneVerified ? 'Click Enable Safety Contact to use this verified mobile for support.' : 'Verify mobile in OTP protected updates first.'), safetyReady ? 'success' : 'warning');
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
        selectFeature('personal');
        var profile = getProfileSnapshot();
        if (!profile.name) return selectFeature('personal', { focusSelector: '#profileNameInput' });
        if (!isValidEmail(profile.email)) return selectFeature('personal', { focusSelector: '#profileEmailInput' });
        setPanelMessage('profilePersonalPanelStatus', 'Personal details are open. Save changes from this section only.', 'success');
    }

    async function runOtpUpdates() {
        selectFeature('otp');
        var profile = getProfileSnapshot();
        if (!profile.phone) {
            selectFeature('otp', { focusSelector: '#profilePhoneInput' });
            setPanelMessage('profilePhoneUpdateStatus', 'Enter mobile number first, then use Send OTP.', 'warning');
            return;
        }
        if (profile.phoneVerified) {
            setPanelMessage('profilePhoneUpdateStatus', 'Mobile already verified. Use Send OTP only after changing the mobile number.', 'success');
            return;
        }
        setPanelMessage('profilePhoneUpdateStatus', 'Click Send OTP, then enter the code here.', 'warning');
    }

    function runReceiptsEmail() {
        selectFeature('receipts');
        var profile = getProfileSnapshot();
        if (!isValidEmail(profile.email)) {
            setPanelMessage('profileReceiptPanelStatus', 'Add a valid email in Personal details before saving receipts.', 'error');
            return;
        }
        savePreference(RECEIPT_PREF_KEY, {
            email: profile.email,
            customerName: profile.name,
            enabled: true
        });
        setPanelMessage('profileReceiptPanelStatus', 'Receipt email saved: ' + profile.email, 'success');
    }

    function runSafetyContact() {
        selectFeature('safety');
        var profile = getProfileSnapshot();
        if (!profile.phone) {
            setPanelMessage('profileSafetyPanelStatus', 'Add mobile number in OTP protected updates before enabling safety contact.', 'error');
            return;
        }
        if (!profile.phoneVerified) {
            setPanelMessage('profileSafetyPanelStatus', 'Verify mobile in OTP protected updates before enabling safety contact.', 'error');
            return;
        }
        savePreference(SAFETY_CONTACT_KEY, {
            phone: profile.phone,
            customerName: profile.name,
            enabled: true
        });
        setPanelMessage('profileSafetyPanelStatus', 'Safety contact enabled with verified mobile.', 'success');
    }

    function wireFeatureCards() {
        document.querySelectorAll('[data-profile-feature]').forEach(function (card) {
            if (card.dataset.profileLiveReady === '1') return;
            card.dataset.profileLiveReady = '1';
            card.addEventListener('click', function () {
                var feature = card.getAttribute('data-profile-feature');
                selectFeature(feature);
                refreshFeatureStates();
                if (feature === 'otp') runOtpUpdates();
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
        selectFeature(activeFeature);
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
        open: selectFeature,
        refresh: refreshFeatureStates,
        openOtpUpdates: runOtpUpdates,
        enableReceiptsEmail: runReceiptsEmail,
        enableSafetyContact: runSafetyContact
    };
})();
