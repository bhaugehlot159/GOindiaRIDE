        // LOAD PROFILE
        // ----------------------------------------====

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

        function handleProfilePhoneInputChange() {
            const otpInput = document.getElementById('profilePhoneOtpInput');
            const input = document.getElementById('profilePhoneInput');
            const normalizedPhone = normalizeDashboardPhoneValue(input?.value || '');
            if (otpInput) otpInput.value = '';
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
                showProfilePhoneError('Please enter a valid mobile number with country code.');
                return;
            }
            if (isProfileSavedPhoneStillVerified(normalizedPhone)) {
                if (input) input.value = normalizedPhone;
                if (otpInput) otpInput.value = '';
                if (window.GoIndiaPhoneVerification && typeof window.GoIndiaPhoneVerification.clearSession === 'function') {
                    window.GoIndiaPhoneVerification.clearSession(PROFILE_PHONE_VERIFICATION_SESSION_KEY);
                }
                updateProfilePhoneBadge(normalizedPhone, true);
                setProfilePhoneUpdateStatus('Mobile already verified. OTP is required only if you enter a different number.', 'success');
                if (typeof showSuccessToast === 'function') {
                    showSuccessToast('Mobile number already verified.', 'Phone Verification');
                }
                return;
            }
            if (!window.GoIndiaPhoneVerification || typeof window.GoIndiaPhoneVerification.sendOtp !== 'function') {
                setProfilePhoneUpdateStatus('Phone verification service is still loading. Please retry in a moment.', 'error');
                return;
            }

            try {
                setProfilePhoneUpdateStatus('Sending OTP...');
                await window.GoIndiaPhoneVerification.sendOtp(normalizedPhone, {
                    sessionKey: PROFILE_PHONE_VERIFICATION_SESSION_KEY,
                    containerId: 'profilePhoneRecaptchaContainer'
                });
                if (input) input.value = normalizedPhone;
                setProfilePhoneUpdateStatus(`OTP sent to ${normalizedPhone}. Enter the code and tap Verify & Save Mobile.`, 'success');
                if (typeof showSuccessToast === 'function') {
                    showSuccessToast(`OTP sent to ${normalizedPhone}`, 'Phone Verification');
                }
            } catch (error) {
                const message = toProfilePhoneFriendlyError(error);
                setProfilePhoneUpdateStatus(message, 'error');
                showProfilePhoneError(message);
            }
        }

        async function verifyAndSaveProfilePhone() {
            const otpValue = sanitizeInput(document.getElementById('profilePhoneOtpInput')?.value || '', 12);
            if (!otpValue) {
                setProfilePhoneUpdateStatus('Please enter the OTP code.', 'error');
                return;
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
                if (typeof showSuccessToast === 'function') {
                    showSuccessToast(`Mobile verified: ${verifiedPhone}`, 'Phone Verification');
                }
            } catch (error) {
                const message = toProfilePhoneFriendlyError(error);
                setProfilePhoneUpdateStatus(message, 'error');
                showProfilePhoneError(message);
            }
        }

        // ----------------------------------------====
