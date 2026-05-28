        const DRIVER_AUTO_ASSIGN_ENABLED = false; // Temporarily disabled: admin-first live booking flow.
        const BOOKING_STRICT_LIVE_MODE = window.__GOINDIARIDE_BOOKING_STRICT_LIVE__ !== false;
        const API_BASE_QUARANTINE_KEY = 'goindiaride_api_base_quarantine_v1';
        const API_BASE_QUARANTINE_DEFAULT_MS = 45 * 60 * 1000;
        const API_BASE_QUARANTINE_STATIC_MS = 6 * 60 * 60 * 1000;
        const API_BASE_QUARANTINE_DNS_MS = 20 * 60 * 1000;
        const ADMIN_EMAIL_RETRY_QUEUE_KEY = 'goindiaride_admin_email_retry_queue_v1';
        const ADMIN_EMAIL_RETRY_COOLDOWN_KEY = 'goindiaride_admin_email_retry_cooldown_v1';
        const ADMIN_EMAIL_RETRY_MAX_ITEMS = 120;
        const ADMIN_EMAIL_RETRY_MAX_ATTEMPTS = 20;
        const ADMIN_EMAIL_RETRY_BATCH_SIZE = 4;
        const ADMIN_EMAIL_RETRY_BASE_DELAY_MS = 20 * 1000;
        const ADMIN_EMAIL_RETRY_MAX_DELAY_MS = 30 * 60 * 1000;
        const ADMIN_EMAIL_RETRY_THROTTLE_COOLDOWN_MS = 5 * 60 * 1000;
        const LAST_ADMIN_EMAIL_DISPATCH_KEY = 'goindiaride_last_admin_email_dispatch_v1';
        const ADMIN_REVIEW_INBOX_KEY = 'goindiaride_admin_review_inbox_v1';
        const CUSTOMER_BOOKING_LOCAL_STORE_KEYS = [
            'bookings',
            'goride_bookings',
            'goindiaride_active_bookings',
            'customerBookings',
            'customer_bookings',
            'goindiaride_live_customer_booking_queue_v1'
        ];
        let bookingSubmitInProgress = false;
        let adminEmailRetryIntervalRef = null;
        let adminEmailFlushInProgress = false;

        function readBookingStoreArray(key) {
            try {
                const parsed = JSON.parse(localStorage.getItem(key) || '[]');
                return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object') : [];
            } catch (_error) {
                return [];
            }
        }

        function mergeBookingCollections(baseItems, incomingItems) {
            const merged = new Map();
            [...(Array.isArray(baseItems) ? baseItems : []), ...(Array.isArray(incomingItems) ? incomingItems : [])].forEach((item) => {
                if (!item || typeof item !== 'object') return;
                const bookingId = String(item.id || item.bookingId || '').trim();
                if (!bookingId) return;
                const existing = merged.get(bookingId) || {};
                merged.set(bookingId, {
                    ...existing,
                    ...item,
                    id: bookingId,
                    bookingId
                });
            });
            return Array.from(merged.values())
                .sort((a, b) => Date.parse(String(b.createdAt || '')) - Date.parse(String(a.createdAt || '')));
        }

        function persistBookingStore(bookings) {
            const normalized = Array.isArray(bookings)
                ? bookings.filter((item) => item && typeof item === 'object')
                : [];
            CUSTOMER_BOOKING_LOCAL_STORE_KEYS.forEach((key) => {
                const mergedRows = mergeBookingCollections(readBookingStoreArray(key), normalized);
                localStorage.setItem(key, JSON.stringify(mergedRows));
            });
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
                ? items.filter((item) => item && typeof item === 'object')
                : [];
            localStorage.setItem(ADMIN_REVIEW_INBOX_KEY, JSON.stringify(normalized));
        }

        function mergeEmailDispatchState(existingValue, updates = {}) {
            const base = existingValue && typeof existingValue === 'object' ? existingValue : {};
            const next = updates && typeof updates === 'object' ? updates : {};
            const merged = {
                ...base,
                ...next
            };

            if (!merged.state) {
                merged.state = 'pending';
            }

            if (!merged.updatedAt) {
                merged.updatedAt = new Date().toISOString();
            }

            return merged;
        }

        function resolveEmailDispatchState(result, fallbackState = 'pending', fallbackReason = '') {
            const updatedAt = new Date().toISOString();
            if (!result || typeof result !== 'object') {
                return {
                    state: fallbackState || 'pending',
                    reason: sanitizeInput(fallbackReason || '', 140),
                    updatedAt
                };
            }

            if (result.sent === true) {
                return {
                    state: 'sent',
                    reason: '',
                    recipients: Number(result.recipients || 0) || 0,
                    updatedAt
                };
            }

            if (result.queued === true || result.reason === 'queued_background_send') {
                return {
                    state: 'queued',
                    reason: sanitizeInput(result.reason || 'queued_background_send', 140),
                    updatedAt
                };
            }

            if (result.reason === 'same_as_admin_recipient') {
                return {
                    state: 'skipped',
                    reason: 'same_as_admin_recipient',
                    updatedAt
                };
            }

            return {
                state: fallbackState || 'pending',
                reason: sanitizeInput(result.reason || result.message || fallbackReason || 'pending', 140),
                updatedAt
            };
        }

        function upsertAdminReviewInboxEntry(bookingRecord, extra = {}) {
            if (!bookingRecord || typeof bookingRecord !== 'object') return null;
            const bookingId = String(bookingRecord.id || bookingRecord.bookingId || extra.bookingId || '').trim();
            if (!bookingId) return null;

            const items = loadAdminReviewInboxStore();
            const idx = items.findIndex((item) => String(item.id || item.bookingId || '').trim() === bookingId);
            const existing = idx >= 0 ? items[idx] : {};
            const normalized = {
                ...existing,
                ...bookingRecord,
                ...extra,
                id: bookingId,
                bookingId,
                status: bookingRecord.status || extra.status || existing.status || 'pending_admin_review',
                adminReviewStatus: bookingRecord.adminReviewStatus || extra.adminReviewStatus || existing.adminReviewStatus || 'pending',
                createdAt: bookingRecord.createdAt || extra.createdAt || existing.createdAt || new Date().toISOString(),
                adminEmailDispatch: mergeEmailDispatchState(
                    existing.adminEmailDispatch,
                    bookingRecord.adminEmailDispatch || extra.adminEmailDispatch || {}
                ),
                customerEmailDispatch: mergeEmailDispatchState(
                    existing.customerEmailDispatch,
                    bookingRecord.customerEmailDispatch || extra.customerEmailDispatch || {}
                )
            };

            if (idx >= 0) {
                items[idx] = normalized;
            } else {
                items.unshift(normalized);
            }

            saveAdminReviewInboxStore(items);
            return normalized;
        }

        function updateBookingDeliveryState(bookingId, updates = {}) {
            const safeBookingId = String(bookingId || '').trim();
            if (!safeBookingId) return null;

            let mergedRecord = null;
            let bookings = [];
            try {
                const parsed = JSON.parse(localStorage.getItem('bookings') || '[]');
                bookings = Array.isArray(parsed) ? parsed : [];
            } catch (_error) {
                bookings = [];
            }

            const idx = bookings.findIndex((item) => String(item.id || item.bookingId || '').trim() === safeBookingId);
            if (idx >= 0) {
                const existing = bookings[idx] || {};
                mergedRecord = {
                    ...existing,
                    ...updates,
                    id: safeBookingId,
                    bookingId: safeBookingId,
                    adminEmailDispatch: mergeEmailDispatchState(existing.adminEmailDispatch, updates.adminEmailDispatch || {}),
                    customerEmailDispatch: mergeEmailDispatchState(existing.customerEmailDispatch, updates.customerEmailDispatch || {})
                };
                bookings[idx] = mergedRecord;
                persistBookingStore(bookings);
            }

            const inboxSeed = mergedRecord || {
                id: safeBookingId,
                bookingId: safeBookingId,
                ...updates
            };

            return upsertAdminReviewInboxEntry(inboxSeed);
        }

        function upsertBookingInLocalStore(bookingRecord) {
            const bookingId = String(bookingRecord.id || bookingRecord.bookingId || '').trim();
            if (!bookingId) return null;

            const normalized = {
                ...bookingRecord,
                id: bookingId,
                bookingId: bookingId,
                status: bookingRecord.status === 'pending' ? 'pending_admin_review' : (bookingRecord.status || 'pending_admin_review'),
                adminReviewStatus: bookingRecord.adminReviewStatus || 'pending',
                adminBookingScope: bookingRecord.adminBookingScope || 'customer',
                sourceKey: bookingRecord.sourceKey || 'customer_booking_submit',
                pickupLocation: bookingRecord.pickupLocation || bookingRecord.pickup || '',
                dropoff: bookingRecord.dropoff || bookingRecord.drop || bookingRecord.dropLocation || '',
                drop: bookingRecord.drop || bookingRecord.dropoff || bookingRecord.dropLocation || '',
                dropLocation: bookingRecord.dropLocation || bookingRecord.dropoff || bookingRecord.drop || '',
                totalFare: Number(bookingRecord.totalFare || bookingRecord.amount || bookingRecord.fare || 0),
                amount: Number(bookingRecord.amount || bookingRecord.totalFare || bookingRecord.fare || 0),
                customerSnapshot: {
                    name: sanitizeInput(bookingRecord.customerSnapshot?.name || bookingRecord.customerName || 'Customer', 140),
                    email: sanitizeInput(bookingRecord.customerSnapshot?.email || bookingRecord.customerEmail || '', 180),
                    phone: sanitizeInput(bookingRecord.customerSnapshot?.phone || bookingRecord.customerPhone || '', 40)
                },
                createdAt: bookingRecord.createdAt || new Date().toISOString(),
                adminEmailDispatch: mergeEmailDispatchState(
                    bookingRecord.adminEmailDispatch,
                    bookingRecord.adminEmailDispatch || {}
                ),
                customerEmailDispatch: mergeEmailDispatchState(
                    bookingRecord.customerEmailDispatch,
                    bookingRecord.customerEmailDispatch || {}
                )
            };

            const bookings = JSON.parse(localStorage.getItem('bookings')) || [];
            const existingIdx = bookings.findIndex((item) => String(item.id || item.bookingId || '') === bookingId);

            if (existingIdx === -1) {
                bookings.unshift(normalized);
            } else {
                bookings[existingIdx] = { ...bookings[existingIdx], ...normalized };
            }

            persistBookingStore(bookings);
            upsertAdminReviewInboxEntry(normalized);
            return normalized;
        }

        function notifyAdminBookingReviewRequired(bookingRecord) {
            const safeBookingId = String(bookingRecord.id || bookingRecord.bookingId || '').trim();
            if (!safeBookingId || !window.PortalConnector || typeof PortalConnector.createNotification !== 'function') {
                return;
            }

            PortalConnector.createNotification({
                type: 'booking_pending_admin_review',
                title: 'New Booking for Admin Review',
                message: `Booking ${safeBookingId} submitted by ${sanitizeInput(bookingRecord.customerName || 'customer')}.`,
                booking: bookingRecord,
                sourcePortal: 'customer',
                targetPortals: ['admin'],
                metadata: {
                    stage: 'pending_admin_review',
                    bookingId: safeBookingId,
                    customerId: bookingRecord.customerId || null,
                    mode: bookingRecord.mode || 'local_fallback'
                }
            });
        }

        function renderBookingSubmissionSuccess(bookingId, toastMessage) {
            document.getElementById('bookingReference').textContent = `Reference: #${bookingId} | Admin approval pending`;
            document.getElementById('matchingCard').style.display = 'none';
            document.getElementById('driverDetails').classList.remove('show');
            document.getElementById('successModal').classList.add('active');
        }

        function queueBookingForAdminReview(booking, mode, backendStatus, toastMessage) {
            const normalized = upsertBookingInLocalStore({
                ...booking,
                id: sanitizeInput(booking.id || booking.bookingId || (`RID${Date.now()}`)),
                bookingId: sanitizeInput(booking.bookingId || booking.id || (`RID${Date.now()}`)),
                mode: mode || booking.mode || 'local_secure_fallback',
                backendStatus: backendStatus || booking.backendStatus || 'queued_local_fallback',
                status: booking.status || 'pending_admin_review',
                adminReviewStatus: booking.adminReviewStatus || 'pending',
                createdAt: new Date().toISOString(),
                adminEmailDispatch: booking.adminEmailDispatch || {
                    state: 'pending',
                    reason: sanitizeInput(backendStatus || 'queued_local_fallback', 140),
                    updatedAt: new Date().toISOString()
                },
                customerEmailDispatch: booking.customerEmailDispatch || {
                    state: 'pending',
                    reason: 'awaiting_dispatch',
                    updatedAt: new Date().toISOString()
                }
            });

            if (!normalized) return null;
            notifyAdminBookingReviewRequired(normalized);
            renderBookingSubmissionSuccess(normalized.id, toastMessage);
            return normalized;
        }

        async function submitBookingThroughAdminReviewFallback(booking, reason = 'customer_booking_submit', options = {}) {
            const fallbackReason = sanitizeInput(reason || 'customer_booking_submit', 140);
            const mode = sanitizeInput(options.mode || 'local_secure_fallback', 80);
            const toastMessage = sanitizeInput(
                options.toastMessage || `Booking ${booking?.bookingId || booking?.id || ''} submitted for admin review.`,
                220
            );

            if (options.clearAccessToken === true) {
                clearBackendAccessTokens();
            }

            const queuedBooking = queueBookingForAdminReview(
                booking,
                mode,
                fallbackReason,
                toastMessage
            );

            if (!queuedBooking) {
                showError('Booking failed. Please try again.');
                return { ok: false, reason: 'queue_booking_failed' };
            }

            const queueResult = await queueBookingRecordForBackendAdminReview(queuedBooking, fallbackReason);
            if (!queueResult.ok) {
                console.warn('Admin review queue sync pending:', queueResult.reason || 'queue_failed');
            }

            const emailResult = await sendAdminEmailForQueuedBooking(queuedBooking, fallbackReason);
            if (emailResult.ok) {
                removeAdminEmailRetry(emailResult.bookingId || queuedBooking.id);
                handleBookingEmailDispatchFeedback(emailResult);
            } else {
                const pendingReason = getAdminEmailPendingReason(emailResult);
                handleBookingEmailDispatchFeedback(emailResult, { silentAdminToast: true });
                enqueueAdminEmailRetry(queuedBooking, pendingReason);
            }

            return {
                ok: true,
                bookingId: queuedBooking.id || queuedBooking.bookingId,
                queueResult,
                emailResult
            };
        }

        function handleBookingEmailDispatchFeedback(emailResult, { silentAdminToast = false } = {}) {
            if (!emailResult || typeof emailResult !== 'object') return;

            if (emailResult.bookingId) {
                updateBookingDeliveryState(emailResult.bookingId, {
                    adminEmailDispatch: resolveEmailDispatchState(
                        emailResult.adminEmail,
                        emailResult.ok ? 'sent' : 'pending',
                        emailResult.reason || 'admin_email_pending'
                    ),
                    customerEmailDispatch: resolveEmailDispatchState(
                        emailResult.customerEmail,
                        'pending',
                        emailResult.reason || 'customer_email_pending'
                    ),
                    lastEmailDispatchAt: new Date().toISOString()
                });
            }

            // Customer booking page should only show the booking success modal.
            // Keep delivery state updates, but suppress background email-status toasts here.
        }

        function loadAdminEmailRetryQueue() {
            try {
                const parsed = JSON.parse(localStorage.getItem(ADMIN_EMAIL_RETRY_QUEUE_KEY) || '[]');
                if (!Array.isArray(parsed)) return [];
                return parsed.filter((item) => item && typeof item === 'object').slice(0, ADMIN_EMAIL_RETRY_MAX_ITEMS);
            } catch (_error) {
                return [];
            }
        }

        function saveAdminEmailRetryQueue(items) {
            const queue = Array.isArray(items) ? items.slice(0, ADMIN_EMAIL_RETRY_MAX_ITEMS) : [];
            localStorage.setItem(ADMIN_EMAIL_RETRY_QUEUE_KEY, JSON.stringify(queue));
        }

        function removeAdminEmailRetry(bookingId) {
            const safeBookingId = sanitizeInput(bookingId || '', 120);
            if (!safeBookingId) return;
            const filtered = loadAdminEmailRetryQueue().filter((item) => sanitizeInput(item.bookingId || '', 120) !== safeBookingId);
            saveAdminEmailRetryQueue(filtered);
        }

        function readAdminEmailCooldown() {
            try {
                const parsed = JSON.parse(localStorage.getItem(ADMIN_EMAIL_RETRY_COOLDOWN_KEY) || '{}');
                if (!parsed || typeof parsed !== 'object') return { untilMs: 0, reason: '' };
                return {
                    untilMs: Number(parsed.untilMs || 0),
                    reason: sanitizeInput(parsed.reason || '', 140)
                };
            } catch (_error) {
                return { untilMs: 0, reason: '' };
            }
        }

        function clearAdminEmailCooldown() {
            localStorage.removeItem(ADMIN_EMAIL_RETRY_COOLDOWN_KEY);
        }

        function setAdminEmailCooldown(delayMs, reason = '') {
            const now = Date.now();
            const normalizedDelay = Math.max(30 * 1000, Math.min(Number(delayMs || 0), ADMIN_EMAIL_RETRY_MAX_DELAY_MS));
            const nextState = {
                untilMs: now + normalizedDelay,
                reason: sanitizeInput(reason || 'retry_cooldown', 140),
                updatedAt: new Date(now).toISOString()
            };
            localStorage.setItem(ADMIN_EMAIL_RETRY_COOLDOWN_KEY, JSON.stringify(nextState));
            return nextState.untilMs;
        }

        function parseRetryTimestamp(value) {
            const text = String(value || '').trim();
            if (!text) return 0;
            const time = Date.parse(text);
            return Number.isFinite(time) ? time : 0;
        }

        function isAdminEmailRateLimited(result = {}) {
            const directStatus = Number(result.status || 0);
            if (directStatus === 429) return true;
            const attempts = Array.isArray(result.attempts) ? result.attempts : [];
            if (attempts.some((attempt) => Number(attempt && attempt.status || 0) === 429)) return true;
            const reason = String(result.reason || '').toLowerCase();
            return reason.includes('http_429') || reason.includes('too many');
        }

        function nextRetryDelayMs(retryCount, reason = '', isRateLimited = false) {
            if (isRateLimited) return ADMIN_EMAIL_RETRY_THROTTLE_COOLDOWN_MS;
            const normalizedRetry = Math.max(0, Math.min(Number(retryCount || 0), 10));
            const expDelay = ADMIN_EMAIL_RETRY_BASE_DELAY_MS * Math.pow(2, normalizedRetry);
            const capped = Math.min(expDelay, ADMIN_EMAIL_RETRY_MAX_DELAY_MS);
            const hint = String(reason || '').toLowerCase();
            if (hint.includes('api_proxy_not_configured_405') || hint.includes('api_route_missing_404') || hint.includes('http_405') || hint.includes('http_404')) {
                return Math.min(capped, 15 * 60 * 1000);
            }
            if (hint.includes('api_domain_unreachable') || hint.includes('resolve') || hint.includes('dns') || hint.includes('network')) {
                return Math.min(capped, 10 * 60 * 1000);
            }
            if (hint.includes('network') || hint.includes('timeout') || hint.includes('abort')) {
                return Math.min(capped, 5 * 60 * 1000);
            }
            return capped;
        }

        function enqueueAdminEmailRetry(bookingRecord, reason = 'retry_queued') {
            if (!bookingRecord || typeof bookingRecord !== 'object') return;
            const bookingId = sanitizeInput(bookingRecord.id || bookingRecord.bookingId || '');
            if (!bookingId) return;

            const queue = loadAdminEmailRetryQueue();
            const existingIdx = queue.findIndex((item) => sanitizeInput(item.bookingId || '') === bookingId);
            const payload = {
                bookingId,
                bookingRecord,
                reason: sanitizeInput(reason || 'retry_queued', 120),
                retryCount: existingIdx >= 0 ? Number(queue[existingIdx].retryCount || 0) : 0,
                nextAttemptAt: existingIdx >= 0 ? queue[existingIdx].nextAttemptAt : new Date().toISOString(),
                createdAt: existingIdx >= 0 ? queue[existingIdx].createdAt : new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            if (existingIdx >= 0) {
                queue[existingIdx] = {
                    ...queue[existingIdx],
                    ...payload
                };
            } else {
                queue.unshift(payload);
            }

            saveAdminEmailRetryQueue(queue);
        }

        async function flushAdminEmailRetryQueue({ silent = true } = {}) {
            if (adminEmailFlushInProgress) return;
            const queue = loadAdminEmailRetryQueue();
            if (!queue.length) return;

            const now = Date.now();
            const cooldown = readAdminEmailCooldown();
            if (cooldown.untilMs > now) {
                return;
            }

            adminEmailFlushInProgress = true;
            const remaining = [];
            try {
                const sortedQueue = [...queue].sort((a, b) => {
                    const aDue = parseRetryTimestamp(a && a.nextAttemptAt);
                    const bDue = parseRetryTimestamp(b && b.nextAttemptAt);
                    if (aDue !== bDue) return aDue - bDue;
                    const aUpdated = parseRetryTimestamp(a && a.updatedAt);
                    const bUpdated = parseRetryTimestamp(b && b.updatedAt);
                    return aUpdated - bUpdated;
                });

                let processed = 0;
                for (const item of sortedQueue) {
                    const safeBooking = item && item.bookingRecord ? item.bookingRecord : null;
                    if (!safeBooking) continue;

                    const retryCount = Number(item.retryCount || 0);
                    if (retryCount >= ADMIN_EMAIL_RETRY_MAX_ATTEMPTS) {
                        continue;
                    }

                    const dueAtMs = parseRetryTimestamp(item.nextAttemptAt);
                    if (dueAtMs > now) {
                        remaining.push(item);
                        continue;
                    }

                    if (processed >= ADMIN_EMAIL_RETRY_BATCH_SIZE) {
                        remaining.push(item);
                        continue;
                    }
                    processed += 1;

                    const result = await sendAdminEmailForQueuedBooking(
                        safeBooking,
                        sanitizeInput(item.reason || 'retry_queued', 120)
                    );

                    if (result.ok) {
                        clearAdminEmailCooldown();
                        continue;
                    }

                    const reason = sanitizeInput(result.reason || 'retry_failed', 140);
                    const rateLimited = isAdminEmailRateLimited(result);
                    const delayMs = nextRetryDelayMs(retryCount + 1, reason, rateLimited);
                    const nextAttemptAt = new Date(Date.now() + delayMs).toISOString();
                    if (rateLimited) {
                        setAdminEmailCooldown(ADMIN_EMAIL_RETRY_THROTTLE_COOLDOWN_MS, reason);
                    }

                    remaining.push({
                        ...item,
                        retryCount: retryCount + 1,
                        lastReason: reason,
                        nextAttemptAt,
                        updatedAt: new Date().toISOString(),
                        customerEmail: result.customerEmail || item.customerEmail || null
                    });
                }

                saveAdminEmailRetryQueue(remaining);
            } finally {
                adminEmailFlushInProgress = false;
            }
        }
