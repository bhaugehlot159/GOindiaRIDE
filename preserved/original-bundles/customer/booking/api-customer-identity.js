        // ============================================
        // BOOKING FUNCTION
        // ============================================

        function broadcastPortalNotification(payload) {
            if (!window.PortalConnector || !payload) return;

            if (typeof PortalConnector.broadcastToAll === 'function') {
                PortalConnector.broadcastToAll(payload);
                return;
            }

            PortalConnector.createNotification({
                ...payload,
                targetPortals: ['customer', 'driver', 'admin']
            });
        }

        function buildLocalDateTime(dateValue, timeValue) {
            if (!dateValue || !timeValue) return null;
            const dateTime = new Date(`${dateValue}T${timeValue}`);
            return Number.isNaN(dateTime.getTime()) ? null : dateTime;
        }

        function normalizeApiBase(value) {
            const raw = String(value || '').trim();
            if (!raw) return '';
            return raw.replace(/\/$/, '');
        }

        function resolveApiBaseHost(apiBase) {
            try {
                return String(new URL(String(apiBase || '')).hostname || '').toLowerCase();
            } catch (_error) {
                return '';
            }
        }

        function readApiBaseQuarantineMap() {
            try {
                const parsed = JSON.parse(localStorage.getItem(API_BASE_QUARANTINE_KEY) || '{}');
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                    return {};
                }
                return parsed;
            } catch (_error) {
                return {};
            }
        }

        function writeApiBaseQuarantineMap(map) {
            const normalized = map && typeof map === 'object' ? map : {};
            localStorage.setItem(API_BASE_QUARANTINE_KEY, JSON.stringify(normalized));
        }

        function purgeExpiredApiBaseQuarantine(map) {
            const source = map && typeof map === 'object' ? map : {};
            const now = Date.now();
            const next = {};
            Object.keys(source).forEach((base) => {
                const entry = source[base];
                const untilMs = Number(entry && entry.untilMs || 0);
                if (untilMs > now) {
                    next[base] = {
                        untilMs,
                        reason: sanitizeInput(entry.reason || 'api_unavailable', 120),
                        status: Number(entry.status || 0),
                        updatedAt: sanitizeInput(entry.updatedAt || '', 40)
                    };
                }
            });
            return next;
        }

        function getApiBaseQuarantineEntry(apiBase) {
            const base = normalizeApiBase(apiBase);
            if (!base) return null;
            const map = purgeExpiredApiBaseQuarantine(readApiBaseQuarantineMap());
            writeApiBaseQuarantineMap(map);
            return map[base] || null;
        }

        function isApiBaseQuarantined(apiBase) {
            const entry = getApiBaseQuarantineEntry(apiBase);
            return Boolean(entry && Number(entry.untilMs || 0) > Date.now());
        }

        function clearApiBaseQuarantine(apiBase) {
            const base = normalizeApiBase(apiBase);
            if (!base) return;
            const map = purgeExpiredApiBaseQuarantine(readApiBaseQuarantineMap());
            if (!Object.prototype.hasOwnProperty.call(map, base)) return;
            delete map[base];
            writeApiBaseQuarantineMap(map);
        }

        function quarantineApiBase(apiBase, reason = 'api_unavailable', status = 0, ttlMs = API_BASE_QUARANTINE_DEFAULT_MS) {
            const base = normalizeApiBase(apiBase);
            if (!base) return;
            const normalizedTtl = Math.max(30 * 1000, Math.min(Number(ttlMs || 0), API_BASE_QUARANTINE_STATIC_MS));
            const map = purgeExpiredApiBaseQuarantine(readApiBaseQuarantineMap());
            map[base] = {
                untilMs: Date.now() + normalizedTtl,
                reason: sanitizeInput(reason || 'api_unavailable', 120),
                status: Number(status || 0),
                updatedAt: new Date().toISOString()
            };
            writeApiBaseQuarantineMap(map);
        }

        function shouldQuarantineApiBase(apiBase, status, reason = '') {
            const normalizedStatus = Number(status || 0);
            const host = resolveApiBaseHost(apiBase);
            const normalizedReason = String(reason || '').toLowerCase();
            const isGoIndiaHost = /(^|\.)goindiaride\.in$/.test(host);
            const isSiteStaticHost = isGoIndiaHost && host !== 'api.goindiaride.in';

            if (normalizedStatus === 405 && isSiteStaticHost) {
                return true;
            }

            if (normalizedStatus === 404 && isSiteStaticHost) {
                return true;
            }

            if (
                normalizedStatus === 0 &&
                (normalizedReason.includes('network') ||
                normalizedReason.includes('fetch') ||
                normalizedReason.includes('resolve') ||
                normalizedReason.includes('dns') ||
                normalizedReason.includes('econnrefused')) &&
                isGoIndiaHost
            ) {
                return true;
            }

            return false;
        }

        function getAdminEmailPendingReason(result = {}) {
            const attempts = Array.isArray(result.attempts) ? result.attempts : [];
            if (attempts.some((attempt) => Number(attempt && attempt.status || 0) === 405)) {
                return 'api_proxy_not_configured_405';
            }
            if (attempts.some((attempt) => Number(attempt && attempt.status || 0) === 404)) {
                return 'api_route_missing_404';
            }
            const reason = String(result.reason || '').toLowerCase();
            if (reason.includes('request_timeout') || reason.includes('timeout')) {
                return 'api_request_timeout';
            }
            if (
                reason.includes('failed to fetch') ||
                reason.includes('network') ||
                reason.includes('dns') ||
                reason.includes('resolve') ||
                reason.includes('econnrefused')
            ) {
                return 'api_domain_unreachable';
            }
            return sanitizeInput(result.reason || 'server_api_unavailable', 90);
        }

        function isDeprecatedApiBase(base) {
            const normalized = normalizeApiBase(base).toLowerCase();
            if (!normalized) return false;
            return normalized.includes('cloudfunctions.net') || normalized.includes('api.goindiaride.in');
        }

        function isFrontendOnlyApiBase(base) {
            try {
                const parsed = new URL(normalizeApiBase(base));
                const host = String(parsed.hostname || '').toLowerCase();
                return host === 'goindiaride.in' || host === 'www.goindiaride.in' || host.endsWith('.goindiaride.in');
            } catch (_error) {
                return false;
            }
        }

        function getBackendApiBaseCandidates() {
            const host = String(window.location.hostname || '').toLowerCase();
            const originBase = normalizeApiBase(window.location.origin || '');
            const fromWindow = normalizeApiBase(window.GOINDIARIDE_API_BASE || '');
            const fromStorage = normalizeApiBase(localStorage.getItem('goindiaride_api_base') || '');
            const fromRuntime = normalizeApiBase(window.__GOINDIARIDE_RUNTIME_API_ORIGIN__ || window.__GOINDIARIDE_API_ORIGIN__ || '');
            const renderPrimaryBase = 'https://goindiaride.onrender.com';
            const isPrimaryWebsiteHost = host === 'goindiaride.in' || host === 'www.goindiaride.in' || host.endsWith('.goindiaride.in');
            const isGitHubPagesHost = host === 'github.io' || host.endsWith('.github.io');
            const avoidSameOriginFallback = isPrimaryWebsiteHost || isGitHubPagesHost;
            const allowLegacyBackendPath = window.__GOINDIARIDE_ALLOW_LEGACY_BACKEND_PATH__ === true;

            if (isPrimaryWebsiteHost || isGitHubPagesHost) {
                if (isDeprecatedApiBase(fromStorage)) {
                    localStorage.removeItem('goindiaride_api_base');
                }
                if (isDeprecatedApiBase(fromRuntime)) {
                    window.__GOINDIARIDE_RUNTIME_API_ORIGIN__ = renderPrimaryBase;
                }
                if (isDeprecatedApiBase(window.__GOINDIARIDE_API_ORIGIN__ || '')) {
                    window.__GOINDIARIDE_API_ORIGIN__ = renderPrimaryBase;
                }
            }

            const candidates = [];
            const pushUnique = (candidate) => {
                const base = normalizeApiBase(candidate);
                if (!base) return;
                if (!/^https?:\/\//i.test(base)) return;
                if (isDeprecatedApiBase(base)) return;
                if (avoidSameOriginFallback && isFrontendOnlyApiBase(base)) return;
                if (isApiBaseQuarantined(base)) return;
                if (!candidates.includes(base)) {
                    candidates.push(base);
                }
            };

            // Production website must prioritize Render backend directly.
            if (isPrimaryWebsiteHost || isGitHubPagesHost) {
                pushUnique(renderPrimaryBase);
            }

            // Next priority: explicit/runtime overrides (after sanitization).
            pushUnique(fromRuntime);
            pushUnique(fromStorage);
            pushUnique(fromWindow);

            // Local dev default backend.
            if (host === 'localhost' || host === '127.0.0.1') {
                pushUnique('http://localhost:5000');
            }

            // Same-origin root fallback only on non-primary hosts.
            if (!avoidSameOriginFallback) {
                pushUnique(originBase);
            }

            // Keep legacy reverse-proxy fallback as opt-in on primary static hosts.
            if (originBase && (!avoidSameOriginFallback || allowLegacyBackendPath)) {
                pushUnique(`${originBase}/backend`);
            }

            return candidates;
        }

        function getBackendApiBase() {
            const candidates = getBackendApiBaseCandidates();
            if (candidates.length > 0) {
                return candidates[0];
            }
            return normalizeApiBase(window.__GOINDIARIDE_RUNTIME_API_ORIGIN__ || window.__GOINDIARIDE_API_ORIGIN__ || window.location.origin || '');
        }

        function isLikelyEmailAddress(value) {
            const email = String(value || '').trim().toLowerCase();
            return Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
        }

        function normalizeCustomerPhoneValue(value, includeCountryCode = false) {
            const raw = String(value || '').trim();
            if (!raw) return '';

            let normalized = raw.replace(/\s+/g, '');
            if (normalized.startsWith('00')) {
                normalized = '+' + normalized.slice(2);
            }

            if (normalized.startsWith('+')) {
                const digits = normalized.slice(1).replace(/\D/g, '');
                if (digits.length < 8 || digits.length > 15) return '';
                return '+' + digits;
            }

            const digitsOnly = normalized.replace(/\D/g, '');
            if (digitsOnly.length === 10 && /^[6-9]\d{9}$/.test(digitsOnly)) {
                return includeCountryCode ? `+91${digitsOnly}` : `+91${digitsOnly}`;
            }
            if (digitsOnly.length >= 8 && digitsOnly.length <= 15) {
                return '+' + digitsOnly;
            }

            return '';
        }

        function customerAccountRole(row = {}) {
            return sanitizeInput(row.role || row.userRole || row.accountType || row.userType || row.type || row.portalType || '', 80).toLowerCase();
        }

        function customerPhoneLooksUsable(value) {
            return Boolean(normalizeCustomerPhoneValue(value));
        }

        function customerEmailLooksUsable(value) {
            const email = sanitizeInput(value || '', 180).toLowerCase();
            return Boolean(email && email.includes('@') && email !== 'customer@example.com');
        }

        function customerIdentityName(row = {}) {
            return sanitizeInput(row.driverName || row.name || row.fullName || row.fullname || row.customerName || '', 140).toLowerCase();
        }

        function customerRowLooksDriver(row = {}) {
            const role = customerAccountRole(row);
            const source = sanitizeInput(row.sourceKey || row.source || '', 120).toLowerCase();
            const identityName = customerIdentityName(row);
            const hasCustomerContact = Boolean(
                row.customerId
                || row.customerName
                || customerEmailLooksUsable(row.customerEmail || row.email || row.userEmail)
                || customerPhoneLooksUsable(row.customerPhone || row.phone || row.mobile)
            );
            return role.includes('driver')
                || source.includes('driver')
                || Boolean(identityName.includes('driver') && !hasCustomerContact)
                || Boolean(row.driverId)
                || Boolean(row.driverName)
                || Boolean(row.vehicleNumber)
                || Boolean(row.vehicleModel && !row.customerId && !row.customerName)
                || Boolean(row.vehicleType && !row.customerId && !row.customerName && !row.customerEmail);
        }

        function customerRowLooksCustomer(row = {}) {
            const role = customerAccountRole(row);
            if (role && role.includes('driver')) return false;
            if (role && (role.includes('customer') || role.includes('user'))) return true;
            return Boolean(
                row.customerId
                || row.customerName
                || customerEmailLooksUsable(row.customerEmail || row.email || row.userEmail)
                || customerPhoneLooksUsable(row.customerPhone || row.phone || row.mobile)
            );
        }

        function isTruthyVerificationFlag(value) {
            if (value === true) return true;
            const normalized = String(value || '').trim().toLowerCase();
            return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'verified';
        }

        function readLocalArrayFromKeys(keys) {
            for (const key of keys) {
                try {
                    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
                    if (Array.isArray(parsed) && parsed.length) {
                        return parsed.filter((item) => item && typeof item === 'object');
                    }
                } catch (_error) {
                    // Ignore malformed local cache entries and keep scanning fallbacks.
                }
            }
            return [];
        }

        function getCustomerAccountLookupRows() {
            return readLocalArrayFromKeys([
                'users',
                'goride_users',
                'customers',
                'goindiaride_users',
                'goindiaride_customers',
                'registeredUsers',
                'registered_users',
                'goindia_users',
                'goindiaride_user_accounts',
                'user_accounts'
            ]).filter((item) => customerRowLooksCustomer(item) && !customerRowLooksDriver(item));
        }

        function persistResolvedCurrentUserSession(partial = {}) {
            currentUser = {
                ...(currentUser || {}),
                ...(partial && typeof partial === 'object' ? partial : {})
            };
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
        }

        function resolveCurrentCustomerEmail() {
            const directEmail = sanitizeInput(currentUser && currentUser.email, 180).toLowerCase();
            if (isLikelyEmailAddress(directEmail)) {
                return directEmail;
            }

            const safePhone = sanitizeInput((currentUser && currentUser.phone) || '', 40).replace(/[^\d+]/g, '');
            const safeUserId = sanitizeInput((currentUser && currentUser.id) || '', 120);
            const candidateRows = getCustomerAccountLookupRows();

            const matched = candidateRows.find((item) => {
                const itemEmail = sanitizeInput(item.email || item.userEmail || '', 180).toLowerCase();
                const itemPhone = sanitizeInput(item.phone || item.mobile || '', 40).replace(/[^\d+]/g, '');
                const itemId = sanitizeInput(item.id || '', 120);
                if (safeUserId && itemId && itemId === safeUserId && isLikelyEmailAddress(itemEmail)) {
                    return true;
                }
                if (safePhone && itemPhone && itemPhone === safePhone && isLikelyEmailAddress(itemEmail)) {
                    return true;
                }
                return false;
            });

            const resolvedEmail = sanitizeInput(matched && matched.email, 180).toLowerCase();
            if (!isLikelyEmailAddress(resolvedEmail)) {
                return '';
            }

            persistResolvedCurrentUserSession({
                email: resolvedEmail
            });
            return resolvedEmail;
        }

        const BOOKING_PHONE_OTP_REQUIRED = window.__GOINDIARIDE_BOOKING_OTP_REQUIRED__ === true;

        function syncBookingOtpUiState() {
            if (!document.body) return;
            document.body.classList.toggle('booking-otp-required', Boolean(BOOKING_PHONE_OTP_REQUIRED));
        }

        syncBookingOtpUiState();

        function resolveCurrentCustomerPhoneMeta() {
            const directLocalPhone = normalizeCustomerPhoneValue((currentUser && (currentUser.phone || currentUser.mobile)) || '');
            const formPhone = normalizeCustomerPhoneValue(document.getElementById('bookingCustomerPhone')?.value || '');
            const safeUserId = sanitizeInput((currentUser && currentUser.id) || '', 120);
            const safeEmail = sanitizeInput((currentUser && currentUser.email) || '', 180).toLowerCase();
            const candidateRows = getCustomerAccountLookupRows();

            const matched = candidateRows.find((item) => {
                const itemId = sanitizeInput(item.id || item.backendUserId || '', 120);
                const itemEmail = sanitizeInput(item.email || item.userEmail || '', 180).toLowerCase();
                const itemPhone = normalizeCustomerPhoneValue(item.phone || item.mobile || item.contact || item.contact1 || '');
                if (safeUserId && itemId && itemId === safeUserId) {
                    return true;
                }
                if (safeEmail && itemEmail && itemEmail === safeEmail) {
                    return true;
                }
                if (directLocalPhone && itemPhone && itemPhone === directLocalPhone) {
                    return true;
                }
                return false;
            });

            const matchedLocalPhone = normalizeCustomerPhoneValue(
                matched && (matched.phone || matched.mobile || matched.contact || matched.contact1 || '')
            );
            const resolvedLocalPhone = formPhone || directLocalPhone || matchedLocalPhone;
            const formPhoneNeedsVerification = Boolean(BOOKING_PHONE_OTP_REQUIRED && formPhone && formPhone !== directLocalPhone && formPhone !== matchedLocalPhone);
            const hasVerificationMarker = Boolean(
                BOOKING_PHONE_OTP_REQUIRED && (
                    formPhoneNeedsVerification
                    || (currentUser && (Object.prototype.hasOwnProperty.call(currentUser, 'isPhoneVerified') || Object.prototype.hasOwnProperty.call(currentUser, 'phoneVerified')))
                    || (matched && (
                        Object.prototype.hasOwnProperty.call(matched, 'isPhoneVerified')
                        || Object.prototype.hasOwnProperty.call(matched, 'phoneVerified')
                        || Object.prototype.hasOwnProperty.call(matched, 'mobileVerified')
                    ))
                )
            );
            const verified = BOOKING_PHONE_OTP_REQUIRED
                ? Boolean(
                    isTruthyVerificationFlag(currentUser && (currentUser.isPhoneVerified || currentUser.phoneVerified))
                    || isTruthyVerificationFlag(matched && (matched.isPhoneVerified || matched.phoneVerified || matched.mobileVerified))
                )
                : Boolean(resolvedLocalPhone);

            if (resolvedLocalPhone) {
                persistResolvedCurrentUserSession({
                    phone: resolvedLocalPhone,
                    phoneE164: resolvedLocalPhone,
                    ...(BOOKING_PHONE_OTP_REQUIRED && hasVerificationMarker ? { isPhoneVerified: verified } : {})
                });
            }

            return {
                localPhone: resolvedLocalPhone,
                displayPhone: resolvedLocalPhone || '',
                verified: hasVerificationMarker ? verified : Boolean(resolvedLocalPhone),
                hasVerificationMarker
            };
        }

        const BOOKING_PHONE_VERIFICATION_SESSION_KEY = 'goindiaride-booking-phone-verify';
        const BOOKING_PHONE_BACKEND_OTP_SESSION_KEY = 'goindiaride-booking-phone-backend-otp';
        const BOOKING_PHONE_REVIEW_FALLBACK_KEY = 'goindiaride-booking-phone-review-fallback';
        const BOOKING_PHONE_BACKEND_OTP_TTL_MS = 7 * 60 * 1000;
        const BOOKING_PHONE_REVIEW_FALLBACK_TTL_MS = 45 * 60 * 1000;
        const BOOKING_PHONE_SERVICE_FALLBACK_MESSAGE = 'Phone verification service is temporarily unavailable. Please try Send OTP again in a moment or contact support.';

        function isBookingPhoneServiceUnavailableReason(message) {
            const text = String(message || '').trim().toLowerCase();
            if (!text) return false;
            return (
                text.includes('firebase key mismatch')
                || text.includes('auth/invalid-api-key')
                || text.includes('invalid api key')
                || text.includes('firebae_key')
                || text.includes('firebase_key')
                || text.includes('firebase phone verification config')
                || text.includes('phone verification library load')
                || text.includes('firebase domain/recaptcha')
                || text.includes('auth/unauthorized-domain')
                || text.includes('captcha-check-failed')
                || text.includes('recaptcha')
                || text.includes('phone verification service is still loading')
                || text.includes('mobile otp provider is not configured')
                || text.includes('sms/whatsapp settings')
                || text.includes('sms_provider_not_configured')
                || text.includes('meta_send_failed')
                || text.includes('meta_request_failed')
                || text.includes('meta token')
                || text.includes('twilio_send_failed')
                || text.includes('twilio_request_failed')
                || text.includes('msg91_send_failed')
                || text.includes('fast2sms_not_configured')
                || text.includes('fast2sms_send_failed')
                || text.includes('msg91_not_configured')
                || text.includes('twilio_sms_not_configured')
                || text.includes('api_domain_unreachable')
                || text.includes('server_api_unavailable')
                || text.includes('all_api_candidates_failed')
                || text.includes('no_available_api_base_candidates')
                || text.includes('request_timeout')
                || text.includes('network_error')
                || text.includes('failed to fetch')
            );
        }

        function getBookingPhoneCustomerMessage(message, fallback = 'Phone verification failed. Please retry.') {
            const rawMessage = String(message || '').trim();
            if (!rawMessage) return fallback;
            const lower = rawMessage.toLowerCase();
            if (isBookingPhoneServiceUnavailableReason(rawMessage)) {
                return BOOKING_PHONE_SERVICE_FALLBACK_MESSAGE;
            }
            if (lower.includes('otp not found') || lower.includes('pehle otp')) {
                return 'Please send OTP first, then enter the code here.';
            }
            if (lower.includes('otp already used')) {
                return 'This OTP is already used. Please request a new OTP.';
            }
            if (lower.includes('otp expired')) {
                return 'OTP expired. Please request a new OTP.';
            }
            if (lower.includes('invalid otp') || lower.includes('invalid-verification-code') || lower.includes('wrong')) {
                return 'OTP code is not correct. Please check the SMS and try again.';
            }
            return rawMessage;
        }

        function shouldTryFirebaseAfterBackendOtpFailure(message) {
            const text = String(message || '').trim().toLowerCase();
            return (
                text.includes('api_domain_unreachable')
                || text.includes('server_api_unavailable')
                || text.includes('all_api_candidates_failed')
                || text.includes('no_available_api_base_candidates')
                || text.includes('request_timeout')
                || text.includes('network_error')
                || text.includes('failed to fetch')
            );
        }

        function setBookingPhoneReviewFallback(phone, reason = '') {
            const normalizedPhone = normalizeCustomerPhoneValue(phone);
            if (!normalizedPhone) return;
            try {
                sessionStorage.setItem(BOOKING_PHONE_REVIEW_FALLBACK_KEY, JSON.stringify({
                    phone: normalizedPhone,
                    reason: sanitizeInput(reason || 'phone_verification_service_unavailable', 180),
                    createdAt: Date.now()
                }));
            } catch (_error) {
                // Ignore storage restrictions; the current submit attempt can still proceed.
            }
        }

        function getBookingPhoneReviewFallback(phone = '') {
            const normalizedPhone = normalizeCustomerPhoneValue(phone);
            try {
                const parsed = JSON.parse(sessionStorage.getItem(BOOKING_PHONE_REVIEW_FALLBACK_KEY) || '{}');
                const storedPhone = normalizeCustomerPhoneValue(parsed.phone || '');
                const createdAt = Number(parsed.createdAt || 0);
                const fresh = createdAt && Date.now() - createdAt < BOOKING_PHONE_REVIEW_FALLBACK_TTL_MS;
                if (storedPhone && fresh && (!normalizedPhone || storedPhone === normalizedPhone)) {
                    return {
                        phone: storedPhone,
                        reason: sanitizeInput(parsed.reason || 'phone_verification_service_unavailable', 180)
                    };
                }
            } catch (_error) {
                // Ignore malformed session storage.
            }
            return null;
        }

        function clearBookingPhoneReviewFallback() {
            try {
                sessionStorage.removeItem(BOOKING_PHONE_REVIEW_FALLBACK_KEY);
            } catch (_error) {
                // Ignore storage restrictions.
            }
        }

        function setBookingBackendOtpSession(phone, apiBase = '') {
            const normalizedPhone = normalizeCustomerPhoneValue(phone);
            if (!normalizedPhone) return;
            try {
                sessionStorage.setItem(BOOKING_PHONE_BACKEND_OTP_SESSION_KEY, JSON.stringify({
                    phone: normalizedPhone,
                    apiBase: sanitizeInput(apiBase || '', 240),
                    sentAt: Date.now()
                }));
            } catch (_error) {
                // Ignore storage restrictions.
            }
        }

        function getBookingBackendOtpSession(phone = '') {
            const normalizedPhone = normalizeCustomerPhoneValue(phone);
            try {
                const parsed = JSON.parse(sessionStorage.getItem(BOOKING_PHONE_BACKEND_OTP_SESSION_KEY) || '{}');
                const storedPhone = normalizeCustomerPhoneValue(parsed.phone || '');
                const sentAt = Number(parsed.sentAt || 0);
                const fresh = sentAt && Date.now() - sentAt < BOOKING_PHONE_BACKEND_OTP_TTL_MS;
                if (storedPhone && fresh && (!normalizedPhone || storedPhone === normalizedPhone)) {
                    return {
                        phone: storedPhone,
                        apiBase: sanitizeInput(parsed.apiBase || '', 240)
                    };
                }
            } catch (_error) {
                // Ignore malformed session storage.
            }
            return null;
        }

        function clearBookingBackendOtpSession() {
            try {
                sessionStorage.removeItem(BOOKING_PHONE_BACKEND_OTP_SESSION_KEY);
            } catch (_error) {
                // Ignore storage restrictions.
            }
        }

        function getBookingDeviceFingerprint() {
            if (window.GoIndiaSessionContinuity && typeof window.GoIndiaSessionContinuity.buildClientDeviceFingerprint === 'function') {
                return window.GoIndiaSessionContinuity.buildClientDeviceFingerprint();
            }

            const key = 'goindiaride_device_fingerprint_v1';
            try {
                const existing = String(localStorage.getItem(key) || '').trim();
                if (existing) return existing;
            } catch (_error) {
                // Continue with an in-memory fingerprint.
            }

            const parts = [
                navigator.userAgent || '',
                navigator.language || '',
                screen && `${screen.width}x${screen.height}x${screen.colorDepth}`,
                Intl.DateTimeFormat().resolvedOptions().timeZone || ''
            ];
            let hash = 2166136261;
            const input = parts.join('|');
            for (let index = 0; index < input.length; index += 1) {
                hash ^= input.charCodeAt(index);
                hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
            }
            const fingerprint = `web_${(hash >>> 0).toString(16)}`;
            try {
                localStorage.setItem(key, fingerprint);
            } catch (_error) {
                // Ignore storage restrictions.
            }
            return fingerprint;
        }

        function setBookingPhoneStatus(message, type = '') {
            const node = document.getElementById('bookingPhoneStatus');
            if (!node) return;
            const rawMessage = String(message || '').trim();
            node.dataset.rawMessage = rawMessage;
            node.textContent = getBookingPhoneCustomerMessage(rawMessage, '');
            node.classList.remove('success', 'error');
            if (type) {
                node.classList.add(type);
            }
        }

        function updateCustomerAccountStoresWithPhone(phone, verified) {
            const safePhone = normalizeCustomerPhoneValue(phone);
            if (!safePhone) return;

            const safeUserId = sanitizeInput((currentUser && currentUser.id) || '', 120);
            const safeEmail = sanitizeInput((currentUser && currentUser.email) || '', 180).toLowerCase();
            const keys = [
                'users',
                'goride_users',
                'customers',
                'goindiaride_users',
                'goindiaride_customers',
                'registeredUsers',
                'registered_users',
                'goindia_users',
                'goindiaride_user_accounts',
                'user_accounts'
            ];

            keys.forEach((key) => {
                try {
                    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
                    if (!Array.isArray(parsed)) return;
                    let changed = false;
                    const nextRows = parsed.map((item) => {
                        if (!item || typeof item !== 'object') return item;
                        const itemId = sanitizeInput(item.id || item.backendUserId || '', 120);
                        const itemEmail = sanitizeInput(item.email || item.userEmail || '', 180).toLowerCase();
                        const itemPhone = normalizeCustomerPhoneValue(item.phone || item.mobile || item.contact || item.contact1 || '');
                        const matches = Boolean(
                            (safeUserId && itemId && itemId === safeUserId)
                            || (safeEmail && itemEmail && itemEmail === safeEmail)
                            || ((currentUser && currentUser.phone) && itemPhone && itemPhone === normalizeCustomerPhoneValue(currentUser.phone))
                        );
                        if (!matches) return item;
                        changed = true;
                        return {
                            ...item,
                            phone: safePhone,
                            mobile: safePhone,
                            isPhoneVerified: Boolean(verified),
                            phoneVerified: Boolean(verified),
                            mobileVerified: Boolean(verified)
                        };
                    });
                    if (changed) {
                        localStorage.setItem(key, JSON.stringify(nextRows));
                    }
                } catch (_error) {
                    // Ignore local storage sync errors.
                }
            });

            try {
                const runtimeProfile = JSON.parse(localStorage.getItem('goindiaride.profile.runtime') || '{}');
                localStorage.setItem('goindiaride.profile.runtime', JSON.stringify({
                    ...(runtimeProfile && typeof runtimeProfile === 'object' ? runtimeProfile : {}),
                    name: (currentUser && (currentUser.fullname || currentUser.name)) || runtimeProfile.name || '',
                    email: (currentUser && currentUser.email) || runtimeProfile.email || '',
                    phone: safePhone,
                    isPhoneVerified: Boolean(verified),
                    phoneVerified: Boolean(verified)
                }));
            } catch (_error) {
                // Ignore runtime profile sync errors.
            }
        }

        async function syncVerifiedPhoneWithBackend(phone) {
            const token = String(getBackendAccessToken() || '').trim();
            if (!token) {
                return { ok: false, reason: 'missing_access_token' };
            }

            const result = await fetchJsonAcrossApiBases('/api/user/profile/phone', {
                method: 'PATCH',
                token,
                includeJson: true,
                includeIdempotency: true,
                idPrefix: 'gir-profile-phone',
                body: {
                    phone,
                    verified: true
                },
                timeoutMs: 10000
            });

            return result;
        }

        async function sendBackendBookingPhoneOtp(normalizedPhone) {
            const result = await fetchJsonAcrossApiBases('/api/auth/request-otp', {
                method: 'POST',
                includeJson: true,
                includeIdempotency: true,
                idPrefix: 'gir-booking-phone-otp',
                body: {
                    channel: 'sms',
                    accountType: 'customer',
                    phone: normalizedPhone
                },
                timeoutMs: 14000
            });

            const data = result.data || {};
            const delivery = data.delivery || {};
            const deliverySent = Boolean(delivery.sent);
            if (result.ok && deliverySent) {
                setBookingBackendOtpSession(normalizedPhone, result.apiBase || '');
                clearBookingPhoneReviewFallback();
                return {
                    ok: true,
                    provider: sanitizeInput(delivery.provider || 'backend_sms', 80),
                    apiBase: result.apiBase || ''
                };
            }

            const reason = sanitizeInput(
                [delivery.reason, delivery.message, data.message, result.reason, 'backend_sms_otp_failed'].filter(Boolean).join(': '),
                260
            );
            throw new Error(reason);
        }

        function storeBackendPhoneVerificationSession(data = {}, verifiedPhone = '') {
            const accessToken = String(data.accessToken || '').trim();
            const refreshToken = String(data.refreshToken || '').trim();
            if (accessToken) {
                localStorage.setItem('accessToken', accessToken);
                localStorage.setItem('authToken', accessToken);
                localStorage.setItem('token', accessToken);
            }
            if (refreshToken) {
                localStorage.setItem('refreshToken', refreshToken);
            }

            persistResolvedCurrentUserSession({
                id: sanitizeInput(data.id || (currentUser && currentUser.id) || '', 120),
                name: sanitizeInput(data.name || (currentUser && (currentUser.name || currentUser.fullname)) || 'Customer', 140),
                fullname: sanitizeInput(data.name || (currentUser && (currentUser.fullname || currentUser.name)) || 'Customer', 140),
                email: sanitizeInput(data.email || (currentUser && currentUser.email) || '', 180),
                phone: verifiedPhone,
                mobile: verifiedPhone,
                phoneE164: verifiedPhone,
                isPhoneVerified: true,
                phoneVerified: true,
                accountType: sanitizeInput(data.accountType || (currentUser && currentUser.accountType) || 'customer', 40),
                role: sanitizeInput(data.role || (currentUser && currentUser.role) || 'user', 40)
            });
        }

        async function verifyBackendBookingPhoneOtp(normalizedPhone, otpValue) {
            const deviceFingerprint = getBookingDeviceFingerprint();
            const result = await fetchJsonAcrossApiBases('/api/auth/otp/verify', {
                method: 'POST',
                includeJson: true,
                includeIdempotency: true,
                idPrefix: 'gir-booking-phone-otp-verify',
                extraHeaders: {
                    'x-device-fingerprint': deviceFingerprint
                },
                body: {
                    channel: 'sms',
                    accountType: 'customer',
                    phone: normalizedPhone,
                    otp: otpValue,
                    deviceFingerprint
                },
                timeoutMs: 14000
            });

            const data = result.data || {};
            if (!result.ok) {
                throw new Error(sanitizeInput(data.message || result.reason || 'backend_sms_otp_verify_failed', 220));
            }

            const verifiedPhone = normalizeCustomerPhoneValue(data.phone || normalizedPhone);
            if (!verifiedPhone) {
                throw new Error('Verified phone number missing after backend OTP confirmation.');
            }

            storeBackendPhoneVerificationSession(data, verifiedPhone);
            updateCustomerAccountStoresWithPhone(verifiedPhone, true);
            clearBookingBackendOtpSession();
            clearBookingPhoneReviewFallback();
            return {
                ok: true,
                phone: verifiedPhone,
                data,
                apiBase: result.apiBase || ''
            };
        }

        function hydrateBookingPhoneVerificationUI() {
            syncBookingOtpUiState();
            const input = document.getElementById('bookingCustomerPhone');
            if (!input) return;

            const phoneMeta = resolveCurrentCustomerPhoneMeta();
            input.value = phoneMeta.localPhone || '';
            const otpInput = document.getElementById('bookingPhoneOtp');
            if (otpInput) otpInput.value = '';
            if (!BOOKING_PHONE_OTP_REQUIRED) {
                if (phoneMeta.localPhone) {
                    setBookingPhoneStatus(`Contact number ready: ${phoneMeta.localPhone}`, 'success');
                } else {
                    setBookingPhoneStatus('Contact mobile number is required for booking.');
                }
                return;
            }
            const reviewFallback = getBookingPhoneReviewFallback(phoneMeta.localPhone);
            if (phoneMeta.localPhone && phoneMeta.verified) {
                setBookingPhoneStatus(`Verified mobile ready: ${phoneMeta.localPhone}`, 'success');
            } else if (phoneMeta.localPhone && reviewFallback) {
                setBookingPhoneStatus('Phone verification service is temporarily unavailable. Please try Send OTP again in a moment or contact support.', 'error');
            } else if (phoneMeta.localPhone) {
                setBookingPhoneStatus(`Mobile saved but not verified: ${phoneMeta.localPhone}. Please send OTP and verify.`, 'error');
            } else {
                setBookingPhoneStatus('Verified mobile number is required for booking.');
            }
        }

        function handleBookingPhoneInputChange() {
            const phoneValue = sanitizeInput(document.getElementById('bookingCustomerPhone')?.value || '', 40);
            const otpInput = document.getElementById('bookingPhoneOtp');
            if (otpInput) otpInput.value = '';
            if (window.GoIndiaPhoneVerification && typeof window.GoIndiaPhoneVerification.clearSession === 'function') {
                window.GoIndiaPhoneVerification.clearSession(BOOKING_PHONE_VERIFICATION_SESSION_KEY);
            }
            clearBookingBackendOtpSession();
            clearBookingPhoneReviewFallback();
            if (!BOOKING_PHONE_OTP_REQUIRED) {
                const normalizedPhone = normalizeCustomerPhoneValue(phoneValue);
                if (normalizedPhone) {
                    setBookingPhoneStatus(`Contact number ready: ${normalizedPhone}`, 'success');
                } else if (phoneValue) {
                    setBookingPhoneStatus('Please enter a valid mobile number.', 'error');
                } else {
                    setBookingPhoneStatus('Contact mobile number is required for booking.');
                }
                return;
            }
            if (phoneValue) {
                setBookingPhoneStatus('Send OTP to verify this mobile number before booking.');
            } else {
                setBookingPhoneStatus('Verified mobile number is required for booking.');
            }
        }

        async function sendBookingPhoneOtp() {
            if (!BOOKING_PHONE_OTP_REQUIRED) {
                setBookingPhoneStatus('OTP verification is temporarily disabled. Contact number is enough for booking.', 'success');
                return;
            }
            const input = document.getElementById('bookingCustomerPhone');
            const normalizedPhone = window.GoIndiaPhoneVerification?.normalizePhone
                ? window.GoIndiaPhoneVerification.normalizePhone(input?.value || '')
                : normalizeCustomerPhoneValue(input?.value || '');
            if (!normalizedPhone) {
                setBookingPhoneStatus('Please enter a valid mobile number with country code.', 'error');
                revealBookingField('bookingCustomerPhone');
                return;
            }

            const phoneMeta = resolveCurrentCustomerPhoneMeta();
            if (phoneMeta.verified && phoneMeta.localPhone === normalizedPhone) {
                setBookingPhoneStatus(`Mobile already verified: ${normalizedPhone}`, 'success');
                return;
            }

            try {
                setBookingPhoneStatus('Sending OTP through secure SMS gateway...');
                await sendBackendBookingPhoneOtp(normalizedPhone);
                if (input) input.value = normalizedPhone;
                setBookingPhoneStatus(`OTP sent to ${normalizedPhone}. Enter the code and tap Verify Phone.`, 'success');
                if (typeof showSuccessToast === 'function') {
                    showSuccessToast(`OTP sent to ${normalizedPhone}`, 'Phone Verification');
                }
                return;
            } catch (backendFirstError) {
                const backendFirstMessage = String(backendFirstError?.message || '').trim();
                console.warn('Booking phone backend SMS OTP failed before Firebase fallback.', backendFirstError);
                if (!shouldTryFirebaseAfterBackendOtpFailure(backendFirstMessage)) {
                    if (isBookingPhoneServiceUnavailableReason(backendFirstMessage)) {
                        setBookingPhoneReviewFallback(normalizedPhone, backendFirstMessage);
                    }
                    const message = getBookingPhoneCustomerMessage(backendFirstMessage, 'OTP send failed. Please retry.');
                    setBookingPhoneStatus(message, 'error');
                    if (typeof showErrorToast === 'function') {
                        showErrorToast(message, 'Phone Verification');
                    }
                    return;
                }
            }

            if (!window.GoIndiaPhoneVerification || typeof window.GoIndiaPhoneVerification.sendOtp !== 'function') {
                try {
                    setBookingPhoneStatus('Sending OTP through secure SMS gateway...');
                    const backendResult = await sendBackendBookingPhoneOtp(normalizedPhone);
                    if (input) input.value = normalizedPhone;
                    setBookingPhoneStatus(`OTP sent to ${normalizedPhone}. Enter the code and tap Verify Phone.`, 'success');
                    if (typeof showSuccessToast === 'function') {
                        showSuccessToast(`OTP sent to ${normalizedPhone}`, 'Phone Verification');
                    }
                    return;
                } catch (backendError) {
                    const rawMessage = String(backendError?.message || 'Phone verification service is still loading. Please retry in a moment.').trim();
                    if (isBookingPhoneServiceUnavailableReason(rawMessage)) {
                        setBookingPhoneReviewFallback(normalizedPhone, rawMessage);
                    }
                    const message = getBookingPhoneCustomerMessage(rawMessage);
                    setBookingPhoneStatus(message, 'error');
                    if (typeof showErrorToast === 'function') {
                        showErrorToast(message, 'Phone Verification');
                    }
                    return;
                }
            }

            try {
                setBookingPhoneStatus('Sending OTP...');
                await window.GoIndiaPhoneVerification.sendOtp(normalizedPhone, {
                    sessionKey: BOOKING_PHONE_VERIFICATION_SESSION_KEY,
                    containerId: 'bookingPhoneRecaptchaContainer'
                });
                if (input) input.value = normalizedPhone;
                setBookingPhoneStatus(`OTP sent to ${normalizedPhone}. Enter the code and tap Verify Phone.`, 'success');
                if (typeof showSuccessToast === 'function') {
                    showSuccessToast(`OTP sent to ${normalizedPhone}`, 'Phone Verification');
                }
            } catch (error) {
                const firebaseMessage = String(error?.message || 'OTP send failed. Please retry.').trim();
                console.warn('Booking phone Firebase OTP failed; trying backend SMS fallback.', error);
                try {
                    setBookingPhoneStatus('Firebase OTP unavailable. Trying secure SMS gateway...');
                    const backendResult = await sendBackendBookingPhoneOtp(normalizedPhone);
                    if (input) input.value = normalizedPhone;
                    setBookingPhoneStatus(`OTP sent to ${normalizedPhone}. Enter the code and tap Verify Phone.`, 'success');
                    if (typeof showSuccessToast === 'function') {
                        showSuccessToast(`OTP sent to ${normalizedPhone}`, 'Phone Verification');
                    }
                    return;
                } catch (backendError) {
                    const backendMessage = String(backendError?.message || '').trim();
                    const rawMessage = backendMessage || firebaseMessage;
                    console.warn('Booking phone backend SMS OTP fallback failed.', backendError);
                    if (isBookingPhoneServiceUnavailableReason(rawMessage) || isBookingPhoneServiceUnavailableReason(firebaseMessage)) {
                        setBookingPhoneReviewFallback(normalizedPhone, rawMessage || firebaseMessage);
                    }
                    const message = getBookingPhoneCustomerMessage(rawMessage || firebaseMessage, 'OTP send failed. Please retry.');
                    setBookingPhoneStatus(message, 'error');
                    if (typeof showErrorToast === 'function') {
                        showErrorToast(message, 'Phone Verification');
                    }
                }
            }
        }

        async function verifyBookingPhoneOtp() {
            if (!BOOKING_PHONE_OTP_REQUIRED) {
                setBookingPhoneStatus('OTP verification is temporarily disabled. Contact number is enough for booking.', 'success');
                return;
            }
            const otpValue = sanitizeInput(document.getElementById('bookingPhoneOtp')?.value || '', 12);
            if (!otpValue) {
                setBookingPhoneStatus('Please enter the OTP code.', 'error');
                return;
            }
            const phoneInput = document.getElementById('bookingCustomerPhone');
            const normalizedPhone = window.GoIndiaPhoneVerification?.normalizePhone
                ? window.GoIndiaPhoneVerification.normalizePhone(phoneInput?.value || '')
                : normalizeCustomerPhoneValue(phoneInput?.value || '');
            const backendOtpSession = getBookingBackendOtpSession(normalizedPhone);
            if (backendOtpSession) {
                try {
                    setBookingPhoneStatus('Verifying OTP...');
                    const backendResult = await verifyBackendBookingPhoneOtp(backendOtpSession.phone, otpValue);
                    const verifiedPhone = backendResult.phone;
                    if (phoneInput) phoneInput.value = verifiedPhone;
                    setBookingPhoneStatus(`Verified mobile saved to backend: ${verifiedPhone}`, 'success');
                    if (typeof showSuccessToast === 'function') {
                        showSuccessToast(`Mobile verified: ${verifiedPhone}`, 'Phone Verification');
                    }
                    return;
                } catch (backendError) {
                    const message = getBookingPhoneCustomerMessage(backendError?.message || 'OTP verification failed. Please retry.');
                    setBookingPhoneStatus(message, 'error');
                    if (typeof showErrorToast === 'function') {
                        showErrorToast(message, 'Phone Verification');
                    }
                    return;
                }
            }
            if (!window.GoIndiaPhoneVerification || typeof window.GoIndiaPhoneVerification.verifyOtp !== 'function') {
                setBookingPhoneStatus('Phone verification service is still loading. Please retry in a moment.', 'error');
                return;
            }

            try {
                setBookingPhoneStatus('Verifying OTP...');
                const result = await window.GoIndiaPhoneVerification.verifyOtp(otpValue, {
                    sessionKey: BOOKING_PHONE_VERIFICATION_SESSION_KEY
                });
                const verifiedPhone = normalizeCustomerPhoneValue(result?.phone || document.getElementById('bookingCustomerPhone')?.value || '');
                if (!verifiedPhone) {
                    throw new Error('Verified phone number missing after OTP confirmation.');
                }

                persistResolvedCurrentUserSession({
                    phone: verifiedPhone,
                    mobile: verifiedPhone,
                    phoneE164: verifiedPhone,
                    isPhoneVerified: true,
                    phoneVerified: true
                });
                updateCustomerAccountStoresWithPhone(verifiedPhone, true);
                clearBookingBackendOtpSession();
                clearBookingPhoneReviewFallback();
                const input = document.getElementById('bookingCustomerPhone');
                if (input) input.value = verifiedPhone;

                const syncResult = await syncVerifiedPhoneWithBackend(verifiedPhone);
                if (syncResult?.ok && syncResult.data?.user) {
                    persistResolvedCurrentUserSession({
                        ...syncResult.data.user,
                        phone: normalizeCustomerPhoneValue(syncResult.data.user.phone || verifiedPhone) || verifiedPhone,
                        mobile: normalizeCustomerPhoneValue(syncResult.data.user.phone || verifiedPhone) || verifiedPhone,
                        isPhoneVerified: Boolean(syncResult.data.user.isPhoneVerified),
                        phoneVerified: Boolean(syncResult.data.user.isPhoneVerified)
                    });
                    updateCustomerAccountStoresWithPhone(verifiedPhone, Boolean(syncResult.data.user.isPhoneVerified));
                    setBookingPhoneStatus(`Verified mobile saved to backend: ${verifiedPhone}`, 'success');
                } else if (syncResult?.reason === 'missing_access_token') {
                    setBookingPhoneStatus(`Verified mobile saved in this session: ${verifiedPhone}. Backend sync will happen after login refresh.`, 'success');
                } else {
                    setBookingPhoneStatus(`Verified mobile saved locally: ${verifiedPhone}. Backend sync is pending.`, 'success');
                }

                if (typeof showSuccessToast === 'function') {
                    showSuccessToast(`Mobile verified: ${verifiedPhone}`, 'Phone Verification');
                }
            } catch (error) {
                const message = getBookingPhoneCustomerMessage(error?.message || 'OTP verification failed. Please retry.');
                setBookingPhoneStatus(message, 'error');
                if (typeof showErrorToast === 'function') {
                    showErrorToast(message, 'Phone Verification');
                }
            }
        }

        function getBackendAccessToken() {
            return (
                localStorage.getItem('accessToken') ||
                localStorage.getItem('authToken') ||
                localStorage.getItem('token') ||
                ''
            );
        }

        function getBackendRefreshToken() {
            const keys = [
                'goindiaride_refresh_token_v1',
                'goindiaride_refresh_token',
                'refreshToken'
            ];
            for (const key of keys) {
                try {
                    const value = String(localStorage.getItem(key) || '').trim();
                    if (value) return value;
                } catch (_error) {
                    // Keep scanning other token slots.
                }
            }
            return '';
        }

        function persistBackendAccessToken(token) {
            const normalized = String(token || '').trim();
            if (!normalized) return;
            ['accessToken', 'authToken', 'token'].forEach((key) => {
                try {
                    localStorage.setItem(key, normalized);
                } catch (_error) {
                    // Ignore storage restrictions.
                }
            });
        }

        function persistBackendRefreshToken(token) {
            const normalized = String(token || '').trim();
            if (!normalized) return;
            ['goindiaride_refresh_token_v1', 'goindiaride_refresh_token', 'refreshToken'].forEach((key) => {
                try {
                    localStorage.setItem(key, normalized);
                } catch (_error) {
                    // Ignore storage restrictions.
                }
            });
        }

        function clearBackendAccessTokens() {
            ['accessToken', 'authToken', 'token'].forEach((key) => {
                try {
                    localStorage.removeItem(key);
                } catch (_error) {
                    // Ignore storage restrictions.
                }
            });
        }

        function decodeBookingJwtPayload(token) {
            const parts = String(token || '').split('.');
            if (parts.length < 2) return null;
            try {
                const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
                const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`;
                return JSON.parse(atob(padded));
            } catch (_error) {
                return null;
            }
        }

        function isBackendAccessTokenExpired(token, skewMs = 60000) {
            const payload = decodeBookingJwtPayload(token);
            if (!payload || !payload.exp) return false;
            return (Number(payload.exp) * 1000) <= Date.now() + Number(skewMs || 0);
        }

        function isBookingAuthFailureReason(reason, status = 0) {
            const text = String(reason || '').toLowerCase();
            return Number(status || 0) === 401
                || text.includes('invalid or expired token')
                || text.includes('jwt expired')
                || text.includes('token expired')
                || text.includes('invalid token')
                || text.includes('missing_access_token')
                || text.includes('unauthorized');
        }

        async function refreshBookingBackendAccessToken(reason = 'booking_submit') {
            if (window.GoIndiaSessionContinuity && typeof window.GoIndiaSessionContinuity.restorePortalSession === 'function') {
                try {
                    const restored = await window.GoIndiaSessionContinuity.restorePortalSession({
                        role: 'customer',
                        preferFastLocal: false,
                        backgroundRefresh: false
                    });
                    const restoredToken = String(getBackendAccessToken() || '').trim();
                    if (restored?.ok && restoredToken && !isBackendAccessTokenExpired(restoredToken)) {
                        return { ok: true, token: restoredToken, source: restored.source || 'session_continuity' };
                    }
                } catch (_error) {
                    // Fall through to direct refresh endpoint.
                }
            }

            const refreshToken = getBackendRefreshToken();
            if (!refreshToken) {
                return { ok: false, reason: 'missing_refresh_token' };
            }

            const apiBases = getBackendApiBaseCandidates();
            const deviceFingerprint = getBookingDeviceFingerprint();
            const paths = ['/api/auth/refresh-secure', '/api/auth/refresh', '/api/auth/refresh-token-v2'];
            const attempts = [];
            for (const apiBase of apiBases) {
                if (isApiBaseQuarantined(apiBase)) {
                    attempts.push({ apiBase, status: 0, reason: 'api_base_quarantined' });
                    continue;
                }
                for (const path of paths) {
                    try {
                        const response = await fetchWithTimeout(`${apiBase}${path}`, {
                            method: 'POST',
                            credentials: 'include',
                            cache: 'no-store',
                            headers: {
                                Accept: 'application/json',
                                'Content-Type': 'application/json',
                                'X-Refresh-Token': refreshToken,
                                'X-Device-Fingerprint': deviceFingerprint,
                                'x-request-id': createClientRequestId('gir-booking-token-refresh'),
                                'x-timestamp': String(Date.now())
                            },
                            body: JSON.stringify({
                                refreshToken,
                                deviceFingerprint,
                                reason: sanitizeInput(reason || 'booking_submit', 120)
                            })
                        }, 9000);
                        const data = await parseJsonSafe(response);
                        if (response.status === 404 || response.status === 405) {
                            attempts.push({ apiBase, path, status: response.status, reason: 'refresh_endpoint_unavailable' });
                            continue;
                        }
                        if (!response.ok || !data?.accessToken) {
                            attempts.push({
                                apiBase,
                                path,
                                status: Number(response.status || 0),
                                reason: sanitizeInput(data?.message || data?.reason || 'refresh_failed', 140)
                            });
                            continue;
                        }
                        persistBackendAccessToken(data.accessToken);
                        if (data.refreshToken) persistBackendRefreshToken(data.refreshToken);
                        if (apiBase) {
                            try {
                                localStorage.setItem('goindiaride_api_base', apiBase);
                            } catch (_error) {
                                // Ignore storage restrictions.
                            }
                        }
                        return { ok: true, token: String(data.accessToken || '').trim(), apiBase, path };
                    } catch (error) {
                        attempts.push({
                            apiBase,
                            path,
                            status: 0,
                            reason: classifyBrowserRequestFailure(apiBase, error)
                        });
                    }
                }
            }

            return {
                ok: false,
                reason: attempts.length ? attempts[attempts.length - 1].reason : 'refresh_failed',
                attempts
            };
        }

        async function resolveFreshBookingAccessToken(reason = 'booking_submit') {
            const token = String(getBackendAccessToken() || '').trim();
            if (token && !isBackendAccessTokenExpired(token)) {
                return { ok: true, token, source: 'stored_access_token' };
            }
            const refreshed = await refreshBookingBackendAccessToken(reason);
            if (refreshed.ok && refreshed.token) {
                return refreshed;
            }
            if (token && !isBackendAccessTokenExpired(token, 0)) {
                return { ok: true, token, source: 'stored_access_token_unverified' };
            }
            clearBackendAccessTokens();
            return refreshed.ok ? refreshed : { ok: false, reason: refreshed.reason || 'missing_or_expired_access_token' };
        }

        async function warmBookingBackendConnections() {
            const candidates = getBackendApiBaseCandidates().slice(0, 2);
            await Promise.allSettled(candidates.map(async (apiBase) => {
                try {
                    await fetchWithTimeout(`${apiBase}/health`, {
                        method: 'GET',
                        headers: {
                            Accept: 'application/json'
                        }
                    }, 20000);
                } catch (_error) {
                    // Warmup is best-effort only.
                }
            }));
        }

        function createClientRequestId(prefix = 'gir-booking') {
            return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
        }

        function createIdempotencyKey(prefix = 'gir-booking') {
            return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 15)}`;
        }

        function buildSecureApiHeaders({
            token = '',
            includeJson = true,
            includeIdempotency = false,
            idPrefix = 'gir-booking',
            idempotencyKey = ''
        } = {}) {
            const headers = {
                Accept: 'application/json',
                'x-request-id': createClientRequestId(idPrefix),
                'x-timestamp': String(Date.now())
            };

            if (includeJson) {
                headers['Content-Type'] = 'application/json';
            }

            if (token) {
                headers.Authorization = `Bearer ${token}`;
            }

            if (includeIdempotency) {
                headers['x-idempotency-key'] = idempotencyKey || createIdempotencyKey(idPrefix);
            }

            return headers;
        }

        function createStableFallbackEmailIdempotencyKey(bookingId) {
            const safeBookingId = sanitizeInput(bookingId || '', 120).replace(/[^A-Za-z0-9:_-]/g, '_');
            if (!safeBookingId) {
                return createIdempotencyKey('gir-booking-fallback-email');
            }
            return `gir-booking-fallback-email:${safeBookingId}:admin-alert`;
        }

        function createAdminReviewQueueIdempotencyKey(bookingId) {
            const safeBookingId = sanitizeInput(bookingId || '', 120).replace(/[^A-Za-z0-9:_-]/g, '_');
            const prefix = safeBookingId ? `gir-booking-admin-review-queue:${safeBookingId}` : 'gir-booking-admin-review-queue';
            return createIdempotencyKey(prefix);
        }

        function broadcastAdminReviewQueueSync(bookingId, details = {}) {
            const safeBookingId = sanitizeInput(bookingId || '', 120);
            if (!safeBookingId) return;
            try {
                localStorage.setItem(ADMIN_REVIEW_QUEUE_SIGNAL_KEY, JSON.stringify({
                    bookingId: safeBookingId,
                    apiBase: sanitizeInput(details.apiBase || '', 240),
                    state: sanitizeInput(details.state || 'queued', 80),
                    reason: sanitizeInput(details.reason || 'customer_booking_submit', 140),
                    updatedAt: new Date().toISOString()
                }));
            } catch (_error) {
                // Storage can be unavailable in strict/private browser modes.
            }
        }

        function isDuplicateIdempotencyConflictResponse(statusCode, payload = {}) {
            if (Number(statusCode || 0) !== 409) return false;
            const reasonText = String(payload?.reason || payload?.message || '').toLowerCase();
            return (
                reasonText.includes('duplicate idempotency request blocked')
                || reasonText.includes('request with same idempotency key is already in progress')
                || reasonText.includes('idempotency key already used')
            );
        }

        async function parseJsonSafe(response) {
            try {
                return await response.json();
            } catch (_error) {
                return {};
            }
        }

        async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort('request_timeout'), timeoutMs);
            try {
                return await fetch(url, {
                    ...options,
                    signal: controller.signal
                });
            } catch (error) {
                if (controller.signal && controller.signal.aborted) {
                    const abortReason = controller.signal.reason;
                    const reasonText =
                        typeof abortReason === 'string'
                            ? abortReason
                            : sanitizeInput(abortReason && abortReason.message, 140) || 'request_timeout';
                    throw new Error(reasonText);
                }
                throw error;
            } finally {
                clearTimeout(timer);
            }
        }

        function formatApiReason(message, fallback = 'request_failed') {
            const safe = sanitizeInput(message || '', 160);
            return safe || fallback;
        }

        function isCrossOriginApiBase(apiBase) {
            try {
                return new URL(String(apiBase || '')).origin !== window.location.origin;
            } catch (_error) {
                return false;
            }
        }

        function classifyBrowserRequestFailure(apiBase, error) {
            const rawMessage = String((error && error.message) || error || '').trim();
            const normalized = rawMessage.toLowerCase();

            if (normalized.includes('request_timeout') || normalized.includes('timeout')) {
                return 'request_timeout';
            }

            if (
                normalized.includes('failed to fetch') ||
                normalized.includes('load failed') ||
                normalized.includes('networkerror') ||
                normalized.includes('network request failed')
            ) {
                return isCrossOriginApiBase(apiBase) ? 'preflight_blocked' : 'network_error';
            }

            return formatApiReason(rawMessage || 'network_error', 'network_error');
        }

        async function fetchJsonAcrossApiBases(pathname, {
            method = 'GET',
            token = '',
            body = null,
            includeJson = true,
            includeIdempotency = false,
            idPrefix = 'gir-api',
            idempotencyKey = '',
            extraHeaders = {},
            timeoutMs = 8000,
            retryStatuses = [404, 405, 408, 429, 500, 502, 503, 504]
        } = {}) {
            const path = String(pathname || '').trim();
            if (!path) {
                return {
                    ok: false,
                    reason: 'missing_pathname',
                    attempts: []
                };
            }

            const apiBases = getBackendApiBaseCandidates();
            if (!apiBases.length) {
                return {
                    ok: false,
                    status: 0,
                    apiBase: '',
                    reason: 'no_available_api_base_candidates',
                    attempts: []
                };
            }
            const attempts = [];
            for (const apiBase of apiBases) {
                if (isApiBaseQuarantined(apiBase)) {
                    attempts.push({
                        apiBase,
                        status: 0,
                        reason: 'api_base_quarantined'
                    });
                    continue;
                }

                const url = `${apiBase}${path}`;
                try {
                    const response = await fetchWithTimeout(url, {
                        method,
                        headers: {
                            ...buildSecureApiHeaders({
                                token,
                                includeJson,
                                includeIdempotency,
                                idPrefix,
                                idempotencyKey
                            }),
                            ...extraHeaders
                        },
                        body: body != null ? JSON.stringify(body) : undefined
                    }, timeoutMs);

                    const data = await parseJsonSafe(response);
                    if (response.ok) {
                        clearApiBaseQuarantine(apiBase);
                        return {
                            ok: true,
                            status: Number(response.status || 200),
                            apiBase,
                            data,
                            attempts
                        };
                    }

                    const reason = formatApiReason(data?.message || data?.reason || `http_${response.status}`, `http_${response.status}`);
                    const statusCode = Number(response.status || 0);
                    if (shouldQuarantineApiBase(apiBase, statusCode, reason)) {
                        const ttlMs = statusCode === 404 || statusCode === 405
                            ? API_BASE_QUARANTINE_STATIC_MS
                            : API_BASE_QUARANTINE_DEFAULT_MS;
                        quarantineApiBase(apiBase, reason, statusCode, ttlMs);
                    }
                    attempts.push({
                        apiBase,
                        status: statusCode,
                        reason
                    });

                    if (retryStatuses.includes(statusCode)) {
                        continue;
                    }

                    return {
                        ok: false,
                        status: statusCode,
                        apiBase,
                        reason,
                        data,
                        attempts
                    };
                } catch (error) {
                    const reason = classifyBrowserRequestFailure(apiBase, error);
                    if (shouldQuarantineApiBase(apiBase, 0, reason)) {
                        quarantineApiBase(apiBase, reason, 0, API_BASE_QUARANTINE_DNS_MS);
                    }
                    attempts.push({
                        apiBase,
                        status: 0,
                        reason
                    });
                }
            }

            const last = attempts.length ? attempts[attempts.length - 1] : null;
            return {
                ok: false,
                status: last ? Number(last.status || 0) : 0,
                apiBase: last ? last.apiBase : '',
                reason: last ? last.reason : 'all_api_candidates_failed',
                attempts
            };
        }
