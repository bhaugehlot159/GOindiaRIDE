(function initGlobalUI() {
    'use strict';

    if (typeof document === 'undefined' || typeof window === 'undefined') {
        return;
    }

    const STYLE_ID = 'goi-global-ui-style';
    const BACK_BUTTON_ID = 'goi-global-back-btn';

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
                --goi-card: rgba(255, 255, 255, 0.9);
                --goi-border: rgba(11, 31, 58, 0.14);
            }

            body.goi-global-theme {
                background: linear-gradient(135deg, #fff3e0 0%, #f9fbff 46%, #ebfff0 100%) !important;
                color: var(--goi-navy);
            }

            body.goi-global-theme .navbar,
            body.goi-global-theme .top-nav,
            body.goi-global-theme .portal-header,
            body.goi-global-theme .header,
            body.goi-global-theme .app-header,
            body.goi-global-theme .main-header {
                background: linear-gradient(125deg, var(--goi-saffron) 0%, #fff8ef 45%, var(--goi-green) 100%) !important;
                color: var(--goi-navy) !important;
                border-bottom: 1px solid var(--goi-border);
            }

            body.goi-global-theme .navbar a,
            body.goi-global-theme .top-nav a,
            body.goi-global-theme .logo,
            body.goi-global-theme .logo span,
            body.goi-global-theme h1,
            body.goi-global-theme h2,
            body.goi-global-theme h3,
            body.goi-global-theme h4 {
                color: var(--goi-navy);
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
            body.goi-global-theme .table-container {
                background: var(--goi-card);
                border: 1px solid var(--goi-border);
                box-shadow: 0 6px 20px rgba(11, 31, 58, 0.08);
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

            #${BACK_BUTTON_ID} {
                position: fixed;
                left: 16px;
                bottom: 18px;
                z-index: 9999;
                border: none;
                border-radius: 999px;
                background: var(--goi-navy);
                color: #fff;
                font-weight: 700;
                font-size: 0.92rem;
                padding: 0.62rem 1rem;
                display: inline-flex;
                align-items: center;
                gap: 0.45rem;
                cursor: pointer;
                box-shadow: 0 8px 22px rgba(11, 31, 58, 0.35);
                transition: transform 0.2s ease;
            }

            #${BACK_BUTTON_ID}:hover {
                transform: translateY(-2px);
            }

            @media (max-width: 768px) {
                #${BACK_BUTTON_ID} {
                    left: 10px;
                    bottom: 12px;
                    padding: 0.52rem 0.86rem;
                    font-size: 0.82rem;
                }
            }
        `;

        document.head.appendChild(style);
    }

    function injectBackButton() {
        if (document.getElementById(BACK_BUTTON_ID)) {
            return;
        }

        const button = document.createElement('button');
        button.id = BACK_BUTTON_ID;
        button.type = 'button';
        button.innerHTML = '<span aria-hidden="true">←</span><span>Back</span>';

        button.addEventListener('click', () => {
            const fallback = resolveHomePath();

            if (window.history.length > 1) {
                window.history.back();
            } else {
                window.location.href = fallback;
            }
        });

        document.body.appendChild(button);
    }

    function markActiveTheme() {
        document.body.classList.add('goi-global-theme');
    }

    function init() {
        injectStyles();
        markActiveTheme();
        injectBackButton();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
