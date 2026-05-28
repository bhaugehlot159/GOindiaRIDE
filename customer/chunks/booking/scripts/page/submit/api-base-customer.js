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
