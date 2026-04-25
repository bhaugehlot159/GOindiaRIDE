// Firebase Web SDK configuration for GO India RIDE.
// Project: gehlot-86e38
window.GOINDIARIDE_FIREBASE_CONFIG = {
    apiKey: 'AIzaSyDALwUMYGGhDuqKRYDQICF1QwnDsJwalik',
    authDomain: 'gehlot-86e38.firebaseapp.com',
    projectId: 'gehlot-86e38',
    storageBucket: 'gehlot-86e38.firebasestorage.app',
    messagingSenderId: '1086303809008',
    appId: '1:1086303809008:web:4325934708c7770c2d4135',
    measurementId: 'G-LJSEHPM2XH'
};


// Backend API base for secure wallet/payment flows.
// Local pages can run on 127.0.0.1:<port>, but API must stay on :5000.
(function resolveApiBase() {
    const host = String(window.location.hostname || '').toLowerCase();
    const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
    const isPrimaryWebsiteHost = host === 'goindiaride.in' || host === 'www.goindiaride.in' || host.endsWith('.goindiaride.in');
    const localBackendBase = 'http://localhost:5000';
    const productionBase = isPrimaryWebsiteHost
        ? 'https://api.goindiaride.in'
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

