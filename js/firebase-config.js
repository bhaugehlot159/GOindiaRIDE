// Firebase Web SDK configuration for GO India RIDE.
// Project: gehlot-86e38
// SECURITY: Configuration loaded from environment, never hardcoded
window.GOINDIARIDE_FIREBASE_CONFIG = {
    // API key loaded from backend via /api/config/firebase endpoint
    // DO NOT expose API key in frontend code
    apiKey: window.GOINDIARIDE_FIREBASE_API_KEY || '', // Set by backend
    authDomain: 'gehlot-86e38.firebaseapp.com',
    projectId: 'gehlot-86e38',
    databaseURL: window.GOINDIARIDE_FIREBASE_DATABASE_URL || '',
    storageBucket: 'gehlot-86e38.firebasestorage.app',
    messagingSenderId: '1086303809008',
    appId: '1:1086303809008:web:4325934708c7770c2d4135',
    measurementId: 'G-LJSEHPM2XH'
};

// Verify Firebase configuration is available
if (!window.GOINDIARIDE_FIREBASE_CONFIG.apiKey) {
    console.warn('[Firebase] Configuration not yet loaded from backend. Waiting...');
}


// Backend API base for secure wallet/payment flows.
// Local pages can run on 127.0.0.1:<port>, but API must stay on :5000.
(function resolveApiBase() {
    const host = String(window.location.hostname || '').toLowerCase();
    const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
    const isPrimaryWebsiteHost = host === 'goindiaride.in' || host === 'www.goindiaride.in' || host.endsWith('.goindiaride.in');
    const localBackendBase = 'http://localhost:5000';
    const renderBackendBase = 'https://goindiaride.onrender.com';
    const productionBase = isPrimaryWebsiteHost
        ? renderBackendBase
        : String(window.location.origin || '').replace(/\/$/, '');

    function normalizeBase(value) {
        const text = String(value || '').trim();
        if (!text) return '';
        return text.replace(/\/$/, '');
    }

    const existingBase = normalizeBase(window.GOINDIARIDE_API_BASE);
    if (!existingBase) {
        window.GOINDIARIDE_API_BASE = isLocalHost ? localBackendBase : productionBase;
        return;
    }

    if (isLocalHost) {
        try {
            const parsed = new URL(existingBase);
            const apiHost = String(parsed.hostname || '').toLowerCase();
            const apiPort = String(parsed.port || (parsed.protocol === 'https:' ? '443' : '80'));
            const isLocalApi = apiHost === 'localhost' || apiHost === '127.0.0.1' || apiHost === '::1' || apiHost === '[::1]';
            if (isLocalApi && apiPort !== '5000') {
                window.GOINDIARIDE_API_BASE = localBackendBase;
                return;
            }
        } catch (_error) {
            window.GOINDIARIDE_API_BASE = localBackendBase;
            return;
        }
    }

    window.GOINDIARIDE_API_BASE = existingBase;
})();

