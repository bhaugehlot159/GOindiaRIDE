// ----------------------------------------====
        // AUTHENTICATION CHECK
        // ----------------------------------------====

        async function checkAuth() {
            if (window.GoIndiaSessionContinuity && typeof window.GoIndiaSessionContinuity.restorePortalSession === 'function') {
                try {
                    const restored = await window.GoIndiaSessionContinuity.restorePortalSession({
                        role: 'customer',
                        preferFastLocal: true
                    });
                    if (restored && restored.ok && restored.user) {
                        window.currentUser = restored.user;
                        localStorage.setItem('currentUser', JSON.stringify(restored.user));
                        localStorage.setItem('userRole', 'customer');
                        return restored.user;
                    }
                } catch (_error) {
                    // Fall back to local session check below.
                }
            }

            const userRole = localStorage.getItem('userRole');
            const storedCurrentUser = localStorage.getItem('currentUser');

            if (userRole !== 'customer' || !storedCurrentUser) {
                alert('Please login as customer first');
                window.location.href = './login.html';
                return null;
            }

            const parsed = JSON.parse(storedCurrentUser);
            window.currentUser = parsed;
            return parsed;
        }

        let currentUser = null;
        let selectedDonationAmount = 0;
        let currentRideForDonation = null;
        let customerRealtimeSyncTimer = null;
        const ADMIN_BOOKING_EDIT_SIGNAL_KEY = 'goindiaride_admin_booking_edit_signal_v1';
        const DASHBOARD_BOOKING_SYNC_KEYS = [
            'goride_bookings',
            'bookings',
            'goindiaride_active_bookings',
            'goindiaride_scheduled_rides',
            'goindiaride_ride_history',
            'goindiaride_admin_review_inbox_v1',
            'goindiaride_admin_customer_bookings_current_v1',
            'customerBookings',
            'customer_bookings',
            'goindiaride_live_customer_booking_queue_v1'
        ];
        const DASHBOARD_ADMIN_EMAIL_RETRY_QUEUE_KEY = 'goindiaride_admin_email_retry_queue_v1';
        const DASHBOARD_ADMIN_EMAIL_BATCH_SIZE = 3;
        const PROFILE_PHONE_VERIFICATION_SESSION_KEY = 'goindiaride-dashboard-phone-verify';
        const CUSTOMER_BOOKING_EDIT_MAX_COUNT = 5;
        const CUSTOMER_BOOKING_EDITABLE_FIELDS = [
            'pickup',
            'dropoff',
            'rideDate',
            'rideTime',
            'returnDate',
            'returnTime',
            'tripPlan',
            'paymentMethod',
            'vehicleType',
            'passengers',
            'luggage',
            'stop1',
            'stop2',
            'notes',
            'specialRequests',
            'safetyAccessibility'
        ];
        const RIDE_EDIT_SPECIAL_REQUEST_KEYS = ['airCondition', 'wifi', 'charger', 'music'];
        const RIDE_EDIT_SAFETY_KEYS = ['womenDriverPref', 'childSeat', 'wheelchairAssist', 'petFriendly', 'liveTripShare', 'maskedCall'];
        const CUSTOMER_BOOKING_EDIT_WINDOWS = [
            { minHours: 72, tier: 'full_plus', label: '72h+ Premium Edit', allowedFields: CUSTOMER_BOOKING_EDITABLE_FIELDS.slice() },
            { minHours: 48, tier: 'full', label: '48-72h Flexible Edit', allowedFields: CUSTOMER_BOOKING_EDITABLE_FIELDS.slice() },
            { minHours: 24, tier: 'standard', label: '24-48h Smart Edit', allowedFields: CUSTOMER_BOOKING_EDITABLE_FIELDS.slice() },
            { minHours: 12, tier: 'limited', label: '12-24h Priority Edit', allowedFields: CUSTOMER_BOOKING_EDITABLE_FIELDS.slice() },
            { minHours: 6, tier: 'minimal', label: '6-12h Fast Edit', allowedFields: CUSTOMER_BOOKING_EDITABLE_FIELDS.slice() }
        ];
        const CUSTOMER_BOOKING_EDIT_LOCK_HOURS = 6;
        let currentRideForEdit = null;
        let currentRideEditPolicy = null;

        function normalizeApiBase(value) {
            const text = String(value || '').trim();
            if (!text) return '';
            return text.replace(/\/$/, '');
        }

        function normalizeDashboardPhoneValue(value) {
            if (window.GoIndiaPhoneVerification && typeof window.GoIndiaPhoneVerification.normalizePhone === 'function') {
                return window.GoIndiaPhoneVerification.normalizePhone(value);
            }

            const raw = String(value || '').trim();
            if (!raw) return '';

            let normalized = raw.replace(/\s+/g, '');
            if (normalized.startsWith('00')) {
                normalized = `+${normalized.slice(2)}`;
            }

            if (normalized.startsWith('+')) {
                const digits = normalized.slice(1).replace(/\D/g, '');
                return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : '';
            }

            const digitsOnly = normalized.replace(/\D/g, '');
            if (digitsOnly.length === 10 && /^[6-9]\d{9}$/.test(digitsOnly)) {
                return `+91${digitsOnly}`;
            }

            return digitsOnly.length >= 8 && digitsOnly.length <= 15 ? `+${digitsOnly}` : '';
        }

        function normalizeDashboardEmailValue(value) {
            return String(value || '').trim().toLowerCase();
        }

        function sanitizeInput(value, maxLen = 180) {
            const limit = Number.isFinite(maxLen) ? maxLen : 180;
            return String(value || '')
                .replace(/[\u0000-\u001f<>]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, limit);
        }

        function escapeHtml(value) {
            return String(value || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function escapeHtmlAttr(value) {
            return String(value || '')
                .replace(/&/g, '&amp;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        }

        function normalizeDashboardNameValue(value) {
            const cleaner = typeof sanitizeInput === 'function'
                ? sanitizeInput
                : ((rawValue, maxLen = 180) => String(rawValue || '')
                    .replace(/[\u0000-\u001f<>]/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .slice(0, maxLen));
            return cleaner(value || '', 140).trim();
        }

        function getDashboardAccessToken() {
            return String(
                localStorage.getItem('accessToken')
                || localStorage.getItem('authToken')
                || localStorage.getItem('token')
                || ''
            ).trim();
        }

        function persistDashboardCurrentUserSession(partial = {}) {
            currentUser = {
                ...(currentUser || {}),
                ...(partial && typeof partial === 'object' ? partial : {})
            };
            if (window.GoIndiaSessionContinuity && typeof window.GoIndiaSessionContinuity.getIdentityAliases === 'function') {
                try {
                    const identity = window.GoIndiaSessionContinuity.getIdentityAliases(currentUser, 'customer');
                    if (identity && identity.primaryId) {
                        currentUser.id = identity.primaryId;
                    }
                } catch (_error) {
                    // Ignore continuity identity failures.
                }
            }
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            window.currentUser = currentUser;
            if (window.GoIndiaSessionContinuity && typeof window.GoIndiaSessionContinuity.storeAuthArtifacts === 'function') {
                try {
                    window.GoIndiaSessionContinuity.storeAuthArtifacts({
                        accountType: 'customer',
                        user: currentUser,
                        accessToken: getDashboardAccessToken(),
                        apiBase: normalizeApiBase(localStorage.getItem('goindiaride_api_base') || window.__GOINDIARIDE_RUNTIME_API_ORIGIN__ || window.__GOINDIARIDE_API_ORIGIN__ || '')
                    });
                } catch (_error) {
                    // Ignore continuity sync failures.
                }
            }
        }

        function uniqueDashboardValues(values = []) {
            return Array.from(new Set((Array.isArray(values) ? values : [])
                .map((item) => String(item || '').trim())
                .filter(Boolean)));
        }

        function getDashboardCustomerIdentity() {
            if (window.GoIndiaSessionContinuity && typeof window.GoIndiaSessionContinuity.getIdentityAliases === 'function') {
                try {
                    return window.GoIndiaSessionContinuity.getIdentityAliases(currentUser || {}, 'customer');
                } catch (_error) {
                    // Fall back to local identity builder.
                }
            }

            const email = normalizeDashboardEmailValue(currentUser?.email || '');
            const phone = normalizeDashboardPhoneValue(currentUser?.phone || '');
            const primaryId = String(currentUser?.id || '').trim() || 'customer_default';
            return {
                primaryId,
                ids: uniqueDashboardValues([primaryId, currentUser?.backendUserId, currentUser?.userId]),
                emails: uniqueDashboardValues([email]),
                phones: uniqueDashboardValues([phone])
            };
        }

        function getCustomerWalletOwnerId() {
            const identity = getDashboardCustomerIdentity();
            return String(identity.primaryId || currentUser?.id || currentUser?.userId || 'customer_default');
        }

        function mergeCustomerScopedArrayValues(existing = [], incoming = []) {
            const items = []
                .concat(Array.isArray(existing) ? existing : [])
                .concat(Array.isArray(incoming) ? incoming : []);
            const seen = new Set();
            return items.filter((item) => {
                if (!item || typeof item !== 'object') return false;
                const key = String(item.id || item.rideId || item.bookingId || item.referenceId || [item.amount, item.createdAt, item.type, item.description, item.content].join('|')).trim();
                if (!key || seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        }

        function mergeCustomerScopedObjectValues(existing = {}, incoming = {}) {
            const base = (existing && typeof existing === 'object' && !Array.isArray(existing)) ? existing : {};
            const next = (incoming && typeof incoming === 'object' && !Array.isArray(incoming)) ? incoming : {};
            const merged = { ...base, ...next };
            if (Array.isArray(base.transactions) || Array.isArray(next.transactions)) {
                merged.transactions = mergeCustomerScopedArrayValues(base.transactions || [], next.transactions || []);
            }
            if (typeof merged.balance !== 'number') {
                merged.balance = Number(merged.balance || 0) || 0;
            }
            return merged;
        }

        function readCustomerScopedStorage(prefix, fallbackValue) {
            const identity = getDashboardCustomerIdentity();
            const ids = Array.isArray(identity.ids) && identity.ids.length
                ? identity.ids
                : [getCustomerWalletOwnerId()];
            const isArrayFallback = Array.isArray(fallbackValue);
            let merged = isArrayFallback ? [] : ((fallbackValue && typeof fallbackValue === 'object') ? { ...fallbackValue } : fallbackValue);
            let found = false;

            ids.forEach((id) => {
                try {
                    const raw = localStorage.getItem(`${prefix}${id}`);
                    if (!raw) return;
                    const parsed = JSON.parse(raw);
                    if (isArrayFallback) {
                        merged = mergeCustomerScopedArrayValues(merged, parsed);
                    } else if (fallbackValue && typeof fallbackValue === 'object') {
                        merged = mergeCustomerScopedObjectValues(merged, parsed);
                    } else if (!found) {
                        merged = parsed;
                    }
                    found = true;
                } catch (_error) {
                    // Ignore corrupted local records.
                }
            });

            if (found) {
                writeCustomerScopedStorage(prefix, merged);
            }

            return found ? merged : fallbackValue;
        }

        function writeCustomerScopedStorage(prefix, value) {
            const ownerId = getCustomerWalletOwnerId();
            localStorage.setItem(`${prefix}${ownerId}`, JSON.stringify(value));
        }

        function customerOwnsStoredRecord(record) {
            if (!record || typeof record !== 'object') return false;
            const identity = getDashboardCustomerIdentity();
            const idCandidates = new Set(identity.ids || []);
            const emailCandidates = new Set(identity.emails || []);
            const phoneCandidates = new Set(identity.phones || []);

            const recordIds = uniqueDashboardValues([
                record.customerId,
                record.userId,
                record.ownerId,
                record.accountId,
                record.backendUserId
            ]);
            for (const id of recordIds) {
                if (idCandidates.has(id)) return true;
            }

            const recordEmails = uniqueDashboardValues([
                normalizeDashboardEmailValue(record.customerEmail || ''),
                normalizeDashboardEmailValue(record.email || ''),
                normalizeDashboardEmailValue(record.userEmail || '')
            ]);
            for (const email of recordEmails) {
                if (emailCandidates.has(email)) return true;
            }

            const recordPhones = uniqueDashboardValues([
                normalizeDashboardPhoneValue(record.customerPhone || ''),
                normalizeDashboardPhoneValue(record.phone || ''),
                normalizeDashboardPhoneValue(record.mobile || ''),
                normalizeDashboardPhoneValue(record.contact || '')
            ]);
            for (const phone of recordPhones) {
                if (phoneCandidates.has(phone)) return true;
            }

            return false;
        }

        function readDashboardBookingsStore() {
            const storageKeys = DASHBOARD_BOOKING_SYNC_KEYS;
            const rows = [];
            storageKeys.forEach((key) => {
                try {
                    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
                    if (Array.isArray(parsed)) {
                        parsed.forEach((item) => {
                            if (item && typeof item === 'object') rows.push(item);
                        });
                    }
                } catch (_error) {
                    // Ignore broken legacy entries and keep the remaining booking stores alive.
                }
            });

            const toDashboardTimestamp = (value) => {
                const time = new Date(value || 0).getTime();
                return Number.isFinite(time) ? time : 0;
            };
            const dashboardBookingFreshness = (booking) => {
                if (!booking || typeof booking !== 'object') return 0;
                return Math.max(
                    toDashboardTimestamp(booking.adminLastEditedAt),
                    toDashboardTimestamp(booking.lastEditedAt),
                    toDashboardTimestamp(booking.adminCustomerSyncedAt),
                    toDashboardTimestamp(booking.updatedAt),
                    toDashboardTimestamp(booking.createdAt)
                );
            };
            const dashboardBookingScore = (booking) => {
                if (!booking || typeof booking !== 'object') return 0;
                let score = 0;
                const source = String(booking.sourceKey || '').toLowerCase();
                if (booking.adminLastEditedAt || booking.adminCustomerSyncedAt || booking.adminCustomerSyncStatus) score += 40;
                if (source.includes('admin') || source.includes('fallback')) score += 15;
                return score;
            };
            const mergeDashboardBookingRows = (existing, incoming) => {
                if (!existing) return { ...(incoming || {}) };
                if (!incoming) return { ...(existing || {}) };
                const existingScore = dashboardBookingScore(existing);
                const incomingScore = dashboardBookingScore(incoming);
                if (incomingScore > existingScore) return { ...existing, ...incoming };
                if (incomingScore < existingScore) return { ...incoming, ...existing };
                if (dashboardBookingFreshness(incoming) >= dashboardBookingFreshness(existing)) return { ...existing, ...incoming };
                return { ...incoming, ...existing };
            };

            const mergedByRef = new Map();
            const looseRows = [];
            rows.forEach((booking) => {
                if (!booking || typeof booking !== 'object') return;
                const ref = String(booking.bookingId || booking.id || '').trim();
                if (!ref) {
                    looseRows.push(booking);
                    return;
                }
                mergedByRef.set(ref, mergeDashboardBookingRows(mergedByRef.get(ref) || null, booking));
            });
            const merged = [
                ...looseRows,
                ...Array.from(mergedByRef.values()).sort((left, right) => {
                    return new Date(right.updatedAt || right.createdAt || 0).getTime()
                        - new Date(left.updatedAt || left.createdAt || 0).getTime();
                })
            ];
            if (merged.length) {
                try {
                    localStorage.setItem('bookings', JSON.stringify(merged));
                    localStorage.setItem('goride_bookings', JSON.stringify(merged));
                } catch (_error) {
                    // Keep rendering the in-memory merged rows even if browser storage is full.
                }
            }
            return merged;
        }

        function getCustomerBookingsFromStore() {
            const customerRows = readDashboardBookingsStore().filter((booking) => customerOwnsStoredRecord(booking));
            mirrorDashboardBookingsForAdminPortal(customerRows);
            return customerRows;
        }

        function mirrorDashboardBookingsForAdminPortal(bookings) {
            if (!Array.isArray(bookings) || !bookings.length) return;
            const keys = DASHBOARD_BOOKING_SYNC_KEYS;
            keys.forEach((key) => {
                let rows = [];
                try {
                    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
                    rows = Array.isArray(parsed) ? parsed : [];
                } catch (_error) {
                    rows = [];
                }

                const byId = new Map();
                rows.forEach((row) => {
                    const id = String(row && (row.bookingId || row.id) || '').trim();
                    if (id) byId.set(id, row);
                });

                bookings.forEach((booking) => {
                    if (!booking || typeof booking !== 'object') return;
                    const id = String(booking.bookingId || booking.id || '').trim();
                    if (!id) return;
                    const existing = byId.get(id) || {};
                    byId.set(id, {
                        ...existing,
                        ...booking,
                        id,
                        bookingId: id,
                        pickup: booking.pickup || booking.pickupLocation || existing.pickup || '',
                        pickupLocation: booking.pickupLocation || booking.pickup || existing.pickupLocation || '',
                        dropoff: booking.dropoff || booking.dropLocation || booking.drop || existing.dropoff || '',
                        dropLocation: booking.dropLocation || booking.dropoff || booking.drop || existing.dropLocation || '',
                        totalFare: Number(booking.totalFare || booking.amount || booking.fare || existing.totalFare || existing.fare || 0),
                        amount: Number(booking.amount || booking.totalFare || booking.fare || existing.amount || existing.fare || 0),
                        status: booking.status || existing.status || 'pending_admin_review',
                        adminReviewStatus: booking.adminReviewStatus || existing.adminReviewStatus || 'pending',
                        updatedAt: booking.updatedAt || new Date().toISOString()
                    });
                });

                localStorage.setItem(key, JSON.stringify(Array.from(byId.values())));
            });
        }

        function migrateLegacyCustomerDashboardStores() {
            if (!currentUser) return;
            const identity = getDashboardCustomerIdentity();
            const primaryId = getCustomerWalletOwnerId();

            const donations = readCustomerScopedStorage('customerDonations_', []);
            writeCustomerScopedStorage('customerDonations_', donations);

            const wallet = readCustomerScopedStorage('wallet_', { balance: 0, transactions: [] });
            writeCustomerScopedStorage('wallet_', wallet);

            const bookings = readDashboardBookingsStore();
            let bookingsChanged = false;
            const normalizedBookings = bookings.map((booking) => {
                if (!customerOwnsStoredRecord(booking)) return booking;
                if (String(booking.customerId || '').trim() === primaryId) return booking;
                bookingsChanged = true;
                return {
                    ...booking,
                    customerId: primaryId,
                    backendUserId: currentUser?.backendUserId || booking.backendUserId || '',
                    customerEmail: normalizeDashboardEmailValue(currentUser?.email || booking.customerEmail || booking.email || ''),
                    customerPhone: normalizeDashboardPhoneValue(currentUser?.phone || booking.customerPhone || booking.phone || '')
                };
            });
            if (bookingsChanged) {
                localStorage.setItem('bookings', JSON.stringify(normalizedBookings));
                localStorage.setItem('goride_bookings', JSON.stringify(normalizedBookings));
            }

            try {
                const rawMessages = JSON.parse(localStorage.getItem('goride_messages') || '[]');
                if (Array.isArray(rawMessages) && rawMessages.length) {
                    let messagesChanged = false;
                    const migratedMessages = rawMessages.map((message) => {
                        if (!message || typeof message !== 'object') return message;
                        let nextMessage = message;
                        if ((identity.ids || []).includes(String(message.senderId || '').trim()) && String(message.senderId || '').trim() !== primaryId) {
                            nextMessage = { ...nextMessage, senderId: primaryId };
                            messagesChanged = true;
                        }
                        if ((identity.ids || []).includes(String(message.receiverId || '').trim()) && String(message.receiverId || '').trim() !== primaryId) {
                            nextMessage = { ...nextMessage, receiverId: primaryId };
                            messagesChanged = true;
                        }
                        return nextMessage;
                    });
                    if (messagesChanged) {
                        localStorage.setItem('goride_messages', JSON.stringify(migratedMessages));
                    }
                }
            } catch (_error) {
                // Ignore message migration failures.
            }

            const chatKeys = uniqueDashboardValues((identity.ids || []).map((id) => `goride_chat_initialized_${id}`));
            const hasChatInit = chatKeys.some((key) => localStorage.getItem(key) === 'true');
            if (hasChatInit) {
                localStorage.setItem(`goride_chat_initialized_${primaryId}`, 'true');
            }
        }

        function updateDashboardCustomerAccountStores(profilePatch = {}, verified = false) {
            const patch = profilePatch && typeof profilePatch === 'object'
                ? profilePatch
                : { phone: profilePatch, isPhoneVerified: verified, phoneVerified: verified };
            const safePhone = normalizeDashboardPhoneValue(patch.phone || patch.mobile || currentUser?.phone || '');
            const safeName = normalizeDashboardNameValue(patch.fullname || patch.name || currentUser?.fullname || currentUser?.name || '');
            const safeEmail = normalizeDashboardEmailValue(patch.email || currentUser?.email || '');
            const safeVerified = Boolean(
                Object.prototype.hasOwnProperty.call(patch, 'isPhoneVerified')
                    ? patch.isPhoneVerified
                    : (Object.prototype.hasOwnProperty.call(patch, 'phoneVerified') ? patch.phoneVerified : verified)
            );
            const safeUserId = String(currentUser?.id || '').trim();
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
                        const itemId = String(item.id || item.backendUserId || '').trim();
                        const itemEmail = String(item.email || item.userEmail || '').trim().toLowerCase();
                        const itemPhone = normalizeDashboardPhoneValue(item.phone || item.mobile || item.contact || item.contact1 || '');
                        const currentPhone = normalizeDashboardPhoneValue(currentUser?.phone || '');
                        const matches = Boolean(
                            (safeUserId && itemId && itemId === safeUserId)
                            || (safeEmail && itemEmail && itemEmail === safeEmail)
                            || (currentPhone && itemPhone && itemPhone === currentPhone)
                        );
                        if (!matches) return item;
                        changed = true;
                        return {
                            ...item,
                            ...(safeName ? { fullname: safeName, name: safeName } : {}),
                            ...(safeEmail ? { email: safeEmail, userEmail: safeEmail } : {}),
                            ...(safePhone ? { phone: safePhone, mobile: safePhone, contact: safePhone, contact1: safePhone } : {}),
                            isPhoneVerified: safeVerified,
                            phoneVerified: safeVerified,
                            mobileVerified: safeVerified
                        };
                    });
                    if (changed) {
                        localStorage.setItem(key, JSON.stringify(nextRows));
                    }
                } catch (_error) {
                    // Ignore local sync failures.
                }
            });

            try {
                const runtimeProfile = JSON.parse(localStorage.getItem('goindiaride.profile.runtime') || '{}');
                localStorage.setItem('goindiaride.profile.runtime', JSON.stringify({
                    ...(runtimeProfile && typeof runtimeProfile === 'object' ? runtimeProfile : {}),
                    name: safeName || currentUser?.fullname || currentUser?.name || runtimeProfile.name || '',
                    email: safeEmail || currentUser?.email || runtimeProfile.email || '',
                    phone: safePhone || runtimeProfile.phone || '',
                    isPhoneVerified: safeVerified,
                    phoneVerified: safeVerified
                }));
            } catch (_error) {
                // Ignore runtime profile sync failures.
            }
        }

        function setProfilePhoneUpdateStatus(message, type = '') {
            const node = document.getElementById('profilePhoneUpdateStatus');
            if (!node) return;
            node.textContent = message || '';
            node.style.color = type === 'error' ? '#b91c1c' : '#5f6b7a';
        }

        function showProfilePhoneError(message, title = 'Phone Verification') {
            const safeMessage = String(message || '').trim() || 'Phone verification failed';
            if (typeof showErrorToast === 'function') {
                showErrorToast(safeMessage, title);
                return;
            }
            if (typeof showWarningToast === 'function') {
                showWarningToast(safeMessage, title);
                return;
            }
            alert(safeMessage);
        }

        function updateProfilePhoneBadge(phone, verified) {
            const badge = document.getElementById('profilePhoneVerificationBadge');
            if (!badge) return;
            if (phone && verified) {
                badge.textContent = `Verified: ${phone}`;
                badge.style.color = '#15803d';
                return;
            }
            if (phone) {
                badge.textContent = `Unverified: ${phone}`;
                badge.style.color = '#b45309';
                return;
            }
            badge.textContent = 'No mobile number saved';
            badge.style.color = '#b91c1c';
        }

        async function syncDashboardPhoneWithBackend(phone) {
            const token = getDashboardAccessToken();
            if (!token) {
                return { ok: false, reason: 'missing_access_token' };
            }

            const apiBases = getDashboardAdminEmailApiBases();
            let lastError = 'server_send_failed';
            for (const apiBase of apiBases) {
                try {
                    const response = await dashboardFetchWithTimeout(`${apiBase}/api/user/profile/phone`, {
                        method: 'PATCH',
                        headers: {
                            Accept: 'application/json',
                            Authorization: `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            phone,
                            verified: true
                        })
                    }, 12000);

                    const data = await response.json().catch(() => ({}));
                    if (response.ok && data && data.user) {
                        return { ok: true, data };
                    }
                    lastError = String(data.message || `http_${response.status}`).trim() || 'server_send_failed';
                } catch (error) {
                    lastError = String(error?.message || 'server_send_failed').trim() || 'server_send_failed';
                }
            }

            return { ok: false, reason: lastError };
        }

        async function syncDashboardProfileWithBackend(profilePatch = {}) {
            const token = getDashboardAccessToken();
            if (!token) {
                return { ok: false, reason: 'missing_access_token' };
            }

            const apiBases = getDashboardAdminEmailApiBases();
            let lastError = 'server_send_failed';
            for (const apiBase of apiBases) {
                try {
                    const response = await dashboardFetchWithTimeout(`${apiBase}/api/user/profile`, {
                        method: 'PATCH',
                        headers: {
                            Accept: 'application/json',
                            Authorization: `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            name: profilePatch.name || profilePatch.fullname || '',
                            email: profilePatch.email || '',
                            phone: profilePatch.phone || '',
                            verified: Boolean(profilePatch.verified || profilePatch.isPhoneVerified || profilePatch.phoneVerified)
                        })
                    }, 12000);

                    const data = await response.json().catch(() => ({}));
                    if (response.ok && data && data.user) {
                        return { ok: true, data };
                    }
                    lastError = String(data.message || `http_${response.status}`).trim() || 'server_send_failed';
                } catch (error) {
                    lastError = String(error?.message || 'server_send_failed').trim() || 'server_send_failed';
                }
            }

            return { ok: false, reason: lastError };
        }

        function isDeprecatedDashboardApiBase(base) {
            const normalized = normalizeApiBase(base).toLowerCase();
            if (!normalized) return false;
            return normalized.includes('cloudfunctions.net') || normalized.includes('api.goindiaride.in');
        }

        function getDashboardAdminEmailApiBases() {
            const host = String(window.location.hostname || '').toLowerCase();
            const isPrimaryWebsiteHost = host === 'goindiaride.in' || host === 'www.goindiaride.in' || host.endsWith('.goindiaride.in');
            const sameOriginBase = normalizeApiBase(window.location.origin || '');
            const runtimeBase = normalizeApiBase(window.__GOINDIARIDE_RUNTIME_API_ORIGIN__ || window.__GOINDIARIDE_API_ORIGIN__ || '');
            const explicitBase = normalizeApiBase(window.GOINDIARIDE_API_BASE || '');
            const storageBase = normalizeApiBase(localStorage.getItem('goindiaride_api_base') || '');
            const renderPrimaryBase = 'https://goindiaride.onrender.com';

            if (isDeprecatedDashboardApiBase(storageBase)) {
                localStorage.removeItem('goindiaride_api_base');
            }
            if (isDeprecatedDashboardApiBase(runtimeBase)) {
                window.__GOINDIARIDE_RUNTIME_API_ORIGIN__ = renderPrimaryBase;
            }
            if (isDeprecatedDashboardApiBase(window.__GOINDIARIDE_API_ORIGIN__ || '')) {
                window.__GOINDIARIDE_API_ORIGIN__ = renderPrimaryBase;
            }

            return [
                isPrimaryWebsiteHost ? renderPrimaryBase : sameOriginBase,
                window.__GOINDIARIDE_RUNTIME_API_ORIGIN__ || '',
                window.__GOINDIARIDE_API_ORIGIN__ || '',
                explicitBase,
                storageBase,
                isPrimaryWebsiteHost ? sameOriginBase : renderPrimaryBase
            ]
                .map((item) => normalizeApiBase(item))
                .filter((item, index, arr) => item && !isDeprecatedDashboardApiBase(item) && arr.indexOf(item) === index);
        }

        function loadDashboardAdminEmailRetryQueue() {
            try {
                const parsed = JSON.parse(localStorage.getItem(DASHBOARD_ADMIN_EMAIL_RETRY_QUEUE_KEY) || '[]');
                return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object') : [];
            } catch (_error) {
                return [];
            }
        }

        function saveDashboardAdminEmailRetryQueue(items) {
            localStorage.setItem(DASHBOARD_ADMIN_EMAIL_RETRY_QUEUE_KEY, JSON.stringify(Array.isArray(items) ? items : []));
        }

        function createDashboardRequestId(prefix) {
            return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        }

        function createDashboardIdempotencyKey(prefix) {
            return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 12)}`;
        }

        async function dashboardFetchWithTimeout(url, options = {}, timeoutMs = 12000) {
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

        function classifyDashboardRequestFailure(apiBase, error) {
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

        async function flushDashboardAdminEmailRetryQueue() {
            const queue = loadDashboardAdminEmailRetryQueue();
            if (!queue.length) return;

            const apiBases = getDashboardAdminEmailApiBases();
            if (!apiBases.length) return;

            const remaining = [...queue];
            const processItems = remaining.slice(0, DASHBOARD_ADMIN_EMAIL_BATCH_SIZE);
            let queueUpdated = false;

            for (const item of processItems) {
                const bookingRecord = item.bookingRecord && typeof item.bookingRecord === 'object' ? item.bookingRecord : null;
                const bookingId = String(item.bookingId || bookingRecord?.id || bookingRecord?.bookingId || '').trim();
                if (!bookingRecord || !bookingId) {
                    continue;
                }

                const payload = {
                    bookingId,
                    customerId: String(bookingRecord.customerId || '').trim(),
                    customerName: String(bookingRecord.customerName || '').trim(),
                    customerEmail: String(bookingRecord.customerEmail || currentUser?.email || '').trim(),
                    customerPhone: String(bookingRecord.customerPhone || currentUser?.phone || '').trim(),
                    pickup: String(bookingRecord.pickup || '').trim(),
                    drop: String(bookingRecord.dropoff || bookingRecord.drop || '').trim(),
                    rideDate: String(bookingRecord.rideDate || '').trim(),
                    rideTime: String(bookingRecord.rideTime || '').trim(),
                    returnDate: String(bookingRecord.returnTrip?.returnDate || '').trim(),
                    returnTime: String(bookingRecord.returnTrip?.returnTime || '').trim(),
                    tripPlan: String(bookingRecord.tripPlan || '').trim(),
                    paymentMethod: String(bookingRecord.paymentMethod || '').trim(),
                    vehicleType: String(bookingRecord.rideType || '').trim(),
                    passengers: Number(bookingRecord.passengers || 1),
                    luggage: String(bookingRecord.luggage || '').trim(),
                    notes: String(bookingRecord.notes || '').trim(),
                    stops: Array.isArray(bookingRecord.stops) ? bookingRecord.stops : [],
                    specialRequests: bookingRecord.customerFeatures?.specialRequests || {},
                    safetyAccessibility: bookingRecord.customerFeatures?.safetyAccessibility || {},
                    distanceKm: Number(bookingRecord.distance || 0),
                    amount: Number(bookingRecord.totalFare || 0),
                    currency: 'INR',
                    fallbackReason: String(item.reason || 'dashboard_retry').trim()
                };

                let sent = false;
                for (const apiBase of apiBases) {
                    try {
                        const response = await dashboardFetchWithTimeout(`${apiBase}/api/bookings/fallback/admin-alert-email`, {
                            method: 'POST',
                            keepalive: true,
                            cache: 'no-store',
                            headers: {
                                Accept: 'application/json',
                                'Content-Type': 'application/json',
                                'x-request-id': createDashboardRequestId('gir-dashboard-email'),
                                'x-timestamp': String(Date.now()),
                                'x-idempotency-key': createDashboardIdempotencyKey('gir-dashboard-email'),
                                'x-booking-client': 'goindiaride-web'
                            },
                            body: JSON.stringify(payload)
                        }, 70000);

                        const data = await response.json().catch(() => ({}));
                        if (response.ok && data && data.ok !== false) {
                            sent = true;
                            break;
                        }
                        item.reason = String(data.adminEmail?.reason || data.message || `http_${response.status}`).trim() || 'server_send_failed';
                        item.lastErrorAt = new Date().toISOString();
                        queueUpdated = true;
                    } catch (error) {
                        item.reason = classifyDashboardRequestFailure(apiBase, error);
                        item.lastErrorAt = new Date().toISOString();
                        queueUpdated = true;
                    }
                }

                if (sent) {
                    const latestQueue = loadDashboardAdminEmailRetryQueue().filter((entry) => String(entry.bookingId || '').trim() !== bookingId);
                    saveDashboardAdminEmailRetryQueue(latestQueue);
                    queueUpdated = false;
                }
            }

            if (queueUpdated) {
                saveDashboardAdminEmailRetryQueue(remaining);
            }
        }

        window.addEventListener('load', async function() {
            currentUser = await checkAuth();
            if (!currentUser) return;
            migrateLegacyCustomerDashboardStores();
            document.getElementById('rideEditIsReturnTrip')?.addEventListener('change', function() {
                toggleRideEditReturnFields(Boolean(this.checked));
            });
            document.getElementById('rideEditModal')?.addEventListener('click', function(event) {
                if (event.target === this) {
                    closeRideEditModal();
                }
            });
            document.addEventListener('keydown', function(event) {
                if (event.key === 'Escape') {
                    closeRideEditModal();
                }
            });
            const dashboardReady = loadDashboard().catch((error) => {
                console.warn('Dashboard initial load failed:', error);
            });
            const walletReady = initializeWalletView().catch((error) => {
                console.warn('Wallet initial load failed:', error);
            });

            await dashboardReady;
            loadRides();
            loadDonations();
            loadProfile();
            ensureCustomerAlertsPanel();
            renderCustomerAlerts();
            walletReady.catch(() => {});

            // Initialize demo chat (first time only)
            const hasInitializedChat = localStorage.getItem(getChatInitKey(getCustomerWalletOwnerId()));
            if (!hasInitializedChat) {
                startDemoChat();
                localStorage.setItem(getChatInitKey(getCustomerWalletOwnerId()), 'true');
            }

            // Load messages
            loadMessages();
            openRequestedCustomerTabFromUrl();

            // Check for completed rides immediately
            checkForCompletedRides();

            // Start real-time sync
            startRealTimeSync();
            flushDashboardAdminEmailRetryQueue();
            window.addEventListener('online', flushDashboardAdminEmailRetryQueue);
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    flushDashboardAdminEmailRetryQueue();
                }
            });
        });

        // ----------------------------------------====
