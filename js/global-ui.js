(function initGlobalUI() {
    'use strict';

    if (typeof document === 'undefined' || typeof window === 'undefined') {
        return;
    }

    const STYLE_ID = 'goi-global-ui-style';
    const NAV_DOCK_ID = 'goi-global-nav-dock';
    const HEADER_SELECTORS = [
        '.navbar',
        '.top-nav',
        '.portal-header',
        '.header',
        '.app-header',
        '.main-header',
        '.dashboard-header',
        '.topbar'
    ];

    function resolveHomePath() {
        const path = String(window.location.pathname || '').toLowerCase();

        if (path.includes('/pages/legal/')) {
            return '../../index.html';
        }

        if (
            path.includes('/pages/') ||
            path.includes('/customer/') ||
            path.includes('/driver/') ||
            path.includes('/admin/') ||
            path.includes('/frontend/')
        ) {
            return '../index.html';
        }

        return './index.html';
    }

    function resolvePageKind() {
        const path = String(window.location.pathname || '').toLowerCase();

        if (path.includes('/pages/login.html')) return 'login';
        if (path.includes('/pages/signup.html')) return 'signup';
        if (path.includes('/pages/legal/')) return 'legal';
        if (path.includes('/pages/booking.html')) return 'booking';
        if (path.includes('/pages/customer-dashboard.html')) return 'customer-dashboard';
        if (path.includes('/pages/driver-dashboard.html')) return 'driver-dashboard';
        if (path.includes('/pages/admin-dashboard.html')) return 'admin-dashboard';
        if (path.includes('/pages/donations.html')) return 'donations';

        return 'generic';
    }

    function getPrimaryHeader() {
        for (let index = 0; index < HEADER_SELECTORS.length; index += 1) {
            const node = document.querySelector(HEADER_SELECTORS[index]);
            if (node) return node;
        }
        return null;
    }

    function getDockTopOffset() {
        const header = getPrimaryHeader();
        if (!header) return 12;

        const height = Number(header.offsetHeight || 0);
        const normalized = Number.isFinite(height) ? height : 0;

        // Keep dock below header so header controls remain clickable.
        return Math.max(12, Math.min(normalized + 10, 150));
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) {
            return;
        }

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            :root {
                --goi-navy: #0b2443;
                --goi-navy-soft: #18436f;
                --goi-teal: #1493a6;
                --goi-gold: #f4b04e;
                --goi-cream: #fff9f0;
                --goi-card: rgba(255, 255, 255, 0.95);
                --goi-border: rgba(11, 36, 67, 0.14);
                --goi-shadow: 0 16px 34px rgba(11, 36, 67, 0.12);
            }

            html,
            body {
                max-width: 100%;
                overflow-x: hidden !important;
            }

            body.goi-global-theme {
                --primary-color: #0b1f3a;
                --primary-dark: #16355f;
                --secondary-color: #1493a6;
                --secondary-dark: #0f7080;
                --accent-color: #f4b04e;
                --bg-color: #f5f9fd;
                --bg-primary: #ffffff;
                --bg-secondary: #f5f9fd;
                --bg-card: #ffffff;
                --bg-light: #f5f9fd;
                --bg-white: #ffffff;
                --card-bg: #ffffff;
                --text-primary: #0b2443;
                --text-dark: #0b2443;
                --text-secondary: #38516f;
                --text-light: #5f7791;
                --border-color: rgba(11, 36, 67, 0.14);
                --shadow-sm: 0 6px 16px rgba(11, 36, 67, 0.09);
                --shadow-md: 0 12px 28px rgba(11, 36, 67, 0.12);
                --shadow-lg: 0 18px 38px rgba(11, 36, 67, 0.15);

                position: relative;
                background:
                    radial-gradient(circle at 8% 10%, rgba(20, 147, 166, 0.18), transparent 36%),
                    radial-gradient(circle at 92% 8%, rgba(244, 176, 78, 0.2), transparent 36%),
                    linear-gradient(136deg, #f8fbff 0%, #eef4fb 52%, #e5f0fb 100%) !important;
                color: var(--goi-navy);
                min-height: 100vh;
            }

            body.goi-global-theme.goi-page-login,
            body.goi-global-theme.goi-page-signup {
                background:
                    radial-gradient(circle at 0% 0%, rgba(20, 147, 166, 0.18), transparent 42%),
                    radial-gradient(circle at 100% 10%, rgba(244, 176, 78, 0.24), transparent 36%),
                    linear-gradient(138deg, #f9fcff 0%, #edf4fd 48%, #e3edf9 100%) !important;
            }

            body.goi-global-theme *,
            body.goi-global-theme *::before,
            body.goi-global-theme *::after {
                box-sizing: border-box;
            }

            body.goi-global-theme img,
            body.goi-global-theme video,
            body.goi-global-theme canvas,
            body.goi-global-theme svg,
            body.goi-global-theme iframe {
                max-width: 100%;
                height: auto;
            }

            body.goi-global-theme table {
                width: 100%;
            }

            body.goi-global-theme .navbar,
            body.goi-global-theme .top-nav,
            body.goi-global-theme .portal-header,
            body.goi-global-theme .header,
            body.goi-global-theme .app-header,
            body.goi-global-theme .main-header,
            body.goi-global-theme .sidebar-header,
            body.goi-global-theme .dashboard-header,
            body.goi-global-theme .topbar {
                background: linear-gradient(120deg, var(--goi-gold) 0%, #fff8ef 46%, var(--goi-teal) 100%) !important;
                color: var(--goi-navy) !important;
                border-bottom: 1px solid var(--goi-border);
                box-shadow: 0 5px 18px rgba(11, 31, 58, 0.08);
                backdrop-filter: blur(4px);
            }

            body.goi-global-theme .navbar a,
            body.goi-global-theme .top-nav a,
            body.goi-global-theme .logo,
            body.goi-global-theme .logo span,
            body.goi-global-theme h1,
            body.goi-global-theme h2,
            body.goi-global-theme h3,
            body.goi-global-theme h4,
            body.goi-global-theme h5,
            body.goi-global-theme h6 {
                color: var(--goi-navy);
            }

            body.goi-global-theme .main-container,
            body.goi-global-theme .dashboard-container,
            body.goi-global-theme .content,
            body.goi-global-theme .content-area,
            body.goi-global-theme .page-content,
            body.goi-global-theme .container,
            body.goi-global-theme .main-content {
                width: min(100%, 1220px);
                margin-left: auto;
                margin-right: auto;
                border-radius: 18px;
            }

            body.goi-global-theme.goi-page-login .login-container,
            body.goi-global-theme.goi-page-signup .signup-container {
                width: min(1120px, 96vw);
                border-radius: 24px;
                overflow: hidden;
                border: 1px solid rgba(11, 36, 67, 0.16) !important;
                box-shadow: 0 26px 60px rgba(11, 36, 67, 0.18) !important;
                background: rgba(255, 255, 255, 0.95) !important;
            }

            body.goi-global-theme.goi-page-login .login-left,
            body.goi-global-theme.goi-page-signup .signup-left {
                background: linear-gradient(155deg, #0f2f53 0%, #1b4f80 58%, #1f7a9d 100%) !important;
                color: #f3f9ff !important;
                border-right: 1px solid rgba(255, 255, 255, 0.18);
            }

            body.goi-global-theme.goi-page-login .login-left *,
            body.goi-global-theme.goi-page-signup .signup-left * {
                color: #f3f9ff !important;
            }

            body.goi-global-theme.goi-page-login .features-list i,
            body.goi-global-theme.goi-page-signup .features-list i {
                color: #80e6ff !important;
            }

            body.goi-global-theme.goi-page-login .login-right,
            body.goi-global-theme.goi-page-signup .signup-right {
                background: linear-gradient(180deg, #ffffff 0%, #f4f9ff 100%) !important;
            }

            body.goi-global-theme .goi-section-shell,
            body.goi-global-theme .card,
            body.goi-global-theme .feature-card,
            body.goi-global-theme .pricing-card,
            body.goi-global-theme .quick-booking-card,
            body.goi-global-theme .section,
            body.goi-global-theme .wallet-card,
            body.goi-global-theme .modal-content,
            body.goi-global-theme .dashboard-card,
            body.goi-global-theme .panel,
            body.goi-global-theme .table-container,
            body.goi-global-theme .stats-card,
            body.goi-global-theme .widget,
            body.goi-global-theme .list-item,
            body.goi-global-theme .booking-item,
            body.goi-global-theme .offer-card,
            body.goi-global-theme .active-bookings,
            body.goi-global-theme .scheduled-bookings,
            body.goi-global-theme .ride-history,
            body.goi-global-theme .fare-calculator,
            body.goi-global-theme .booking-types,
            body.goi-global-theme .recent-places,
            body.goi-global-theme .favorite-locations,
            body.goi-global-theme .section-header,
            body.goi-global-theme .legal-content {
                background: var(--goi-card);
                border: 1px solid var(--goi-border);
                box-shadow: var(--goi-shadow);
                border-radius: 16px;
            }

            body.goi-global-theme .goi-section-shell {
                position: relative;
                padding: 1.15rem;
                margin-bottom: 1rem;
            }

            body.goi-global-theme .goi-section-shell::before {
                content: '';
                position: absolute;
                left: 12px;
                right: 12px;
                top: 0;
                height: 3px;
                border-radius: 999px;
                background: linear-gradient(90deg, var(--goi-gold), #ffffff, var(--goi-teal));
                opacity: 0.75;
            }

            body.goi-global-theme .hero,
            body.goi-global-theme .cta {
                border-radius: 22px;
                overflow: hidden;
                box-shadow: 0 16px 35px rgba(11, 31, 58, 0.16);
            }

            body.goi-global-theme .btn-primary,
            body.goi-global-theme .btn-login,
            body.goi-global-theme .btn-signup,
            body.goi-global-theme .btn-submit,
            body.goi-global-theme button.primary {
                background: linear-gradient(135deg, var(--goi-navy) 0%, var(--goi-navy-soft) 100%) !important;
                color: #fff !important;
                border-color: var(--goi-navy) !important;
                box-shadow: 0 7px 16px rgba(11, 31, 58, 0.22);
            }

            body.goi-global-theme button *,
            body.goi-global-theme .btn * {
                color: inherit !important;
            }

            body.goi-global-theme .btn-secondary,
            body.goi-global-theme button.secondary {
                background: #ffffff !important;
                color: var(--goi-navy) !important;
                border: 1px solid var(--goi-border) !important;
            }

            body.goi-global-theme input,
            body.goi-global-theme select,
            body.goi-global-theme textarea {
                border: 1px solid rgba(11, 31, 58, 0.18);
                border-radius: 10px;
                background: #ffffff;
                color: var(--goi-navy);
                max-width: 100%;
            }

            body.goi-global-theme input:focus,
            body.goi-global-theme select:focus,
            body.goi-global-theme textarea:focus {
                outline: none;
                border-color: rgba(11, 31, 58, 0.42);
                box-shadow: 0 0 0 3px rgba(11, 31, 58, 0.1);
            }

            .goi-rise-in {
                opacity: 0;
                transform: translateY(8px);
                animation: goi-rise-in 0.45s ease forwards;
            }

            @keyframes goi-rise-in {
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            #${NAV_DOCK_ID} {
                position: fixed;
                right: 14px;
                top: calc(env(safe-area-inset-top, 0px) + 72px);
                z-index: 9998;
                display: inline-flex;
                gap: 0.4rem;
                background: rgba(10, 36, 64, 0.92);
                border-radius: 999px;
                padding: 0.34rem;
                box-shadow: 0 14px 30px rgba(11, 36, 67, 0.3);
                border: 1px solid rgba(255, 255, 255, 0.16);
                backdrop-filter: blur(8px);
                max-width: calc(100vw - 20px);
            }

            #${NAV_DOCK_ID} .goi-dock-btn {
                border: 1px solid rgba(255, 255, 255, 0.14);
                border-radius: 999px;
                background: linear-gradient(135deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02));
                color: #f4fbff !important;
                font-weight: 700;
                font-size: 0.83rem;
                line-height: 1;
                padding: 0.46rem 0.74rem;
                display: inline-flex;
                align-items: center;
                gap: 0.42rem;
                cursor: pointer;
                white-space: nowrap;
            }

            #${NAV_DOCK_ID} .goi-dock-btn:hover {
                background: linear-gradient(135deg, rgba(255, 255, 255, 0.24), rgba(255, 255, 255, 0.08));
                transform: translateY(-1px);
            }

            #${NAV_DOCK_ID} .goi-dock-icon {
                font-size: 0.96rem;
                font-weight: 800;
                color: #f4fbff !important;
            }

            #${NAV_DOCK_ID} .goi-dock-label {
                color: #f4fbff !important;
            }

            @media (max-width: 992px) {
                #${NAV_DOCK_ID} {
                    right: 8px;
                }

                #${NAV_DOCK_ID} .goi-dock-btn {
                    font-size: 0.78rem;
                    padding: 0.38rem 0.62rem;
                }
            }

            @media (max-width: 768px) {
                body.goi-global-theme .main-container,
                body.goi-global-theme .dashboard-container,
                body.goi-global-theme .content,
                body.goi-global-theme .content-area,
                body.goi-global-theme .page-content,
                body.goi-global-theme .container,
                body.goi-global-theme .main-content {
                    width: 100%;
                    border-radius: 12px;
                }

                #${NAV_DOCK_ID} {
                    top: calc(env(safe-area-inset-top, 0px) + 64px);
                }

                #${NAV_DOCK_ID} .goi-dock-label {
                    display: none;
                }

                #${NAV_DOCK_ID} .goi-dock-btn {
                    padding: 0.44rem;
                    min-width: 34px;
                    min-height: 34px;
                    justify-content: center;
                }
            }
        `;

        document.head.appendChild(style);
    }

    function createDockButton(label, iconText, onClick) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'goi-dock-btn';
        button.innerHTML = `<span class="goi-dock-icon" aria-hidden="true">${iconText}</span><span class="goi-dock-label">${label}</span>`;
        button.addEventListener('click', onClick);
        return button;
    }

    function hideLegacyBackHomeOverlays() {
        const candidates = Array.from(document.querySelectorAll('div, nav, section, aside'));

        candidates.forEach((node) => {
            if (!node || node.id === NAV_DOCK_ID) return;
            if (node.getAttribute('data-goi-legacy-nav-hidden') === '1') return;

            const computed = window.getComputedStyle(node);
            if (computed.position !== 'fixed') return;

            const text = String(node.textContent || '').toLowerCase();
            if (!(text.includes('back') && text.includes('home'))) return;

            const rect = node.getBoundingClientRect();
            if (rect.width > 360 || rect.height > 130) return;

            node.setAttribute('data-goi-legacy-nav-hidden', '1');
            node.style.display = 'none';
        });
    }

    function positionNavigationDock(dock) {
        if (!dock) return;
        dock.style.top = `calc(env(safe-area-inset-top, 0px) + ${getDockTopOffset()}px)`;
    }

    function injectNavigationDock() {
        let dock = document.getElementById(NAV_DOCK_ID);
        if (dock) {
            positionNavigationDock(dock);
            return;
        }

        const homePath = resolveHomePath();
        dock = document.createElement('div');
        dock.id = NAV_DOCK_ID;

        const backButton = createDockButton('Back', '&larr;', () => {
            if (window.history.length > 1) {
                window.history.back();
            } else {
                window.location.href = homePath;
            }
        });

        const homeButton = createDockButton('Home', '&#8962;', () => {
            window.location.href = homePath;
        });

        dock.appendChild(backButton);
        dock.appendChild(homeButton);
        document.body.appendChild(dock);

        positionNavigationDock(dock);

        window.addEventListener('resize', () => {
            positionNavigationDock(dock);
        });
    }

    function markActiveTheme() {
        document.body.classList.add('goi-global-theme');
        document.body.classList.add(`goi-page-${resolvePageKind()}`);
    }

    function decorateSections() {
        const selectors = [
            'section',
            '.section',
            '.feature-card',
            '.pricing-card',
            '.quick-booking-card',
            '.wallet-card',
            '.dashboard-card',
            '.panel',
            '.booking-item',
            '.offer-card',
            '.active-bookings',
            '.scheduled-bookings',
            '.ride-history',
            '.fare-calculator',
            '.booking-types',
            '.recent-places',
            '.favorite-locations',
            '.legal-content'
        ];

        const nodes = document.querySelectorAll(selectors.join(','));
        const animationLimit = Math.min(nodes.length, 18);

        nodes.forEach((node, index) => {
            if (
                node.classList.contains('hero') ||
                node.classList.contains('navbar') ||
                node.classList.contains('top-nav')
            ) {
                return;
            }

            node.classList.add('goi-section-shell');

            if (index < animationLimit) {
                node.classList.add('goi-rise-in');
                node.style.animationDelay = `${Math.min(index * 0.03, 0.45)}s`;
            }
        });
    }

    function init() {
        injectStyles();
        markActiveTheme();
        hideLegacyBackHomeOverlays();
        injectNavigationDock();
        decorateSections();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