(function initFirebaseClientConfigResolver() {
    const defaultConfig = Object.freeze({
        ...(window.GOINDIARIDE_FIREBASE_CONFIG || {})
    });
    const forceStaticConfig = String(window.GOINDIARIDE_FORCE_STATIC_FIREBASE_CONFIG || '').toLowerCase() === 'true';
    const host = String(window.location.hostname || '').toLowerCase();
    const isPrimaryWebsiteHost = host === 'goindiaride.in' || host === 'www.goindiaride.in' || host.endsWith('.goindiaride.in');
    const isRenderHost = host === 'goindiaride.onrender.com' || host.endsWith('.onrender.com');
    const shouldPreferBackendConfig = isPrimaryWebsiteHost || isRenderHost;
    const clientConfigPath = '/api/auth/firebase/client-config';
    let configPromise = null;

    function normalizeConfig(rawConfig) {
        const candidate = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
        return {
            ...defaultConfig,
            ...candidate
        };
    }

    function applyResolvedConfig(rawConfig, source) {
        const normalized = normalizeConfig(rawConfig);
        window.GOINDIARIDE_FIREBASE_CONFIG = normalized;
        window.GOINDIARIDE_FIREBASE_CONFIG_SOURCE = source || 'static';
        return normalized;
    }

    function isLikelyFirebaseApiKey(value) {
        const key = String(value || '').trim();
        return /^AIza[0-9A-Za-z_-]{20,}$/.test(key) && !key.includes('replace_with_');
    }

    function isLikelyFirebaseProjectId(value) {
        const projectId = String(value || '').trim();
        return /^[a-z][a-z0-9-]{4,30}$/.test(projectId);
    }

    function isLikelyFirebaseAuthDomain(value) {
        const authDomain = String(value || '').trim();
        return /^[a-z0-9-]+\.firebaseapp\.com$/i.test(authDomain);
    }

    function isLikelyFirebaseAppId(value) {
        const appId = String(value || '').trim();
        return /^\d+:\d+:[a-z]+:[0-9a-z]+$/i.test(appId);
    }

    function isLikelyFirebaseClientConfig(config) {
        const candidate = config && typeof config === 'object' ? config : {};
        return isLikelyFirebaseApiKey(candidate.apiKey)
            && isLikelyFirebaseProjectId(candidate.projectId)
            && isLikelyFirebaseAuthDomain(candidate.authDomain)
            && isLikelyFirebaseAppId(candidate.appId);
    }

    async function loadFirebaseClientConfig(options = {}) {
        const forceRefresh = Boolean(options && options.forceRefresh);
        const preferDynamic = Boolean(options && options.preferDynamic);
        if (forceStaticConfig && !preferDynamic) {
            return applyResolvedConfig(window.GOINDIARIDE_FIREBASE_CONFIG, 'static');
        }
        if (!shouldPreferBackendConfig && !preferDynamic) {
            return applyResolvedConfig(window.GOINDIARIDE_FIREBASE_CONFIG, 'static');
        }
        if (configPromise && !forceRefresh) {
            return configPromise;
        }

        const apiBase = String(window.GOINDIARIDE_API_BASE || '').trim().replace(/\/$/, '');
        if (!apiBase) {
            return applyResolvedConfig(window.GOINDIARIDE_FIREBASE_CONFIG, 'static');
        }

        configPromise = (async () => {
            const fallbackConfig = normalizeConfig(window.GOINDIARIDE_FIREBASE_CONFIG);
            try {
                const controller = typeof AbortController === 'function' ? new AbortController() : null;
                const timeoutId = controller ? window.setTimeout(() => controller.abort(), 8000) : null;
                const response = await fetch(`${apiBase}${clientConfigPath}`, {
                    method: 'GET',
                    cache: 'no-store',
                    headers: {
                        Accept: 'application/json'
                    },
                    signal: controller ? controller.signal : undefined
                });
                if (timeoutId) window.clearTimeout(timeoutId);
                if (!response.ok) {
                    window.GOINDIARIDE_FIREBASE_CONFIG_LAST_ERROR = `client_config_http_${response.status}`;
                    return applyResolvedConfig(fallbackConfig, 'static');
                }
                const data = await response.json().catch(() => ({}));
                const resolvedConfig = normalizeConfig(data && data.config);
                if (isLikelyFirebaseClientConfig(resolvedConfig)) {
                    window.GOINDIARIDE_FIREBASE_CONFIG_LAST_ERROR = '';
                    return applyResolvedConfig(resolvedConfig, 'backend');
                }
                window.GOINDIARIDE_FIREBASE_CONFIG_LAST_ERROR = 'client_config_invalid_payload';
                return applyResolvedConfig(fallbackConfig, 'static');
            } catch (error) {
                window.GOINDIARIDE_FIREBASE_CONFIG_LAST_ERROR = String(error?.name || error?.message || error || 'client_config_fetch_failed').slice(0, 160);
                return applyResolvedConfig(fallbackConfig, 'static');
            }
        })();

        const result = await configPromise;
        if (forceRefresh) {
            configPromise = Promise.resolve(result);
        }
        return result;
    }

    window.resolveGoIndiaFirebaseConfig = loadFirebaseClientConfig;
    window.getGoIndiaFirebaseConfig = function getGoIndiaFirebaseConfig() {
        return normalizeConfig(window.GOINDIARIDE_FIREBASE_CONFIG);
    };
})();

