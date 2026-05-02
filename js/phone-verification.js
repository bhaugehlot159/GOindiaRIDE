(function initGoIndiaPhoneVerification() {
  const verificationSessions = new Map();
  let firebaseReady = false;

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

  function ensureFirebaseReady() {
    if (firebaseReady && window.firebase && window.firebase.auth) {
      return window.firebase.auth();
    }

    if (!window.firebase || typeof window.firebase.auth !== 'function') {
      throw new Error('Phone verification library load nahi hui. Page reload karein.');
    }

    const config = window.GOINDIARIDE_FIREBASE_CONFIG || {};
    const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'appId'];
    const missing = requiredKeys.filter((key) => !config[key]);
    if (missing.length) {
      throw new Error('Firebase phone verification config missing hai.');
    }

    if (!window.firebase.apps.length) {
      window.firebase.initializeApp(config);
    }

    firebaseReady = true;
    return window.firebase.auth();
  }

  function ensureRecaptcha(sessionKey, containerId) {
    const auth = ensureFirebaseReady();
    const existing = verificationSessions.get(sessionKey);
    if (existing && existing.recaptchaVerifier) {
      return existing.recaptchaVerifier;
    }

    let container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement('div');
      container.id = containerId;
      container.style.display = 'none';
      document.body.appendChild(container);
    }

    const verifier = new window.firebase.auth.RecaptchaVerifier(containerId, {
      size: 'invisible'
    }, auth);
    verifier.render();

    verificationSessions.set(sessionKey, {
      ...(existing || {}),
      recaptchaVerifier: verifier
    });
    return verifier;
  }

  async function sendOtp(phone, { sessionKey = 'default', containerId = 'goindiaride-phone-recaptcha' } = {}) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      throw new Error('Please enter valid mobile with country code.');
    }

    const auth = ensureFirebaseReady();
    const verifier = ensureRecaptcha(sessionKey, containerId);
    const confirmation = await auth.signInWithPhoneNumber(normalizedPhone, verifier);

    verificationSessions.set(sessionKey, {
      ...(verificationSessions.get(sessionKey) || {}),
      confirmation,
      phone: normalizedPhone,
      verified: false
    });

    return { phone: normalizedPhone };
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
