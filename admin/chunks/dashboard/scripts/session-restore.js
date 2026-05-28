        (function applyIndiaBranding() {
            const tricolorBrand = '<span class="india-tricolor-text"><span class="tri-saffron">GO</span> <span class="tri-white">India</span> <span class="tri-ashoka">●</span> <span class="tri-green">RIDE</span></span>';

            const logoSelectors = ['.navbar-logo', '.sidebar-logo h2'];
            logoSelectors.forEach((selector) => {
                const node = document.querySelector(selector);
                if (!node || node.dataset.indiaBrandApplied === 'true') return;

                const iconHtml = node.querySelector('i') ? node.querySelector('i').outerHTML + ' ' : '';
                node.innerHTML = `${iconHtml}${tricolorBrand}`;
                node.dataset.indiaBrandApplied = 'true';
            });

            const dashboardTitleCandidates = Array.from(document.querySelectorAll('h1, h2'));
            dashboardTitleCandidates.forEach((heading) => {
                if (!heading || heading.dataset.indiaDashApplied === 'true') return;
                const txt = (heading.textContent || '').trim().toLowerCase();
                if (txt.includes('dashboard')) {
                    heading.classList.add('india-tricolor-dashboard');
                    heading.dataset.indiaDashApplied = 'true';
                }
            });

            ['.navbar', '.topbar', '.header-section'].forEach((selector) => {
                const section = document.querySelector(selector);
                if (section) section.classList.add('india-attract-glow');
            });
        })();
