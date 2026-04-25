(function aiAutoDetectiveBootstrap() {
    'use strict';

    const INCIDENT_STORAGE_KEY = 'goindia_ai_security_incidents_v1';
    const STATE_STORAGE_KEY = 'goindia_ai_security_state_v1';
    const GEO_STORAGE_KEY = 'goindia_ai_security_geo_v1';
    const MAX_INCIDENTS = 120;
    const SCORE_DECAY_INTERVAL_MS = 15000;
    const SCORE_DECAY_VALUE = 1;
    const STALE_STATE_RESET_MS = 60 * 60 * 1000;
    const LOCKDOWN_SCORE_THRESHOLD = 92;
    const LOCKDOWN_RELEASE_THRESHOLD = 70;
    const LOCKDOWN_MIN_HIGH_INCIDENTS = 2;
    const MAX_SCRIPT_NODES_PER_MUTATION = 30;
    const currentPath = String(location.pathname || '/').toLowerCase();
    const isPublicEntryPage =
        currentPath === '/' ||
        currentPath.endsWith('/index.html') ||
        currentPath.endsWith('/pages/login.html') ||
        currentPath.endsWith('/pages/signup.html');
    const lockdownEnabled =
        /\/pages\/(booking|payment|checkout|customer-dashboard|driver-dashboard|admin-dashboard|wallet|admin\/)/.test(currentPath) ||
        document.documentElement.getAttribute('data-ai-lockdown-enabled') === 'true';
    const trustedScriptPrefixes = [
        location.origin,
        'https://cdnjs.cloudflare.com',
        'https://www.gstatic.com',
        'https://translate.google.com',
        'https://translate.googleapis.com'
    ];
    const inspectedScriptSources = new Set();

    const state = {
        score: 0,
        level: 'low',
        lockdown: false,
        fingerprint: '',
        lastUpdatedAt: new Date().toISOString(),
        liveSignals: {
            rapidClicks: 0,
            suspiciousInputs: 0,
            scriptInjection: 0,
            devtools: 0,
            geoAnomaly: 0
        }
    };

    const suspiciousPatterns = [
        /<\s*script/i,
        /javascript:/i,
        /onerror\s*=/i,
        /onload\s*=/i,
        /union\s+select/i,
        /drop\s+table/i,
        /\bor\b\s+1\s*=\s*1/i,
        /<\s*iframe/i
    ];

    function normalizeApiBase(value) {
        const raw = String(value || '').trim();
        return raw ? raw.replace(/\/+$/, '') : '';
    }

    function resolveSecurityApiBase() {
        const host = String(window.location.hostname || '').toLowerCase();
        const fromRuntime = normalizeApiBase(window.__GOINDIARIDE_RUNTIME_API_ORIGIN__ || window.__GOINDIARIDE_API_ORIGIN__ || '');
        const fromWindow = normalizeApiBase(window.GOINDIARIDE_API_BASE || '');
        let fromStorage = '';
        try {
            fromStorage = normalizeApiBase(localStorage.getItem('goindiaride_api_base') || '');
        } catch (_error) {
            fromStorage = '';
        }

        if (fromRuntime) return fromRuntime;
        if (fromWindow) return fromWindow;
        if (fromStorage) return fromStorage;

        if (
            host === 'goindiaride.in' ||
            host === 'www.goindiaride.in' ||
            host.endsWith('.goindiaride.in') ||
            host === 'github.io' ||
            host.endsWith('.github.io')
        ) {
            return 'https://api.goindiaride.in';
        }

        if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') {
            return 'http://localhost:5000';
        }

        return normalizeApiBase(window.location.origin || '');
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function hashString(input) {
        let hash = 0;
        const normalized = String(input || '');
        for (let i = 0; i < normalized.length; i += 1) {
            hash = ((hash << 5) - hash) + normalized.charCodeAt(i);
            hash |= 0;
        }
        return `fp_${Math.abs(hash)}`;
    }

    function buildFingerprint() {
        const raw = [
            navigator.userAgent,
            navigator.language,
            navigator.platform,
            `${screen.width}x${screen.height}`,
            `${new Date().getTimezoneOffset()}`,
            `${navigator.hardwareConcurrency || 0}`
        ].join('::');
        return hashString(raw);
    }

    function readJsonStorage(key, fallbackValue) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return fallbackValue;
            const parsed = JSON.parse(raw);
            return parsed == null ? fallbackValue : parsed;
        } catch (error) {
            return fallbackValue;
        }
    }

    function writeJsonStorage(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            // no-op for private browsing/full localStorage cases
        }
    }

    function getStoredIncidents() {
        const incidents = readJsonStorage(INCIDENT_STORAGE_KEY, []);
        return Array.isArray(incidents) ? incidents : [];
    }

    function saveStoredIncidents(incidents) {
        writeJsonStorage(INCIDENT_STORAGE_KEY, incidents.slice(0, MAX_INCIDENTS));
    }

    function toLevel(score) {
        if (score >= 90) return 'critical';
        if (score >= 70) return 'high';
        if (score >= 40) return 'medium';
        return 'low';
    }

    function dispatchSecurityEvents() {
        const detail = {
            state: { ...state },
            incidents: getStoredIncidents()
        };

        window.dispatchEvent(new CustomEvent('goindia:security-state', { detail }));
        window.dispatchEvent(new CustomEvent('goindia:security-incidents', { detail }));
    }

    function notify(message, level) {
        if (isPublicEntryPage && (level === 'medium' || level === 'high')) {
            return;
        }

        let container = document.getElementById('ai-security-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'ai-security-toast-container';
            container.style.position = 'fixed';
            container.style.right = '16px';
            container.style.bottom = '16px';
            container.style.zIndex = '9999';
            container.style.display = 'grid';
            container.style.gap = '10px';
            container.style.maxWidth = '360px';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        const palette = {
            low: '#2e7d32',
            medium: '#ef6c00',
            high: '#d32f2f',
            critical: '#6a1b9a'
        };

        toast.style.background = '#fff';
        toast.style.borderLeft = `4px solid ${palette[level] || palette.medium}`;
        toast.style.color = '#212121';
        toast.style.padding = '12px 14px';
        toast.style.borderRadius = '10px';
        toast.style.boxShadow = '0 10px 24px rgba(0, 0, 0, 0.18)';
        toast.style.fontSize = '13px';
        toast.style.lineHeight = '1.4';
        toast.textContent = `AI Security: ${message}`;

        container.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 4200);
    }

    function toggleSensitiveActions(disabled) {
        const targets = document.querySelectorAll('[data-sensitive-action], .btn-confirm, .btn-pay, .btn-book, .booking-submit, button[type="submit"]');
        targets.forEach((element) => {
            if (!element || !(element instanceof HTMLElement)) return;
            if (element.classList.contains('btn-login') || element.classList.contains('btn-signup')) return;

            if (disabled) {
                if (element.dataset.aiSecurityLocked === '1') return;

                const currentDisabled = element.hasAttribute('disabled');
                element.dataset.aiSecurityPreviousDisabled = currentDisabled ? '1' : '0';
                element.dataset.aiSecurityLocked = '1';
                element.setAttribute('disabled', 'disabled');
                element.style.opacity = '0.6';
                element.style.pointerEvents = 'none';
            } else {
                if (element.dataset.aiSecurityLocked !== '1') return;

                if (element.dataset.aiSecurityPreviousDisabled !== '1') {
                    element.removeAttribute('disabled');
                }

                element.style.opacity = '';
                element.style.pointerEvents = '';
                delete element.dataset.aiSecurityLocked;
                delete element.dataset.aiSecurityPreviousDisabled;
            }
        });
    }

    function updateStateStorage() {
        state.level = toLevel(state.score);
        state.lastUpdatedAt = new Date().toISOString();
        writeJsonStorage(STATE_STORAGE_KEY, state);
    }

    function maybeToggleLockdown() {
        if (!lockdownEnabled) {
            if (state.lockdown) {
                state.lockdown = false;
                toggleSensitiveActions(false);
            }
            return;
        }

        const now = Date.now();
        const highIncidentCount = getStoredIncidents().filter((incident) => {
            const level = String(incident.level || '').toLowerCase();
            if (level !== 'high' && level !== 'critical') return false;
            const atMs = Date.parse(incident.at || '');
            if (Number.isNaN(atMs)) return false;
            return now - atMs <= 20 * 60 * 1000;
        }).length;

        if (state.score >= LOCKDOWN_SCORE_THRESHOLD && highIncidentCount >= LOCKDOWN_MIN_HIGH_INCIDENTS && !state.lockdown) {
            state.lockdown = true;
            toggleSensitiveActions(true);
            notify('Risk high detected. Sensitive actions temporarily locked.', 'high');
        }

        if ((state.score < LOCKDOWN_RELEASE_THRESHOLD || highIncidentCount === 0) && state.lockdown) {
            state.lockdown = false;
            toggleSensitiveActions(false);
            notify('Risk normalized. Sensitive actions unlocked.', 'low');
        }
    }

    function renderWidget() {
        const widget = document.getElementById('ai-security-widget');
        if (!widget) return;

        const incidents = getStoredIncidents().slice(0, 5);

        widget.innerHTML = `
            <div class="ai-security-live-score">
                <strong>Risk Score:</strong> ${state.score}/100
            </div>
            <div class="ai-security-live-level ai-level-${state.level}">
                <strong>Threat Level:</strong> ${state.level.toUpperCase()}
            </div>
            <div class="ai-security-live-fingerprint">
                <strong>Device Fingerprint:</strong> ${state.fingerprint}
            </div>
            <ul class="ai-security-live-feed">
                ${incidents.length
                    ? incidents.map((item) => `<li><span>${new Date(item.at).toLocaleTimeString()}</span> ${item.message}</li>`).join('')
                    : '<li>No suspicious activity detected yet.</li>'}
            </ul>
        `;
    }

    function renderAdminTable() {
        const tableBody = document.getElementById('aiSecurityEventsBody');
        if (!tableBody) return;

        const incidents = getStoredIncidents().slice(0, 20);
        if (!incidents.length) {
            tableBody.innerHTML = '<tr><td colspan="5">No incidents detected.</td></tr>';
            return;
        }

        tableBody.innerHTML = incidents.map((item) => `
            <tr>
                <td>${item.id}</td>
                <td>${new Date(item.at).toLocaleString()}</td>
                <td>${item.level}</td>
                <td>${item.type}</td>
                <td>${item.message}</td>
            </tr>
        `).join('');
    }

    async function sendIncidentToBackend(incident) {
        const accessToken =
            localStorage.getItem('accessToken') ||
            localStorage.getItem('authToken') ||
            localStorage.getItem('token');

        if (!accessToken) {
            return;
        }

        const apiBase = resolveSecurityApiBase();
        if (!apiBase) {
            return;
        }

        try {
            await fetch(`${apiBase}/api/security/event`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${accessToken}`,
                    'x-device-fingerprint': state.fingerprint,
                    'x-city': localStorage.getItem('currentCity') || 'unknown'
                },
                body: JSON.stringify({
                    source: 'client',
                    eventType: incident.type,
                    metadata: {
                        uiLevel: incident.level,
                        message: incident.message,
                        page: location.pathname,
                        riskDelta: incident.delta
                    }
                })
            });
        } catch (error) {
            // intentionally silent
        }
    }

    function recordIncident({ type, level, delta, message, evidence }) {
        const clampedDelta = clamp(Number(delta) || 0, 0, 40);
        state.score = clamp(state.score + clampedDelta, 0, 100);
        updateStateStorage();
        maybeToggleLockdown();

        const incident = {
            id: `SE-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
            type,
            level,
            delta: clampedDelta,
            message,
            evidence: evidence || {},
            at: new Date().toISOString(),
            page: location.pathname,
            fingerprint: state.fingerprint
        };

        const incidents = getStoredIncidents();
        incidents.unshift(incident);
        saveStoredIncidents(incidents);

        notify(message, level);
        renderWidget();
        renderAdminTable();
        dispatchSecurityEvents();
        sendIncidentToBackend(incident);
    }

    function monitorRapidClicks() {
        const clickBuffer = [];

        document.addEventListener('click', () => {
            const now = Date.now();
            clickBuffer.push(now);

            while (clickBuffer.length && (now - clickBuffer[0]) > 12000) {
                clickBuffer.shift();
            }

            state.liveSignals.rapidClicks = clickBuffer.length;

            if (clickBuffer.length >= 38) {
                recordIncident({
                    type: 'bot_click_burst',
                    level: 'high',
                    delta: 22,
                    message: 'Rapid click burst detected (possible automated script).',
                    evidence: { clicksIn12Sec: clickBuffer.length }
                });
                clickBuffer.length = 0;
            }
        }, { passive: true });
    }

    function monitorSuspiciousInput() {
        document.addEventListener('input', (event) => {
            const target = event.target;
            if (!target || typeof target.value !== 'string') return;

            const value = target.value;
            if (!value || value.length < 6) return;

            const matchedPattern = suspiciousPatterns.find((pattern) => pattern.test(value));
            if (!matchedPattern) return;

            state.liveSignals.suspiciousInputs += 1;

            recordIncident({
                type: 'payload_injection_attempt',
                level: 'critical',
                delta: 26,
                message: 'Suspicious payload pattern detected in input field.',
                evidence: {
                    field: target.name || target.id || 'unknown',
                    pattern: matchedPattern.toString()
                }
            });
        });
    }

    function monitorScriptInjection() {
        if (!window.MutationObserver) return;

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                const nodes = Array.from(mutation.addedNodes || []);
                if (!nodes.length) return;

                nodes.slice(0, MAX_SCRIPT_NODES_PER_MUTATION).forEach((node) => {
                    if (!node || node.nodeType !== 1 || node.tagName !== 'SCRIPT') return;

                    const src = node.getAttribute('src') || '';
                    if (!src || src.startsWith('/')) return;
                    if (inspectedScriptSources.has(src)) return;

                    inspectedScriptSources.add(src);
                    const trusted = trustedScriptPrefixes.some((prefix) => src.startsWith(prefix));
                    if (trusted) return;

                    state.liveSignals.scriptInjection += 1;
                    recordIncident({
                        type: 'unauthorized_script_injection',
                        level: 'critical',
                        delta: 30,
                        message: 'Unauthorized script source detected and flagged.',
                        evidence: { src }
                    });
                });
            });
        });

        observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    function monitorDevtoolsProbe() {
        let consecutiveTriggers = 0;

        setInterval(() => {
            const widthDelta = window.outerWidth - window.innerWidth;
            const heightDelta = window.outerHeight - window.innerHeight;
            const lookedOpen = widthDelta > 180 || heightDelta > 180;

            if (lookedOpen) {
                consecutiveTriggers += 1;
            } else {
                consecutiveTriggers = 0;
            }

            state.liveSignals.devtools = consecutiveTriggers;

            if (consecutiveTriggers === 4) {
                recordIncident({
                    type: 'devtools_probe',
                    level: 'medium',
                    delta: 10,
                    message: 'Developer tools pattern observed. Session moved to enhanced monitoring.',
                    evidence: { widthDelta, heightDelta }
                });
            }
        }, 3000);
    }

    function monitorGeoAnomaly() {
        if (!navigator.geolocation || !window.isSecureContext) return;

        const lastGeo = readJsonStorage(GEO_STORAGE_KEY, null);
        navigator.geolocation.getCurrentPosition((position) => {
            const current = {
                lat: position.coords.latitude,
                lon: position.coords.longitude,
                at: Date.now()
            };

            if (lastGeo && typeof lastGeo.lat === 'number' && typeof lastGeo.lon === 'number' && typeof lastGeo.at === 'number') {
                const minutes = Math.max(1, Math.round((current.at - lastGeo.at) / 60000));
                const latDiff = Math.abs(current.lat - lastGeo.lat);
                const lonDiff = Math.abs(current.lon - lastGeo.lon);

                const approxKm = Math.sqrt((latDiff * latDiff) + (lonDiff * lonDiff)) * 111;
                const speedKmph = Math.round((approxKm / minutes) * 60);

                if (speedKmph > 550) {
                    state.liveSignals.geoAnomaly += 1;
                    recordIncident({
                        type: 'geo_velocity_anomaly',
                        level: 'high',
                        delta: 18,
                        message: 'Location velocity anomaly detected (possible spoof/VPN jump).',
                        evidence: { speedKmph }
                    });
                }
            }

            writeJsonStorage(GEO_STORAGE_KEY, current);
        }, () => {
            // geolocation denied
        }, {
            enableHighAccuracy: false,
            timeout: 3500,
            maximumAge: 120000
        });
    }

    function startScoreDecay() {
        setInterval(() => {
            if (state.score <= 0) return;
            state.score = clamp(state.score - SCORE_DECAY_VALUE, 0, 100);
            updateStateStorage();
            maybeToggleLockdown();
            renderWidget();
            renderAdminTable();
            dispatchSecurityEvents();
        }, SCORE_DECAY_INTERVAL_MS);
    }

    function runQuickSweep() {
        let suspiciousInlineScripts = 0;
        document.querySelectorAll('script').forEach((scriptNode) => {
            if (!scriptNode.src && scriptNode.textContent && scriptNode.textContent.length > 16000) {
                suspiciousInlineScripts += 1;
            }
        });

        if (suspiciousInlineScripts > 0) {
            recordIncident({
                type: 'inline_script_anomaly',
                level: 'medium',
                delta: 12,
                message: 'Large inline script footprint observed in active DOM.',
                evidence: { suspiciousInlineScripts }
            });
        }

        return {
            suspiciousInlineScripts,
            score: state.score,
            level: state.level
        };
    }

    function boot() {
        state.fingerprint = buildFingerprint();

        const previousState = readJsonStorage(STATE_STORAGE_KEY, null);
        if (previousState && typeof previousState.score === 'number') {
            state.score = clamp(previousState.score, 0, 100);
            state.lockdown = Boolean(previousState.lockdown);

            const lastUpdatedMs = Date.parse(previousState.lastUpdatedAt || '');
            const stateIsStale = Number.isNaN(lastUpdatedMs) || (Date.now() - lastUpdatedMs > STALE_STATE_RESET_MS);

            // Prevent stale/high public-page score from locking normal users.
            if (stateIsStale || isPublicEntryPage) {
                state.score = Math.min(state.score, 34);
                state.lockdown = false;
                toggleSensitiveActions(false);
            }
        }

        updateStateStorage();
        renderWidget();
        renderAdminTable();
        dispatchSecurityEvents();

        monitorRapidClicks();
        monitorSuspiciousInput();
        monitorScriptInjection();
        monitorDevtoolsProbe();
        monitorGeoAnomaly();
        startScoreDecay();

        setTimeout(() => {
            runQuickSweep();
        }, 1200);

        window.GoIndiaAISecurity = {
            getState: () => ({ ...state }),
            getIncidents: () => [...getStoredIncidents()],
            runQuickSweep,
            raiseManualFlag: (message, level = 'medium') => {
                recordIncident({
                    type: 'manual_admin_flag',
                    level,
                    delta: level === 'critical' ? 25 : 12,
                    message: String(message || 'Manual flag raised by operator'),
                    evidence: { source: 'manual' }
                });
            }
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
