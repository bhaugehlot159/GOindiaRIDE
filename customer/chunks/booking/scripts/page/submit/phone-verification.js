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
