(function initGlobalUI() {
    'use strict';

    if (typeof document === 'undefined' || typeof window === 'undefined') {
        return;
    }

    const STYLE_ID = 'goi-global-ui-style';
    const NAV_DOCK_ID = 'goi-global-nav-dock';

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

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) {
            return;
        }

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            :root {
                --goi-navy: #0b1f3a;
                --goi-navy-soft: #16355f;
                --goi-green: #138808;
                --goi-saffron: #ff9933;
                --goi-cream: #fff8ef;
                --goi-card: rgba(255, 255, 255, 0.94);
                --goi-border: rgba(11, 31, 58, 0.15);
                --goi-shadow: 0 12px 28px rgba(11, 31, 58, 0.11);
            }

            body.goi-global-theme {
                position: relative;
                background:
                    radial-gradient(circle at 9% 10%, rgba(255, 153, 51, 0.18), transparent 35%),
                    radial-gradient(circle at 92% 12%, rgba(19, 136, 8, 0.16), transparent 36%),
                    linear-gradient(135deg, #fff4e5 0%, #f8fbff 48%, #ecfff1 100%) !important;
                color: var(--goi-navy);
                min-height: 100vh;
            }

            body.goi-global-theme .navbar,
            body.goi-global-theme .top-nav,
            body.goi-global-theme .portal-header,
            body.goi-global-theme .header,
            body.goi-global-theme .app-header,
            body.goi-global-theme .main-header,
            body.goi-global-theme .sidebar-header,
            body.goi-global-theme .dashboard-header {
                background: linear-gradient(120deg, var(--goi-saffron) 0%, #fff8ef 48%, var(--goi-green) 100%) !important;
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
            body.goi-global-theme .container {
                border-radius: 18px;
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
                background: linear-gradient(90deg, var(--goi-saffron), #ffffff, var(--goi-green));
                opacity: 0.75;
            }

            body.goi-global-theme .hero,
            body.goi-global-theme .cta {
                border-radius: 22px;
                overflow: hidden;
                box-shadow: 0 16px 35px rgba(11, 31, 58, 0.16);
            }

            body.goi-global-theme .hero h1,
            body.goi-global-theme .hero p,
            body.goi-global-theme .cta h2,
            body.goi-global-theme .cta p {
                text-shadow: 0 1px 0 rgba(255, 255, 255, 0.16);
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

            body.goi-global-theme .btn-secondary,
            body.goi-global-theme button.secondary {
                background: #ffffff !important;
                color: var(--goi-navy) !important;
                border: 1px solid var(--goi-border) !important;
            }

            body.goi-global-theme .btn-primary:hover,
            body.goi-global-theme .btn-login:hover,
            body.goi-global-theme .btn-signup:hover,
            body.goi-global-theme .btn-submit:hover {
                transform: translateY(-2px);
            }

            body.goi-global-theme input,
            body.goi-global-theme select,
            body.goi-global-theme textarea {
                border: 1px solid rgba(11, 31, 58, 0.18);
                border-radius: 10px;
                background: #ffffff;
                color: var(--goi-navy);
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
                transform: translateY(10px);
                animation: goi-rise-in 0.5s ease forwards;
            }

            @keyframes goi-rise-in {
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            #${NAV_DOCK_ID} {
                position: fixed;
                right: 12px;
                top: calc(env(safe-area-inset-top, 0px) + 10px);
                z-index: 9999;
                display: inline-flex;
                gap: 0.42rem;
                background: rgba(11, 31, 58, 0.96);
                border-radius: 999px;
                padding: 0.3rem;
                box-shadow: 0 10px 24px rgba(11, 31, 58, 0.42);
                border: 1px solid rgba(255, 255, 255, 0.12);
            }

            #${NAV_DOCK_ID} .goi-dock-btn {
                border: none;
                border-radius: 999px;
                background: transparent;
                color: #fff;
                font-weight: 700;
                font-size: 0.84rem;
                padding: 0.46rem 0.75rem;
                display: inline-flex;
                align-items: center;
                gap: 0.35rem;
                cursor: pointer;
            }

            #${NAV_DOCK_ID} .goi-dock-btn:hover {
                background: rgba(255, 255, 255, 0.14);
            }

            @media (max-width: 768px) {
                #${NAV_DOCK_ID} {
                    right: 8px;
                    top: calc(env(safe-area-inset-top, 0px) + 8px);
                }

                #${NAV_DOCK_ID} .goi-dock-btn {
                    font-size: 0.76rem;
                    padding: 0.4rem 0.62rem;
                }
            }
        `;

        document.head.appendChild(style);
    }

    function createDockButton(label, iconText, onClick) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'goi-dock-btn';
        button.innerHTML = `<span aria-hidden="true">${iconText}</span><span>${label}</span>`;
        button.addEventListener('click', onClick);
        return button;
    }

    function injectNavigationDock() {
        if (document.getElementById(NAV_DOCK_ID)) {
            return;
        }

        const homePath = resolveHomePath();
        const dock = document.createElement('div');
        dock.id = NAV_DOCK_ID;

        const backButton = createDockButton('Back', '<<', () => {
            if (window.history.length > 1) {
                window.history.back();
            } else {
                window.location.href = homePath;
            }
        });

        const homeButton = createDockButton('Home', '[]', () => {
            window.location.href = homePath;
        });

        dock.appendChild(backButton);
        dock.appendChild(homeButton);
        document.body.appendChild(dock);
    }

    function markActiveTheme() {
        document.body.classList.add('goi-global-theme');
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
        nodes.forEach((node, index) => {
            if (node.classList.contains('hero') || node.classList.contains('navbar') || node.classList.contains('top-nav')) {
                return;
            }

            node.classList.add('goi-section-shell');

            if (index <= 24) {
                node.classList.add('goi-rise-in');
                node.style.animationDelay = `${Math.min(index * 0.035, 0.55)}s`;
            }
        });
    }

    function init() {
        injectStyles();
        markActiveTheme();
        injectNavigationDock();
        decorateSections();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
