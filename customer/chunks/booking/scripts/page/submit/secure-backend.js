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
