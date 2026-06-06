(function initGoIndiaPhoneVerification() {
  const verificationSessions = new Map();
  let firebaseReady = false;
  let activeFirebaseConfig = null;

  function isInvalidApiKeyError(error) {
    const code = String(error && error.code || '').trim().toLowerCase();
    const message = String(error && error.message || '').trim().toLowerCase();
    return code === 'auth/invalid-api-key' || message.includes('auth/invalid-api-key') || message.includes('invalid api key');
  }

  function isUnauthorizedDomainError(error) {
    const code = String(error && error.code || '').trim().toLowerCase();
    const message = String(error && error.message || '').trim().toLowerCase();
    return code === 'auth/unauthorized-domain'
      || message.includes('unauthorized-domain')
      || message.includes('site_mismatch')
      || message.includes('domain');
  }

  function isCaptchaCheckFailedError(error) {
    const code = String(error && error.code || '').trim().toLowerCase();
    const message = String(error && error.message || '').trim().toLowerCase();
    return code === 'auth/captcha-check-failed'
      || message.includes('captcha-check-failed')
      || message.includes('recaptcha');
  }

  function isOperationNotAllowedError(error) {
    const code = String(error && error.code || '').trim().toLowerCase();
    const message = String(error && error.message || '').trim().toLowerCase();
    return code === 'auth/operation-not-allowed'
      || message.includes('operation-not-allowed')
      || message.includes('sign in method')
      || message.includes('provider');
  }

  function maskFirebaseApiKey(value) {
    const key = String(value || '').trim();
    if (!key) return 'missing';
    if (key.length <= 12) return `${key.slice(0, 4)}...`;
    return `${key.slice(0, 7)}...${key.slice(-4)}`;
  }

  function getActiveFirebaseConfigSummary() {
    const cfg = activeFirebaseConfig || window.GOINDIARIDE_FIREBASE_CONFIG || {};
    const source = String(window.GOINDIARIDE_FIREBASE_CONFIG_SOURCE || 'static').trim() || 'static';
    return {
      apiKeyMasked: maskFirebaseApiKey(cfg.apiKey),
      projectId: String(cfg.projectId || '').trim() || 'unknown',
      authDomain: String(cfg.authDomain || '').trim() || 'unknown',
      source
    };
  }

  function toFriendlyFirebaseError(error) {
    if (isUnauthorizedDomainError(error) || isCaptchaCheckFailedError(error)) {
      return new Error('Phone OTP security setup needs admin update for this domain. Please retry after the domain is enabled.');
    }
    if (isOperationNotAllowedError(error)) {
      return new Error('Phone OTP provider is not enabled yet. Please contact admin/support to enable phone verification.');
    }
    if (isInvalidApiKeyError(error)) {
      return new Error('Phone OTP service needs admin configuration. Please retry after Firebase settings are updated.');
    }
    return error instanceof Error ? error : new Error(String(error || 'Phone verification failed'));
  }

  function normalizePhone(value) {
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

  async function resetFirebaseState(sessionKey) {
    if (sessionKey) {
      clearSession(sessionKey);
    } else {
      Array.from(verificationSessions.keys()).forEach((key) => clearSession(key));
    }
    firebaseReady = false;
    if (window.firebase && Array.isArray(window.firebase.apps) && window.firebase.apps.length) {
      const apps = window.firebase.apps.slice();
      for (const app of apps) {
        if (app && typeof app.delete === 'function') {
          try {
            await app.delete();
          } catch (_error) {
            // Ignore delete issues and try fresh init.
          }
        }
      }
    }
  }

  async function ensureFirebaseReady(options = {}) {
    const forceRefresh = Boolean(options && options.forceRefresh);
    const preferDynamic = Boolean(options && options.preferDynamic);
    if (!forceRefresh && firebaseReady && window.firebase && window.firebase.auth) {
      return window.firebase.auth();
    }

    if (!window.firebase || typeof window.firebase.auth !== 'function') {
      throw new Error('Phone verification library load nahi hui. Page reload karein.');
    }

    if (forceRefresh) {
      await resetFirebaseState();
    }

    const config = typeof window.resolveGoIndiaFirebaseConfig === 'function'
      ? await window.resolveGoIndiaFirebaseConfig({ forceRefresh, preferDynamic })
      : (window.GOINDIARIDE_FIREBASE_CONFIG || {});
    const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'appId'];
    const missing = requiredKeys.filter((key) => !config[key]);
    if (missing.length) {
      throw new Error('Firebase phone verification config missing hai.');
    }
    activeFirebaseConfig = {
      apiKey: String(config.apiKey || '').trim(),
      authDomain: String(config.authDomain || '').trim(),
      projectId: String(config.projectId || '').trim(),
      appId: String(config.appId || '').trim()
    };

    if (!window.firebase.apps.length) {
      window.firebase.initializeApp(config);
    }

    firebaseReady = true;
    return window.firebase.auth();
  }

  async function ensureRecaptcha(sessionKey, containerId) {
    const auth = await ensureFirebaseReady();
    const existing = verificationSessions.get(sessionKey);
    if (existing && existing.recaptchaVerifier) {
      return existing.recaptchaVerifier;
    }

    let container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement('div');
      container.id = containerId;
      container.style.display = 'none';
      (document.body || document.documentElement).appendChild(container);
    }

    const verifierApp = auth && auth.app ? auth.app : undefined;
    const verifierOptions = { size: 'invisible' };
    const verifier = verifierApp
      ? new window.firebase.auth.RecaptchaVerifier(containerId, verifierOptions, verifierApp)
      : new window.firebase.auth.RecaptchaVerifier(containerId, verifierOptions);
    await verifier.render();

    verificationSessions.set(sessionKey, {
      ...(existing || {}),
      recaptchaVerifier: verifier
    });
    return verifier;
  }

  async function sendOtp(phone, { sessionKey = 'default', containerId = 'goindiaride-phone-recaptcha', _retried = false } = {}) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      throw new Error('Please enter valid mobile with country code.');
    }

    try {
      const auth = await ensureFirebaseReady();
      const verifier = await ensureRecaptcha(sessionKey, containerId);
      const confirmation = await auth.signInWithPhoneNumber(normalizedPhone, verifier);

      verificationSessions.set(sessionKey, {
        ...(verificationSessions.get(sessionKey) || {}),
        confirmation,
        phone: normalizedPhone,
        verified: false
      });

      return { phone: normalizedPhone };
    } catch (error) {
      if (!_retried && isInvalidApiKeyError(error)) {
        try {
          await ensureFirebaseReady({ forceRefresh: true, preferDynamic: true });
          return sendOtp(normalizedPhone, {
            sessionKey,
            containerId,
            _retried: true
          });
        } catch (retryError) {
          throw toFriendlyFirebaseError(retryError);
        }
      }
      throw toFriendlyFirebaseError(error);
    }
  }

  async function verifyOtp(otp, { sessionKey = 'default' } = {}) {
    const session = verificationSessions.get(sessionKey);
    if (!session || !session.confirmation) {
      throw new Error('Pehle OTP bhejein.');
    }

    const cleanOtp = String(otp || '').trim();
    if (!/^\d{6}$/.test(cleanOtp)) {
      throw new Error('Please enter valid 6-digit OTP.');
    }

    const result = await session.confirmation.confirm(cleanOtp);
    let firebaseIdToken = '';
    if (result && result.user && typeof result.user.getIdToken === 'function') {
      firebaseIdToken = await result.user.getIdToken().catch(() => '');
    }

    verificationSessions.set(sessionKey, {
      ...session,
      verified: true,
      firebaseIdToken,
      userCredential: result
    });

    return {
      phone: session.phone,
      verified: true,
      firebaseIdToken
    };
  }

  function clearSession(sessionKey = 'default') {
    const session = verificationSessions.get(sessionKey);
    if (session && session.recaptchaVerifier && typeof session.recaptchaVerifier.clear === 'function') {
      try {
        session.recaptchaVerifier.clear();
      } catch (_error) {
        // Ignore recaptcha clear issues.
      }
    }
    verificationSessions.delete(sessionKey);
  }

  window.GoIndiaPhoneVerification = {
    normalizePhone,
    sendOtp,
    verifyOtp,
    clearSession
  };
})();
