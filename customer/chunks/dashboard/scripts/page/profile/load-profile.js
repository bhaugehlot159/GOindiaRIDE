        // LOAD PROFILE
        // ----------------------------------------====
        const PROFILE_PHONE_BACKEND_OTP_SESSION_KEY = 'goindiaride-dashboard-profile-backend-otp';
        const PROFILE_PHONE_BACKEND_OTP_TTL_MS = 7 * 60 * 1000;

        function hydrateProfilePhoneEditor() {
            const safeName = normalizeDashboardNameValue(currentUser?.fullname || currentUser?.name || '');
            const safeEmail = normalizeDashboardEmailValue(currentUser?.email || '');
            const safePhone = normalizeDashboardPhoneValue(currentUser?.phone || '');
            const nameInput = document.getElementById('profileNameInput');
            const emailInput = document.getElementById('profileEmailInput');
            const input = document.getElementById('profilePhoneInput');
            const otpInput = document.getElementById('profilePhoneOtpInput');
            const phoneVerified = Boolean(currentUser?.isPhoneVerified || currentUser?.phoneVerified);
            if (nameInput) nameInput.value = safeName || '';
            if (emailInput) emailInput.value = safeEmail || '';
            if (input) input.value = safePhone || '';
            if (otpInput) otpInput.value = '';
            updateProfilePhoneBadge(safePhone, phoneVerified);
            if (safePhone && phoneVerified) {
                setProfilePhoneUpdateStatus('Verified mobile is ready for booking and admin notifications.');
            } else if (safePhone) {
                setProfilePhoneUpdateStatus('Mobile number saved but unverified. Send OTP and verify before booking.');
            } else {
                setProfilePhoneUpdateStatus('Please enter an active mobile number and verify it with OTP.');
            }
        }

        function isProfileSavedPhoneStillVerified(phoneValue) {
            const normalizedPhone = normalizeDashboardPhoneValue(phoneValue || '');
            const savedPhone = normalizeDashboardPhoneValue(currentUser?.phone || currentUser?.mobile || '');
            const savedVerified = Boolean(currentUser?.isPhoneVerified || currentUser?.phoneVerified);
            return Boolean(normalizedPhone && savedPhone && normalizedPhone === savedPhone && savedVerified);
        }

        function toProfilePhoneFriendlyError(error) {
            const rawMessage = String(error?.message || error || '').trim();
            const normalizedMessage = rawMessage.toLowerCase();
            if (
                normalizedMessage.includes('auth/invalid-api-key') ||
                normalizedMessage.includes('invalid api key') ||
                normalizedMessage.includes('firebase key mismatch')
            ) {
                return 'Phone OTP service needs admin configuration. Your verified mobile is still saved; OTP for a changed number will work after Firebase key is updated.';
            }
            if (
                normalizedMessage.includes('auth/unauthorized-domain') ||
                normalizedMessage.includes('unauthorized domain') ||
                normalizedMessage.includes('recaptcha')
            ) {
                return 'Phone OTP security setup needs admin update for this domain. Your saved profile is safe; please retry after the domain is enabled.';
            }
            if (
                normalizedMessage.includes('operation-not-allowed') ||
                normalizedMessage.includes('phone provider')
            ) {
                return 'Phone OTP provider is not enabled yet. Please contact admin/support to enable phone verification.';
            }
            return rawMessage || 'OTP failed. Please retry.';
        }

        function isProfilePhoneServiceUnavailableReason(message) {
            const text = String(message || '').trim().toLowerCase();
            return Boolean(
                text.includes('mobile otp provider is not configured')
                || text.includes('sms/whatsapp settings')
                || text.includes('sms_provider_not_configured')
                || text.includes('twilio_send_failed')
                || text.includes('twilio_request_failed')
                || text.includes('twilio_sms_not_configured')
                || text.includes('msg91_send_failed')
                || text.includes('msg91_not_configured')
                || text.includes('fast2sms_not_configured')
                || text.includes('fast2sms_send_failed')
                || text.includes('request_timeout')
                || text.includes('network_error')
                || text.includes('failed to fetch')
                || text.includes('preflight')
                || text.includes('missing_access_token')
                || text.includes('phone otp service needs admin configuration')
                || text.includes('auth/invalid-api-key')
                || text.includes('invalid api key')
            );
        }

        function getProfilePhoneCustomerMessage(message, fallback = 'OTP failed. Please retry.') {
            const rawMessage = String(message || '').trim();
            if (!rawMessage) return fallback;
            const lower = rawMessage.toLowerCase();
            if (lower.includes('phone already in use')) {
                return 'This mobile number is already linked with another account.';
            }
            if (lower.includes('please wait') || lower.includes('otp request limit')) {
                return rawMessage;
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
            if (isProfilePhoneServiceUnavailableReason(rawMessage)) {
                return 'Phone OTP service is temporarily unavailable. Please try again in a moment.';
            }
            return rawMessage;
        }

        function setProfileBackendOtpSession(phone, apiBase = '') {
            const normalizedPhone = normalizeDashboardPhoneValue(phone);
            if (!normalizedPhone) return;
            try {
                sessionStorage.setItem(PROFILE_PHONE_BACKEND_OTP_SESSION_KEY, JSON.stringify({
                    phone: normalizedPhone,
                    apiBase: sanitizeInput(apiBase || '', 240),
                    sentAt: Date.now()
                }));
            } catch (_error) {
                // Ignore session storage failures; Firebase fallback can still run.
            }
        }

        function getProfileBackendOtpSession(phone = '') {
            const normalizedPhone = normalizeDashboardPhoneValue(phone);
            try {
                const parsed = JSON.parse(sessionStorage.getItem(PROFILE_PHONE_BACKEND_OTP_SESSION_KEY) || '{}');
                const storedPhone = normalizeDashboardPhoneValue(parsed.phone || '');
                const sentAt = Number(parsed.sentAt || 0);
                const fresh = sentAt && Date.now() - sentAt < PROFILE_PHONE_BACKEND_OTP_TTL_MS;
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

        function clearProfileBackendOtpSession() {
            try {
                sessionStorage.removeItem(PROFILE_PHONE_BACKEND_OTP_SESSION_KEY);
            } catch (_error) {
                // Ignore session storage restrictions.
            }
        }

        function getDashboardDeviceFingerprint() {
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

        async function profilePhoneApiPost(path, body = {}, options = {}) {
            const token = getDashboardAccessToken();
            if (!token) {
                throw new Error('missing_access_token');
            }

            const apiBases = ['https://goindiaride.onrender.com']
            let lastError = 'server_api_unavailable';
            for (const apiBase of apiBases) {
                try {
                    const response = await dashboardFetchWithTimeout(`${apiBase}${path}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Accept: 'application/json',
                            Authorization: `Bearer ${token}`,
                            'X-Request-ID': typeof createDashboardRequestId === 'function'
                                ? createDashboardRequestId(options.idPrefix || 'profile-phone-otp')
                                : `profile-phone-otp-${Date.now()}`,
                            'Idempotency-Key': typeof createDashboardIdempotencyKey === 'function'
                                ? createDashboardIdempotencyKey(options.idPrefix || 'profile-phone-otp')
                                : `profile-phone-otp:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`
                        },
                        body: JSON.stringify(body)
                    }, options.timeoutMs || 14000);
                    const data = await response.json().catch(() => ({}));
                    if (response.ok) {
                        return { ok: true, data, apiBase };
                    }
                    lastError = sanitizeInput(data.message || response.statusText || `http_${response.status}`, 240);
                    if (response.status === 400 || response.status === 401 || response.status === 403 || response.status === 409 || response.status === 429) {
                        break;
                    }
                } catch (error) {
                    lastError = typeof classifyDashboardRequestFailure === 'function'
                        ? classifyDashboardRequestFailure(apiBase, error)
                        : String(error?.message || error || 'network_error');
                }
            }
            throw new Error(lastError);
        }

        async function sendProfileBackendPhoneOtp(normalizedPhone) {
            const result = await profilePhoneApiPost('/api/auth/profile-phone/request-otp', {
                phone: normalizedPhone
            }, {
                idPrefix: 'gir-profile-phone-otp',
                timeoutMs: 14000
            });

            const delivery = result.data?.delivery || {};
            if (result.ok && delivery.sent) {
                setProfileBackendOtpSession(normalizedPhone, result.apiBase || '');
                return {
                    ok: true,
                    provider: sanitizeInput(delivery.provider || 'backend_sms', 80),
                    apiBase: result.apiBase || ''
                };
            }

            throw new Error(sanitizeInput(
                [delivery.reason, delivery.message, result.data?.message, 'backend_profile_sms_otp_failed'].filter(Boolean).join(': '),
                260
            ));
        }

        async function verifyProfileBackendPhoneOtp(normalizedPhone, otpValue) {
            const session = getProfileBackendOtpSession(normalizedPhone);
            if (!session) {
                throw new Error('Please send OTP first, then enter the code here.');
            }

            const result = await profilePhoneApiPost('/api/auth/profile-phone/verify-otp', {
                phone: session.phone,
                otp: otpValue,
                deviceFingerprint: getDashboardDeviceFingerprint()
            }, {
                idPrefix: 'gir-profile-phone-otp-verify',
                timeoutMs: 14000
            });

            const user = result.data?.user || {};
            const verifiedPhone = normalizeDashboardPhoneValue(user.phone || session.phone);
            if (!verifiedPhone) {
                throw new Error('Verified phone number missing after OTP confirmation.');
            }
            clearProfileBackendOtpSession();
            return {
                ok: true,
                phone: verifiedPhone,
                user
            };
        }

        function shouldTryProfileFirebaseFallback(message) {
            const lower = String(message || '').toLowerCase();
            if (lower.includes('phone already in use')) return false;
            if (lower.includes('please wait') || lower.includes('otp request limit')) return false;
            return isProfilePhoneServiceUnavailableReason(message);
        }

        function isProfileBackendOtpFallbackEnabled() {
            return window.__GOINDIARIDE_PROFILE_BACKEND_OTP_FALLBACK__ === true
                || String(window.GOINDIARIDE_PROFILE_BACKEND_OTP_FALLBACK || '').toLowerCase() === 'true';
        }

        function handleProfilePhoneInputChange() {
            const otpInput = document.getElementById('profilePhoneOtpInput');
            const input = document.getElementById('profilePhoneInput');
            const normalizedPhone = normalizeDashboardPhoneValue(input?.value || '');
            if (otpInput) otpInput.value = '';
            clearProfileBackendOtpSession();
            if (window.GoIndiaPhoneVerification && typeof window.GoIndiaPhoneVerification.clearSession === 'function') {
                window.GoIndiaPhoneVerification.clearSession(PROFILE_PHONE_VERIFICATION_SESSION_KEY);
            }
            if (isProfileSavedPhoneStillVerified(normalizedPhone)) {
                updateProfilePhoneBadge(normalizedPhone, true);
                setProfilePhoneUpdateStatus('Verified mobile is ready for booking and admin notifications.');
                return;
            }
            updateProfilePhoneBadge(normalizedPhone, false);
            setProfilePhoneUpdateStatus('Send OTP to verify this mobile number before booking.');
        }

        function loadProfile() {
            document.getElementById('profileName').textContent = currentUser.fullname || currentUser.name || '-';
            document.getElementById('profileEmail').textContent = currentUser.email || '-';
            document.getElementById('profilePhone').textContent = currentUser.phone || 'Not added yet';
            hydrateProfilePhoneEditor();
        }

        async function saveProfileDetails() {
            const nameInput = document.getElementById('profileNameInput');
            const emailInput = document.getElementById('profileEmailInput');
            const phoneInput = document.getElementById('profilePhoneInput');
            const statusNode = document.getElementById('profileSaveStatus');

            const safeName = normalizeDashboardNameValue(nameInput?.value || '');
            const safeEmail = normalizeDashboardEmailValue(emailInput?.value || '');
            const safePhone = normalizeDashboardPhoneValue(phoneInput?.value || '');
            const currentPhone = normalizeDashboardPhoneValue(currentUser?.phone || '');
            const currentPhoneVerified = Boolean(currentUser?.isPhoneVerified || currentUser?.phoneVerified);
            const nextPhoneVerified = Boolean(safePhone && currentPhone && safePhone === currentPhone && currentPhoneVerified);

            if (!safeName) {
                setProfilePhoneUpdateStatus('Full name is required.', 'error');
                if (statusNode) {
                    statusNode.textContent = 'Full name is required.';
                    statusNode.style.color = '#b91c1c';
                }
                return;
            }

            if (!safeEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail)) {
                setProfilePhoneUpdateStatus('A valid email address is required.', 'error');
                if (statusNode) {
                    statusNode.textContent = 'A valid email address is required.';
                    statusNode.style.color = '#b91c1c';
                }
                return;
            }

            if (!safePhone) {
                setProfilePhoneUpdateStatus('An active mobile number is required.', 'error');
                if (statusNode) {
                    statusNode.textContent = 'An active mobile number is required.';
                    statusNode.style.color = '#b91c1c';
                }
                return;
            }

            persistDashboardCurrentUserSession({
                fullname: safeName,
                name: safeName,
                email: safeEmail,
                phone: safePhone,
                mobile: safePhone,
                isPhoneVerified: nextPhoneVerified,
                phoneVerified: nextPhoneVerified
            });
            updateDashboardCustomerAccountStores({
                fullname: safeName,
                name: safeName,
                email: safeEmail,
                phone: safePhone,
                mobile: safePhone,
                isPhoneVerified: nextPhoneVerified,
                phoneVerified: nextPhoneVerified
            });

            document.getElementById('profileName').textContent = safeName;
            document.getElementById('profileEmail').textContent = safeEmail;
            document.getElementById('profilePhone').textContent = safePhone;

            const welcomeNode = document.getElementById('welcomeMsg');
            const userNameNode = document.getElementById('userName');
            const avatarNode = document.getElementById('userAvatar');
            if (welcomeNode) welcomeNode.textContent = `Welcome, ${safeName}!`;
            if (userNameNode) userNameNode.textContent = safeName;
            if (avatarNode) {
                avatarNode.textContent = safeName.split(' ').filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'CU';
            }

            const syncResult = await syncDashboardProfileWithBackend({
                name: safeName,
                fullname: safeName,
                email: safeEmail,
                phone: safePhone,
                verified: nextPhoneVerified
            });

            if (syncResult && syncResult.ok && syncResult.data && syncResult.data.user) {
                const backendUser = syncResult.data.user;
                persistDashboardCurrentUserSession({
                    fullname: backendUser.name || safeName,
                    name: backendUser.name || safeName,
                    email: backendUser.email || safeEmail,
                    phone: backendUser.phone || safePhone,
                    mobile: backendUser.phone || safePhone,
                    isPhoneVerified: Boolean(backendUser.isPhoneVerified),
                    phoneVerified: Boolean(backendUser.isPhoneVerified)
                });
                updateDashboardCustomerAccountStores({
                    fullname: backendUser.name || safeName,
                    name: backendUser.name || safeName,
                    email: backendUser.email || safeEmail,
                    phone: backendUser.phone || safePhone,
                    mobile: backendUser.phone || safePhone,
                    isPhoneVerified: Boolean(backendUser.isPhoneVerified),
                    phoneVerified: Boolean(backendUser.isPhoneVerified)
                });
            }

            hydrateProfilePhoneEditor();
            if (nextPhoneVerified) {
                setProfilePhoneUpdateStatus('Verified mobile is ready for booking and admin notifications.');
            } else {
                setProfilePhoneUpdateStatus('Profile saved. Mobile number needs OTP verification before booking.');
            }
            if (statusNode) {
                if (syncResult && syncResult.ok) {
                    statusNode.textContent = nextPhoneVerified
                        ? 'Profile saved successfully with verified mobile.'
                        : 'Profile saved successfully. Verify mobile with OTP to use booking.';
                    statusNode.style.color = '#15803d';
                } else if (syncResult && syncResult.reason === 'missing_access_token') {
                    statusNode.textContent = 'Profile saved in your current session. It will sync to backend after your next authenticated refresh.';
                    statusNode.style.color = '#15803d';
                } else {
                    statusNode.textContent = 'Profile saved locally. Backend sync is pending, and this mobile will still be used for booking notifications.';
                    statusNode.style.color = '#15803d';
                }
            }
        }

        async function sendProfilePhoneOtp() {
            const input = document.getElementById('profilePhoneInput');
            const otpInput = document.getElementById('profilePhoneOtpInput');
            const normalizedPhone = normalizeDashboardPhoneValue(input?.value || '');
            if (!normalizedPhone) {
                setProfilePhoneUpdateStatus('Please enter a valid mobile number with country code.', 'error');
                return;
            }
            if (isProfileSavedPhoneStillVerified(normalizedPhone)) {
                if (input) input.value = normalizedPhone;
                if (otpInput) otpInput.value = '';
                clearProfileBackendOtpSession();
                if (window.GoIndiaPhoneVerification && typeof window.GoIndiaPhoneVerification.clearSession === 'function') {
                    window.GoIndiaPhoneVerification.clearSession(PROFILE_PHONE_VERIFICATION_SESSION_KEY);
                }
                updateProfilePhoneBadge(normalizedPhone, true);
                setProfilePhoneUpdateStatus('Mobile already verified. OTP is required only if you enter a different number.', 'success');
                return;
            }

            if (!window.GoIndiaPhoneVerification || typeof window.GoIndiaPhoneVerification.sendOtp !== 'function') {
                setProfilePhoneUpdateStatus('Phone verification service is still loading. Please retry in a moment.', 'error');
                return;
            }

            try {
                clearProfileBackendOtpSession();
                setProfilePhoneUpdateStatus('Sending OTP through Firebase...');
                await window.GoIndiaPhoneVerification.sendOtp(normalizedPhone, {
                    sessionKey: PROFILE_PHONE_VERIFICATION_SESSION_KEY,
                    containerId: 'profilePhoneRecaptchaContainer'
                });
                if (input) input.value = normalizedPhone;
                setProfilePhoneUpdateStatus(`OTP sent to ${normalizedPhone}. Enter the code and tap Verify & Save Mobile.`, 'success');
            } catch (error) {
                console.warn('Profile phone Firebase OTP failed.', error);
                if (isProfileBackendOtpFallbackEnabled()) {
                    try {
                        setProfilePhoneUpdateStatus('Firebase OTP unavailable; trying secure SMS gateway...');
                        await sendProfileBackendPhoneOtp(normalizedPhone);
                        if (input) input.value = normalizedPhone;
                        if (window.GoIndiaPhoneVerification && typeof window.GoIndiaPhoneVerification.clearSession === 'function') {
                            window.GoIndiaPhoneVerification.clearSession(PROFILE_PHONE_VERIFICATION_SESSION_KEY);
                        }
                        setProfilePhoneUpdateStatus(`OTP sent to ${normalizedPhone}. Enter the code and tap Verify & Save Mobile.`, 'success');
                        return;
                    } catch (backendError) {
                        const backendMessage = String(backendError?.message || '').trim();
                        if (!shouldTryProfileFirebaseFallback(backendMessage)) {
                            setProfilePhoneUpdateStatus(getProfilePhoneCustomerMessage(backendMessage, 'OTP send failed. Please retry.'), 'error');
                            return;
                        }
                    }
                }
                const message = getProfilePhoneCustomerMessage(toProfilePhoneFriendlyError(error), 'OTP send failed. Please retry.');
                setProfilePhoneUpdateStatus(message, 'error');
            }
        }

        async function verifyAndSaveProfilePhone() {
            const otpValue = sanitizeInput(document.getElementById('profilePhoneOtpInput')?.value || '', 12);
            if (!otpValue) {
                setProfilePhoneUpdateStatus('Please enter the OTP code.', 'error');
                return;
            }
            const normalizedInputPhone = normalizeDashboardPhoneValue(document.getElementById('profilePhoneInput')?.value || '');
            const backendOtpSession = isProfileBackendOtpFallbackEnabled()
                ? getProfileBackendOtpSession(normalizedInputPhone)
                : null;
            if (!isProfileBackendOtpFallbackEnabled()) {
                clearProfileBackendOtpSession();
            }
            if (backendOtpSession) {
                try {
                    setProfilePhoneUpdateStatus('Verifying OTP...');
                    const backendResult = await verifyProfileBackendPhoneOtp(backendOtpSession.phone, otpValue);
                    const verifiedPhone = backendResult.phone;
                    const backendUser = backendResult.user || {};
                    const safeName = normalizeDashboardNameValue(backendUser.name || currentUser?.fullname || currentUser?.name || '');
                    const safeEmail = normalizeDashboardEmailValue(backendUser.email || currentUser?.email || '');
                    persistDashboardCurrentUserSession({
                        fullname: safeName,
                        name: safeName,
                        email: safeEmail,
                        phone: verifiedPhone,
                        mobile: verifiedPhone,
                        isPhoneVerified: true,
                        phoneVerified: true
                    });
                    updateDashboardCustomerAccountStores({
                        fullname: safeName,
                        name: safeName,
                        email: safeEmail,
                        phone: verifiedPhone,
                        mobile: verifiedPhone,
                        isPhoneVerified: true,
                        phoneVerified: true
                    }, true);
                    const input = document.getElementById('profilePhoneInput');
                    if (input) input.value = verifiedPhone;
                    document.getElementById('profilePhone').textContent = verifiedPhone;
                    hydrateProfilePhoneEditor();
                    setProfilePhoneUpdateStatus(`Verified mobile saved to backend: ${verifiedPhone}`, 'success');
                    const statusNode = document.getElementById('profileSaveStatus');
                    if (statusNode) {
                        statusNode.textContent = 'Mobile verified and saved.';
                        statusNode.style.color = '#15803d';
                    }
                    return;
                } catch (backendError) {
                    const message = getProfilePhoneCustomerMessage(backendError?.message || 'OTP verification failed. Please retry.');
                    setProfilePhoneUpdateStatus(message, 'error');
                    return;
                }
            }

            if (!window.GoIndiaPhoneVerification || typeof window.GoIndiaPhoneVerification.verifyOtp !== 'function') {
                setProfilePhoneUpdateStatus('Phone verification service is still loading. Please retry in a moment.', 'error');
                return;
            }

            try {
                setProfilePhoneUpdateStatus('Verifying OTP...');
                const result = await window.GoIndiaPhoneVerification.verifyOtp(otpValue, {
                    sessionKey: PROFILE_PHONE_VERIFICATION_SESSION_KEY
                });
                const verifiedPhone = normalizeDashboardPhoneValue(result?.phone || document.getElementById('profilePhoneInput')?.value || '');
                if (!verifiedPhone) {
                    throw new Error('Verified phone number missing after OTP confirmation.');
                }

                const safeName = normalizeDashboardNameValue(document.getElementById('profileNameInput')?.value || currentUser?.fullname || currentUser?.name || '');
                const safeEmail = normalizeDashboardEmailValue(document.getElementById('profileEmailInput')?.value || currentUser?.email || '');
                persistDashboardCurrentUserSession({
                    fullname: safeName || currentUser?.fullname || currentUser?.name || '',
                    name: safeName || currentUser?.name || currentUser?.fullname || '',
                    email: safeEmail || currentUser?.email || '',
                    phone: verifiedPhone,
                    mobile: verifiedPhone,
                    isPhoneVerified: true,
                    phoneVerified: true
                });
                updateDashboardCustomerAccountStores({
                    fullname: safeName || currentUser?.fullname || currentUser?.name || '',
                    name: safeName || currentUser?.name || currentUser?.fullname || '',
                    email: safeEmail || currentUser?.email || '',
                    phone: verifiedPhone,
                    mobile: verifiedPhone,
                    isPhoneVerified: true,
                    phoneVerified: true
                }, true);

                const input = document.getElementById('profilePhoneInput');
                if (input) input.value = verifiedPhone;
                document.getElementById('profilePhone').textContent = verifiedPhone;

                const syncResult = await syncDashboardPhoneWithBackend(verifiedPhone);
                if (syncResult?.ok && syncResult.data?.user) {
                    const backendUser = syncResult.data.user;
                    persistDashboardCurrentUserSession({
                        fullname: backendUser.name || currentUser?.fullname || currentUser?.name || '',
                        name: backendUser.name || currentUser?.name || currentUser?.fullname || '',
                        email: backendUser.email || currentUser?.email || '',
                        phone: normalizeDashboardPhoneValue(backendUser.phone || verifiedPhone) || verifiedPhone,
                        mobile: normalizeDashboardPhoneValue(backendUser.phone || verifiedPhone) || verifiedPhone,
                        isPhoneVerified: Boolean(backendUser.isPhoneVerified),
                        phoneVerified: Boolean(backendUser.isPhoneVerified)
                    });
                    updateDashboardCustomerAccountStores({
                        fullname: backendUser.name || currentUser?.fullname || currentUser?.name || '',
                        name: backendUser.name || currentUser?.name || currentUser?.fullname || '',
                        email: backendUser.email || currentUser?.email || '',
                        phone: normalizeDashboardPhoneValue(backendUser.phone || verifiedPhone) || verifiedPhone,
                        mobile: normalizeDashboardPhoneValue(backendUser.phone || verifiedPhone) || verifiedPhone,
                        isPhoneVerified: Boolean(backendUser.isPhoneVerified),
                        phoneVerified: Boolean(backendUser.isPhoneVerified)
                    }, Boolean(backendUser.isPhoneVerified));
                    setProfilePhoneUpdateStatus(`Verified mobile saved to backend: ${verifiedPhone}`, 'success');
                } else if (syncResult?.reason === 'missing_access_token') {
                    setProfilePhoneUpdateStatus(`Verified mobile saved in this session: ${verifiedPhone}. Backend sync will happen after login refresh.`, 'success');
                } else {
                    setProfilePhoneUpdateStatus(`Verified mobile saved locally: ${verifiedPhone}. Backend sync is pending.`, 'success');
                }

                hydrateProfilePhoneEditor();
                const statusNode = document.getElementById('profileSaveStatus');
                if (statusNode) {
                    statusNode.textContent = 'Mobile verified and saved.';
                    statusNode.style.color = '#15803d';
                }
            } catch (error) {
                const message = getProfilePhoneCustomerMessage(toProfilePhoneFriendlyError(error), 'OTP verification failed. Please retry.');
                setProfilePhoneUpdateStatus(message, 'error');
            }
        }

        // ----------------------------------------====
