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
                --goi-green: #138808;
                --goi-saffron: #ff9933;
                --goi-cream: #fff8ef;
                --goi-card: rgba(255, 255, 255, 0.92);
                --goi-border: rgba(11, 31, 58, 0.14);
                --goi-shadow: 0 10px 24px rgba(11, 31, 58, 0.1);
            }

            body.goi-global-theme {
                background: linear-gradient(135deg, #fff3e0 0%, #f9fbff 46%, #ebfff0 100%) !important;
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
                background: linear-gradient(125deg, var(--goi-saffron) 0%, #fff8ef 45%, var(--goi-green) 100%) !important;
                color: var(--goi-navy) !important;
                border-bottom: 1px solid var(--goi-border);
                box-shadow: 0 4px 16px rgba(11, 31, 58, 0.08);
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
            body.goi-global-theme .section,
            body.goi-global-theme .container {
                border-radius: 14px;
            }

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
            body.goi-global-theme .offer-card {
                background: var(--goi-card);
                border: 1px solid var(--goi-border);
                box-shadow: var(--goi-shadow);
                border-radius: 14px;
            }

            body.goi-global-theme .btn-primary,
            body.goi-global-theme .btn-login,
            body.goi-global-theme .btn-signup,
            body.goi-global-theme .btn-submit,
            body.goi-global-theme button.primary {
                background: var(--goi-navy) !important;
                color: #fff !important;
                border-color: var(--goi-navy) !important;
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
                left: 14px;
                bottom: 16px;
                z-index: 9999;
                display: inline-flex;
                gap: 0.45rem;
                background: rgba(11, 31, 58, 0.96);
                border-radius: 999px;
                padding: 0.35rem;
                box-shadow: 0 10px 24px rgba(11, 31, 58, 0.4);
                border: 1px solid rgba(255, 255, 255, 0.12);
            }

            #${NAV_DOCK_ID} .goi-dock-btn {
                border: none;
                border-radius: 999px;
                background: transparent;
                color: #fff;
                font-weight: 700;
                font-size: 0.88rem;
                padding: 0.52rem 0.86rem;
                display: inline-flex;
                align-items: center;
                gap: 0.42rem;
                cursor: pointer;
            }

            #${NAV_DOCK_ID} .goi-dock-btn:hover {
                background: rgba(255, 255, 255, 0.14);
            }

            @media (max-width: 768px) {
                #${NAV_DOCK_ID} {
                    left: 10px;
                    bottom: 10px;
                }

                #${NAV_DOCK_ID} .goi-dock-btn {
                    font-size: 0.8rem;
                    padding: 0.45rem 0.72rem;
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

        const backButton = createDockButton('Back', '←', () => {
            if (window.history.length > 1) {
                window.history.back();
            } else {
                window.location.href = homePath;
            }
        });

        const homeButton = createDockButton('Home', '⌂', () => {
            window.location.href = homePath;
        });

        dock.appendChild(backButton);
        dock.appendChild(homeButton);
        document.body.appendChild(dock);
    }

    function markActiveTheme() {
        document.body.classList.add('goi-global-theme');
    }

    function applyEntranceAnimation() {
        const selectors = [
            '.card',
            '.feature-card',
            '.pricing-card',
            '.quick-booking-card',
            '.section',
            '.wallet-card',
            '.dashboard-card',
            '.panel',
            '.booking-item',
            '.offer-card'
        ];

        const nodes = document.querySelectorAll(selectors.join(','));
        nodes.forEach((node, index) => {
            if (index > 18) {
                return;
            }
            node.classList.add('goi-rise-in');
            node.style.animationDelay = `${Math.min(index * 0.03, 0.45)}s`;
        });
    }

    function init() {
        injectStyles();
        markActiveTheme();
        injectNavigationDock();
        applyEntranceAnimation();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

