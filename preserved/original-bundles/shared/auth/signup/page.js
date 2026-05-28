// Password Show/Hide for Signup
        function togglePasswordSignup(fieldId) {
            const field = document.getElementById(fieldId);
            const toggleId = fieldId + 'Toggle';
            const toggleIcon = document.getElementById(toggleId);

            if (field.type === 'password') {
                field.type = 'text';
                toggleIcon.classList.remove('fa-eye');
                toggleIcon.classList.add('fa-eye-slash');
            } else {
                field.type = 'password';
                toggleIcon.classList.remove('fa-eye-slash');
                toggleIcon.classList.add('fa-eye');
            }
        }

        // Elements
        const signupForm = document.getElementById('signupForm');
        const roleCustomerInput = document.getElementById('roleCustomer');
        const roleDriverInput = document.getElementById('roleDriver');
        const fullnameInput = document.getElementById('fullname');
        const emailInput = document.getElementById('email');
        const phoneInput = document.getElementById('phone');
        const driverOnlyFields = document.getElementById('driverOnlyFields');
        const drivingLicenseNumberInput = document.getElementById('drivingLicenseNumber');
        const licenseHolderNameInput = document.getElementById('licenseHolderName');
        const licenseExpiryInput = document.getElementById('licenseExpiry');
        const passwordInput = document.getElementById('password');
        const confirmPasswordInput = document.getElementById('confirmPassword');
        const termsCheckbox = document.getElementById('terms');
        const errorMessage = document.getElementById('errorMessage');
        const errorText = document.getElementById('errorText');
        const successMessage = document.getElementById('successMessage');
        const signupBtnText = document.getElementById('signupBtnText');

        // Show Error
        function showError(message) {
            errorText.textContent = message;
            errorMessage.classList.add('show');
            setTimeout(() => errorMessage.classList.remove('show'), 5000);
        }

        // Show Success
        function showSuccess(message) {
            document.getElementById('successText').textContent = message;
            successMessage.classList.add('show');
        }

        // Go to Login
        function goToLogin() {
            window.location.href = './login.html';
        }

        function sanitizeDrivingLicense(value) {
            return sanitizeInput(value).toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20);
        }

        function normalizePhoneForStorage(value) {
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
            if (digitsOnly.length === 10 && /^[6-9]/.test(digitsOnly)) {
                return '+91' + digitsOnly;
            }
            if (digitsOnly.length >= 8 && digitsOnly.length <= 15) {
                return '+' + digitsOnly;
            }

            return '';
        }

        function normalizeNameForMatch(value) {
            return sanitizeInput(value).toLowerCase().replace(/\s+/g, ' ').trim();
        }

        function validateDrivingLicense(value) {
            const compact = String(value || '').replace(/-/g, '');
            return /^[A-Z]{2}[0-9]{2}[A-Z0-9]{8,14}$/.test(compact);
        }

        const CUSTOMER_STORAGE_KEYS = ['users', 'goride_users', 'customers', 'goindiaride_users', 'goindiaride_customers'];
        const DRIVER_STORAGE_KEYS = ['drivers', 'goride_drivers', 'goindiaride_drivers'];
        const ACCOUNT_BACKUP_KEY = 'goindiaride_accounts_backup_v2';
        const SIGNUP_BACKEND_SYNC_QUEUE_KEY = 'goindiaride_signup_backend_sync_queue_v1';
        const LIVE_BACKEND_REQUIRED_FOR_SIGNUP = true;
        const SIGNUP_REQUEST_TIMEOUT_MS = 15000;

        function safeReadArray(key) {
            try {
                const raw = localStorage.getItem(key);
                const parsed = raw ? JSON.parse(raw) : [];
                return Array.isArray(parsed) ? parsed : [];
            } catch (_error) {
                return [];
            }
        }

        function isCustomerRecord(record) {
            if (!record || typeof record !== 'object') return false;
            const role = String(record.role || record.userType || 'customer').toLowerCase();
            return ['customer', 'user', 'passenger', 'rider', 'client'].includes(role);
        }

        function isDriverRecord(record) {
            if (!record || typeof record !== 'object') return false;
            const role = String(record.role || record.userType || 'driver').toLowerCase();
            return ['driver', 'captain', 'chauffeur'].includes(role);
        }

        function mergeRecords(keys) {
            const map = new Map();
            keys.forEach((key) => {
                safeReadArray(key).forEach((row) => {
                    if (!row || typeof row !== 'object') return;
                    const idSeed = String(row.id || '').trim();
                    const emailSeed = sanitizeEmail(row.email || '');
                    const phoneSeed = normalizePhoneForStorage(row.phone || row.mobile || '');
                    const roleSeed = String(row.role || row.userType || '').toLowerCase();
                    const identity = idSeed || `${emailSeed}|${phoneSeed}|${roleSeed}`;
                    if (!identity) return;
                    map.set(identity, map.has(identity) ? { ...map.get(identity), ...row } : { ...row });
                });
            });
            return Array.from(map.values());
        }

        function writeRecords(keys, records) {
            const safe = Array.isArray(records) ? records : [];
            keys.forEach((key) => {
                localStorage.setItem(key, JSON.stringify(safe));
            });
        }

        function fnv1aHash(value) {
            let hash = 0x811c9dc5;
            const text = String(value || '');
            for (let i = 0; i < text.length; i += 1) {
                hash ^= text.charCodeAt(i);
                hash = (hash >>> 0) * 0x01000193;
            }
            return (hash >>> 0).toString(16);
        }

        function createStableAccountId(role, email, phone) {
            const safeRole = String(role || '').toLowerCase() === 'driver' ? 'driver' : 'user';
            const identity = `${sanitizeEmail(email || '')}|${normalizePhoneForStorage(phone || '')}`;
            return `${safeRole}_${fnv1aHash(identity || ('fallback_' + Date.now()))}`;
        }

        function createPseudoRecaptchaToken(prefix = 'gir-signup') {
            const a = Math.random().toString(36).slice(2, 16);
            const b = Math.random().toString(36).slice(2, 16);
            return `${prefix}_${Date.now()}_${a}_${b}`;
        }

        function persistAccountBackup(customers, drivers) {
            const payload = {
                version: 2,
                updatedAt: new Date().toISOString(),
                customers: Array.isArray(customers) ? customers.filter((row) => isCustomerRecord(row)) : [],
                drivers: Array.isArray(drivers) ? drivers.filter((row) => isDriverRecord(row)) : []
            };
            localStorage.setItem(ACCOUNT_BACKUP_KEY, JSON.stringify(payload));
        }

        function restoreAccountBackupIfNeeded() {
            let backup = null;
            try {
                const raw = localStorage.getItem(ACCOUNT_BACKUP_KEY);
                backup = raw ? JSON.parse(raw) : null;
            } catch (_error) {
                backup = null;
            }
            if (!backup || typeof backup !== 'object') return;

            const customers = Array.isArray(backup.customers) ? backup.customers.filter((row) => isCustomerRecord(row)) : [];
            const drivers = Array.isArray(backup.drivers) ? backup.drivers.filter((row) => isDriverRecord(row)) : [];

            if (!mergeRecords(CUSTOMER_STORAGE_KEYS).length && customers.length) {
                writeRecords(CUSTOMER_STORAGE_KEYS, customers);
            }
            if (!mergeRecords(DRIVER_STORAGE_KEYS).length && drivers.length) {
                writeRecords(DRIVER_STORAGE_KEYS, drivers);
            }
        }

        restoreAccountBackupIfNeeded();
        flushPendingSignupSyncQueue().catch(() => {});
        window.addEventListener('online', () => {
            flushPendingSignupSyncQueue().catch(() => {});
        });

        function normalizeSignupApiBase(value) {
            const text = String(value || '').trim();
            if (!text) return '';
            return text.replace(/\/$/, '');
        }

        function isTrustedPublicSignupApiBase(value) {
            const normalized = normalizeSignupApiBase(value);
            if (!normalized) return false;
            try {
                const parsed = new URL(normalized);
                const apiHost = String(parsed.hostname || '').toLowerCase();
                return apiHost === 'goindiaride.onrender.com'
                    || apiHost === 'goindiaride.in'
                    || apiHost === 'www.goindiaride.in'
                    || apiHost.endsWith('.goindiaride.in');
            } catch (_error) {
                return false;
            }
        }

        function persistSignupApiBase(value) {
            const normalized = normalizeSignupApiBase(value);
            if (!normalized) return;
            const host = String(window.location.hostname || '').toLowerCase();
            const isPrimaryWebsiteHost = host === 'goindiaride.in' || host === 'www.goindiaride.in' || host.endsWith('.goindiaride.in');
            const isGitHubPagesHost = host === 'github.io' || host.endsWith('.github.io');
            if ((isPrimaryWebsiteHost || isGitHubPagesHost) && !isTrustedPublicSignupApiBase(normalized)) {
                return;
            }
            localStorage.setItem('goindiaride_api_base', normalized);
        }

        function isDeprecatedSignupApiBase(value) {
            const normalized = normalizeSignupApiBase(value).toLowerCase();
            if (!normalized) return false;
            return normalized.includes('cloudfunctions.net') || normalized.includes('api.goindiaride.in');
        }

        function getSignupApiBases() {
            const host = String(window.location.hostname || '').toLowerCase();
            const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
            const isPrimaryWebsiteHost = host === 'goindiaride.in' || host === 'www.goindiaride.in' || host.endsWith('.goindiaride.in');
            const isGitHubPagesHost = host === 'github.io' || host.endsWith('.github.io');
            const localBackendBase = 'http://localhost:5000';
            const renderPrimaryBase = 'https://goindiaride.onrender.com';
            const sameOriginBase = normalizeSignupApiBase(window.location.origin || '');
            const sameOriginBackendBase = sameOriginBase ? `${sameOriginBase}/backend` : '';
            const runtimeBase = normalizeSignupApiBase(window.__GOINDIARIDE_RUNTIME_API_ORIGIN__ || window.__GOINDIARIDE_API_ORIGIN__ || '');
            const explicitBase = normalizeSignupApiBase(window.GOINDIARIDE_API_BASE || '');
            const rawStorageBase = normalizeSignupApiBase(localStorage.getItem('goindiaride_api_base') || '');
            const storageBase = (isPrimaryWebsiteHost || isGitHubPagesHost) && !isTrustedPublicSignupApiBase(rawStorageBase)
                ? ''
                : rawStorageBase;
            const bases = [];

            function pushBase(value) {
                const normalized = normalizeSignupApiBase(value);
                if (!normalized || isDeprecatedSignupApiBase(normalized) || bases.includes(normalized)) return;
                bases.push(normalized);
            }

            if (isLocalHost) {
                pushBase(runtimeBase);
                pushBase(explicitBase);
                pushBase(storageBase);
                pushBase(localBackendBase);
                return bases;
            }

            if (isPrimaryWebsiteHost || isGitHubPagesHost) {
                pushBase(runtimeBase);
                pushBase(explicitBase);
                pushBase(storageBase);
                pushBase(sameOriginBackendBase);
                pushBase(sameOriginBase);
                pushBase(renderPrimaryBase);
            } else {
                pushBase(runtimeBase);
                pushBase(explicitBase);
                pushBase(storageBase);
                pushBase(sameOriginBackendBase);
                pushBase(sameOriginBase);
                pushBase(renderPrimaryBase);
            }

            if (!bases.length) {
                pushBase(renderPrimaryBase);
            }

            return bases;
        }

        async function signupFetchWithTimeout(url, options = {}, timeoutMs = SIGNUP_REQUEST_TIMEOUT_MS) {
            if (typeof AbortController !== 'function') {
                return fetch(url, options);
            }
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            try {
                return await fetch(url, {
                    ...options,
                    signal: controller.signal
                });
            } finally {
                clearTimeout(timer);
            }
        }

        function classifySignupNetworkError(error) {
            const rawMessage = String((error && error.message) || error || '').trim();
            const lower = rawMessage.toLowerCase();
            if (String(error && error.name || '').toLowerCase() === 'aborterror') {
                return 'request_timeout';
            }
            if (lower.includes('timeout')) return 'request_timeout';
            if (lower.includes('failed to fetch')) return 'network_error';
            if (lower.includes('load failed')) return 'network_error';
            if (lower.includes('cors')) return 'preflight_blocked';
            return rawMessage || 'network_error';
        }

        async function registerSignupWithBackend(payload) {
            const apiBases = getSignupApiBases();
            let lastHttpFailure = null;
            let lastNetworkReason = 'network_error';

            for (const apiBase of apiBases) {
                try {
                    const response = await signupFetchWithTimeout(`${apiBase}/api/auth/register`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Accept: 'application/json'
                        },
                        credentials: 'include',
                        body: JSON.stringify(payload)
                    });

                    const backendPayload = await response.json().catch(() => ({}));
                    if (response.ok) {
                        persistSignupApiBase(apiBase);
                        return {
                            ok: true,
                            apiBase,
                            status: response.status,
                            data: backendPayload
                        };
                    }

                    lastHttpFailure = {
                        ok: false,
                        apiBase,
                        status: response.status,
                        data: backendPayload
                    };

                    if (![404, 405, 500, 502, 503, 504].includes(Number(response.status || 0))) {
                        return lastHttpFailure;
                    }
                } catch (backendError) {
                    lastNetworkReason = classifySignupNetworkError(backendError);
                }
            }

            if (lastHttpFailure) return lastHttpFailure;
            return {
                ok: false,
                networkFailure: true,
                reason: lastNetworkReason
            };
        }

        function loadPendingSignupSyncQueue() {
            try {
                const parsed = JSON.parse(localStorage.getItem(SIGNUP_BACKEND_SYNC_QUEUE_KEY) || '[]');
                return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object') : [];
            } catch (_error) {
                return [];
            }
        }

        function savePendingSignupSyncQueue(items) {
            localStorage.setItem(SIGNUP_BACKEND_SYNC_QUEUE_KEY, JSON.stringify(Array.isArray(items) ? items : []));
        }

        function queuePendingSignupSync(entry) {
            const queue = loadPendingSignupSyncQueue();
            const safeEmail = sanitizeEmail(entry && entry.email || '');
            const safePhone = normalizePhoneForStorage(entry && entry.phone || '');
            const deduped = queue.filter((item) => {
                const itemEmail = sanitizeEmail(item && item.email || '');
                const itemPhone = normalizePhoneForStorage(item && item.phone || '');
                return !(safeEmail && itemEmail === safeEmail) && !(safePhone && itemPhone === safePhone);
            });
            deduped.push({
                ...(entry && typeof entry === 'object' ? entry : {}),
                queuedAt: new Date().toISOString()
            });
            savePendingSignupSyncQueue(deduped);
        }

        async function flushPendingSignupSyncQueue() {
            const queue = loadPendingSignupSyncQueue();
            if (!queue.length) return;

            const remaining = [];
            for (const item of queue) {
                const payload = item && item.backendPayload && typeof item.backendPayload === 'object'
                    ? item.backendPayload
                    : null;
                if (!payload) {
                    continue;
                }

                const result = await registerSignupWithBackend(payload);
                if (result.ok) {
                    continue;
                }

                if (Number(result.status || 0) === 409) {
                    continue;
                }

                remaining.push(item);
                if (result.networkFailure) {
                    break;
                }
            }

            savePendingSignupSyncQueue(remaining);
        }

        function toggleDriverFields() {
            const isDriver = roleDriverInput.checked;
            driverOnlyFields.classList.toggle('show', isDriver);

            drivingLicenseNumberInput.required = isDriver;
            licenseHolderNameInput.required = isDriver;
            licenseExpiryInput.required = isDriver;

            if (!isDriver) {
                drivingLicenseNumberInput.value = '';
                licenseHolderNameInput.value = '';
                licenseExpiryInput.value = '';
            }
        }

        roleCustomerInput.addEventListener('change', toggleDriverFields);
        roleDriverInput.addEventListener('change', toggleDriverFields);
        toggleDriverFields();


        // Form Submission
        signupForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            // Get and sanitize inputs
            const fullname = sanitizeInput(fullnameInput.value);
            const email = sanitizeEmail(emailInput.value);
            const phone = normalizePhoneForStorage(phoneInput.value);
            const password = passwordInput.value;

            // Validate sanitized inputs
            if (!fullname) {
                showError('Please enter a valid full name');
                return;
            }

            if (!email) {
                showError('Please enter a valid email address');
                return;
            }

            if (!phone) {
                showError('Please enter a valid phone number with country code (example: +919876543210).');
                return;
            }

            if (!password) {
                showError('Please create a password');
                return;
            }

            const passwordValidation = validatePassword(password);
            if (!passwordValidation.isValid) {
                showError(passwordValidation.message);
                return;
            }

            if (password !== confirmPasswordInput.value) {
                showError('Passwords do not match');
                return;
            }

            if (!termsCheckbox.checked) {
                showError('Please agree to Terms & Conditions');
                return;
            }

            const role = document.querySelector('input[name="role"]:checked').value;
            let drivingLicenseNumber = '';
            let licenseHolderName = '';
            let licenseExpiry = '';

            if (role === 'driver') {
                drivingLicenseNumber = sanitizeDrivingLicense(drivingLicenseNumberInput.value);
                licenseHolderName = sanitizeInput(licenseHolderNameInput.value);
                licenseExpiry = sanitizeInput(licenseExpiryInput.value);
                drivingLicenseNumberInput.value = drivingLicenseNumber;
                licenseHolderNameInput.value = licenseHolderName;

                if (!drivingLicenseNumber) {
                    showError('Driver signup ke liye driving license number required hai.');
                    return;
                }
                if (!validateDrivingLicense(drivingLicenseNumber)) {
                    showError('Please enter a valid driving license number.');
                    return;
                }
                if (!licenseHolderName) {
                    showError('Driving license par jo name hai, woh required hai.');
                    return;
                }
                if (normalizeNameForMatch(licenseHolderName) !== normalizeNameForMatch(fullname)) {
                    showError('Driver name aur driving license name match hona compulsory hai.');
                    return;
                }
                if (!licenseExpiry) {
                    showError('Please select driving license expiry date.');
                    return;
                }

                const expiryDate = new Date(licenseExpiry + 'T23:59:59');
                if (Number.isNaN(expiryDate.getTime()) || expiryDate < new Date()) {
                    showError('Driving license expiry valid future date honi chahiye.');
                    return;
                }
            }

            console.log('Signup attempt:', { role, fullname, email, phone });

            signupForm.style.opacity = '0.6';
            signupForm.style.pointerEvents = 'none';
            signupBtnText.innerHTML = '<span class="spinner"></span>Creating account...';

            try {
                if (window.GoIndiaAuthenticityEngine && typeof GoIndiaAuthenticityEngine.registerAction === 'function') {
                    const authScore = GoIndiaAuthenticityEngine.registerAction('signup', 'account_signup_attempt', {
                        role,
                        email,
                        phone,
                        drivingLicenseNumber: role === 'driver' ? drivingLicenseNumber : null
                    });

                    if (authScore && Number(authScore.score || 0) < 30) {
                        signupForm.style.opacity = '1';
                        signupForm.style.pointerEvents = 'auto';
                        signupBtnText.textContent = 'Create Account';
                        showError('Security check failed. Please contact support for manual verification.');
                        return;
                    }
                }

                const hashedPassword = await hashPassword(password);

                const users = mergeRecords(CUSTOMER_STORAGE_KEYS).filter((row) => isCustomerRecord(row));
                const drivers = mergeRecords(DRIVER_STORAGE_KEYS).filter((row) => isDriverRecord(row));
                const allAccounts = [...users, ...drivers];
                const emailExists = allAccounts.some((account) => sanitizeEmail(account.email || '') === email);
                const phoneExists = allAccounts.some((account) => normalizePhoneForStorage(account.phone || account.mobile || '') === phone);
                const licenseExists = role === 'driver' && drivers.some((driver) => sanitizeDrivingLicense(driver.drivingLicenseNumber || '') === drivingLicenseNumber);

                if (emailExists || phoneExists || licenseExists) {
                    signupForm.style.opacity = '1';
                    signupForm.style.pointerEvents = 'auto';
                    signupBtnText.textContent = 'Create Account';
                    showError('Account already exists with same email / phone / license. Please login or use forgot password.');
                    return;
                }

                const backendRegisterPayload = {
                    name: fullname,
                    email,
                    phone,
                    password,
                    role: 'user',
                    accountType: role === 'driver' ? 'driver' : 'customer',
                    website: '',
                    submittedAt: Date.now() - 1500,
                    recaptchaToken: createPseudoRecaptchaToken('gir-signup')
                };
                const backendResult = await registerSignupWithBackend(backendRegisterPayload);

                if (!backendResult.ok && !backendResult.networkFailure) {
                    signupForm.style.opacity = '1';
                    signupForm.style.pointerEvents = 'auto';
                    signupBtnText.textContent = 'Create Account';

                    const rawMessage = sanitizeInput((backendResult.data && backendResult.data.message) || '', 200).trim();
                    if (Number(backendResult.status || 0) === 409) {
                        showError(rawMessage || 'Account already exists. Please login.');
                        return;
                    }
                    if (Number(backendResult.status || 0) === 429) {
                        showError(rawMessage || 'Too many signup attempts. Thodi der baad dubara try karein.');
                        return;
                    }
                    if (Number(backendResult.status || 0) === 403 && /recaptcha/i.test(rawMessage)) {
                        showError('Security verification failed. Please refresh page and try again.');
                        return;
                    }
                    showError(rawMessage || 'Signup request reject ho gayi. Please try again.');
                    return;
                }

                if (role === 'customer') {
                    const newUser = {
                        id: createStableAccountId('customer', email, phone),
                        backendUserId: backendResult.ok ? String(backendResult.data?.id || '').trim() : '',
                        fullname,
                        email,
                        phone,
                        password: hashedPassword,
                        isPhoneVerified: Boolean(backendResult.data?.isPhoneVerified),
                        role: 'customer',
                        userType: 'customer',
                        createdAt: new Date().toISOString()
                    };
                    users.push(newUser);
                    writeRecords(CUSTOMER_STORAGE_KEYS, users);
                } else {
                    const newDriver = {
                        id: createStableAccountId('driver', email, phone),
                        backendUserId: backendResult.ok ? String(backendResult.data?.id || '').trim() : '',
                        name: fullname,
                        fullname,
                        email,
                        phone,
                        password: hashedPassword,
                        drivingLicenseNumber,
                        licenseHolderName,
                        drivingLicenseExpiry: licenseExpiry,
                        licenseVerified: false,
                        isPhoneVerified: Boolean(backendResult.data?.isPhoneVerified),
                        vehicleNumber: '',
                        userType: 'driver',
                        role: 'driver',
                        createdAt: new Date().toISOString()
                    };
                    drivers.push(newDriver);
                    writeRecords(DRIVER_STORAGE_KEYS, drivers);
                }

                persistAccountBackup(users, drivers);

                if (backendResult.ok) {
                    showSuccess('Account created successfully! Redirecting to login...');
                } else {
                    queuePendingSignupSync({
                        role,
                        fullname,
                        email,
                        phone,
                        backendPayload: backendRegisterPayload
                    });
                    showSuccess(
                        LIVE_BACKEND_REQUIRED_FOR_SIGNUP
                            ? 'Account is device par save ho gaya hai. Live server sync pending hai, aap login kar sakte hain.'
                            : 'Account created successfully! Redirecting to login...'
                    );
                }

                setTimeout(() => {
                    window.location.href = './login.html';
                }, 1500);

            } catch (error) {
                console.error('Signup error:', error);
                signupForm.style.opacity = '1';
                signupForm.style.pointerEvents = 'auto';
                signupBtnText.textContent = 'Create Account';
                showError('An error occurred. Please try again.');
            }
        });
        const existingCustomers = mergeRecords(CUSTOMER_STORAGE_KEYS).filter((row) => isCustomerRecord(row));
        const existingDrivers = mergeRecords(DRIVER_STORAGE_KEYS).filter((row) => isDriverRecord(row));
        persistAccountBackup(existingCustomers, existingDrivers);
                if ('serviceWorker' in navigator) {
                    window.addEventListener('load', () => {
                        const swVersion = '20260512-data-preserve1';
                        navigator.serviceWorker
                            .register('../sw.js?v=' + swVersion)
                    .then((registration) => {
                        registration.update().catch(() => {});
                    })
                    .catch(() => {});
            });
        }
        console.log('✅ Signup page loaded');
