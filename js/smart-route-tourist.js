/* ======================================
   GO INDIA RIDE - SMART ROUTE TOURIST INSIGHTS
   Purpose: show district-wise tourist/history insights on live booking forms.
   ====================================== */

(function setupSmartRouteTouristInsights(global) {
    'use strict';

    const STYLE_ID = 'goi-smart-tourist-style';

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .goi-tourist-insights-card {
                margin-top: 1rem;
                border-radius: 14px;
                border: 1px solid #d9e5ff;
                background: linear-gradient(180deg, #ffffff 0%, #f5f9ff 100%);
                box-shadow: 0 10px 25px rgba(10, 35, 80, 0.08);
                padding: 1rem;
            }
            .goi-tourist-insights-head {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 0.75rem;
                margin-bottom: 0.9rem;
            }
            .goi-tourist-insights-title {
                font-size: 1rem;
                font-weight: 700;
                color: #0c2e63;
            }
            .goi-tourist-insights-sub {
                font-size: 0.8rem;
                color: #4c668b;
            }
            .goi-tourist-insights-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
                gap: 0.8rem;
            }
            .goi-tourist-insights-col {
                border: 1px solid #e5ecff;
                border-radius: 10px;
                background: #fff;
                padding: 0.75rem;
            }
            .goi-tourist-insights-col h4 {
                margin: 0 0 0.5rem;
                font-size: 0.9rem;
                color: #123b7a;
            }
            .goi-tourist-insights-col ul {
                margin: 0;
                padding-left: 1rem;
                display: grid;
                gap: 0.35rem;
            }
            .goi-tourist-insights-col li {
                font-size: 0.8rem;
                color: #334e73;
                line-height: 1.35;
            }
        `;
        document.head.appendChild(style);
    }

    function normalizeKey(value) {
        return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    function getRajasthanData() {
        const data = global.locationsData && global.locationsData.rajasthan;
        return (data && typeof data === 'object') ? data : {};
    }

    function buildDistrictLookup() {
        const map = new Map();
        Object.keys(getRajasthanData()).forEach((district) => {
            map.set(normalizeKey(district), district);
        });
        return map;
    }

    function resolveDistrictFromText(inputValue) {
        const raw = String(inputValue || '').trim();
        if (!raw) return '';

        const districtLookup = buildDistrictLookup();
        const firstToken = raw.split(',')[0].trim();
        const normalizedToken = normalizeKey(firstToken);
        const normalizedFull = normalizeKey(raw);

        if (districtLookup.has(normalizedToken)) return districtLookup.get(normalizedToken);
        if (districtLookup.has(normalizedFull)) return districtLookup.get(normalizedFull);

        let bestMatch = '';
        districtLookup.forEach((district, key) => {
            if (bestMatch) return;
            if (normalizedFull.includes(key) || key.includes(normalizedToken)) {
                bestMatch = district;
            }
        });

        return bestMatch;
    }

    function pickTopUnique(values, limit) {
        const cleaned = Array.from(
            new Set(
                (Array.isArray(values) ? values : [])
                    .map((item) => String(item || '').trim())
                    .filter(Boolean)
            )
        );
        return cleaned.slice(0, limit);
    }

    function gatherDistrictHighlights(district) {
        const districtData = getRajasthanData()[district];
        if (!district || !districtData || typeof districtData !== 'object') {
            return null;
        }

        const attractions = pickTopUnique(
            (districtData.tourist_places || []).concat(
                districtData.nearby_tourist_spots || [],
                districtData.museums_heritage || [],
                districtData.lakes_water_bodies || []
            ),
            6
        );

        const history = pickTopUnique(
            (districtData.forts || []).concat(
                districtData.forts_durg || [],
                districtData.palaces_havelis || []
            ),
            4
        );

        const spiritual = pickTopUnique(
            (districtData.temples || []).concat(
                districtData.temples_religious || []
            ),
            4
        );

        const visitInfo = (districtData.visit_info && typeof districtData.visit_info === 'object')
            ? districtData.visit_info
            : {};

        return { district, attractions, history, spiritual, visitInfo };
    }

    function buildDistrictColumn(highlights, icon) {
        if (!highlights) return '';
        const listMarkup = (items) => {
            if (!items || items.length === 0) return '<li>Data being enriched...</li>';
            return items.map((item) => `<li>${item}</li>`).join('');
        };

        const visitNotes = [
            highlights.visitInfo.best_time_to_visit,
            highlights.visitInfo.opening_closing_timings,
            highlights.visitInfo.entry_fee_note
        ].filter(Boolean);
        const visitMarkup = visitNotes.map((line) => `<li>${line}</li>`).join('');

        return `
            <div class="goi-tourist-insights-col">
                <h4>${icon} ${highlights.district}</h4>
                <ul>${listMarkup(highlights.attractions)}</ul>
                <h4 style="margin-top:0.65rem;">🏰 History</h4>
                <ul>${listMarkup(highlights.history)}</ul>
                <h4 style="margin-top:0.65rem;">🛕 Temples</h4>
                <ul>${listMarkup(highlights.spiritual)}</ul>
                <h4 style="margin-top:0.65rem;">🧭 Visitor Notes</h4>
                <ul>${visitMarkup || '<li>Visitor notes will appear here.</li>'}</ul>
            </div>
        `;
    }

    function renderInsightCard(pickupDistrict, dropDistrict) {
        const pickupInfo = gatherDistrictHighlights(pickupDistrict);
        const dropInfo = gatherDistrictHighlights(dropDistrict);
        if (!pickupInfo && !dropInfo) return '';

        const pathLabel = pickupDistrict && dropDistrict
            ? `${pickupDistrict} → ${dropDistrict}`
            : (pickupDistrict || dropDistrict || 'Rajasthan');

        return `
            <section class="goi-tourist-insights-card" data-goi-smart-tourist="1">
                <div class="goi-tourist-insights-head">
                    <div>
                        <div class="goi-tourist-insights-title">Tourist & History Smart Suggestions</div>
                        <div class="goi-tourist-insights-sub">Auto recommendations for route: ${pathLabel}</div>
                    </div>
                    <span class="goi-tourist-insights-sub">Auto-suggestion ready</span>
                </div>
                <div class="goi-tourist-insights-grid">
                    ${buildDistrictColumn(pickupInfo, '📍 Pickup')}
                    ${buildDistrictColumn(dropInfo, '🎯 Drop')}
                </div>
            </section>
        `;
    }

    function removeExistingCard(container) {
        const oldCard = container.querySelector('[data-goi-smart-tourist="1"]');
        if (oldCard) oldCard.remove();
    }

    function getInputValue(id) {
        const node = document.getElementById(id);
        return node ? String(node.value || '').trim() : '';
    }

    function updateMapHint(pickupDistrict, dropDistrict) {
        const mapContainer = document.getElementById('mapContainer');
        if (!mapContainer) return;
        const hint = mapContainer.querySelector('small');
        if (!hint) return;

        if (!pickupDistrict && !dropDistrict) {
            hint.textContent = 'Enter location to see route';
            return;
        }

        hint.textContent = pickupDistrict && dropDistrict
            ? `Local insights active for ${pickupDistrict} to ${dropDistrict}`
            : `Local insights active for ${pickupDistrict || dropDistrict}`;
    }

    function updateRouteInsights() {
        const container = document.getElementById('routeHighlightsContainer');
        if (!container) return;

        const pickup = getInputValue('pickup') || getInputValue('pickupLocation');
        const dropoff = getInputValue('dropoff') || getInputValue('dropLocation');

        const pickupDistrict = resolveDistrictFromText(pickup);
        const dropDistrict = resolveDistrictFromText(dropoff);
        updateMapHint(pickupDistrict, dropDistrict);

        removeExistingCard(container);

        const card = renderInsightCard(pickupDistrict, dropDistrict);
        if (!card) {
            if (!container.innerHTML.trim()) {
                container.style.display = 'none';
            }
            return;
        }

        container.insertAdjacentHTML('beforeend', card);
        container.style.display = 'block';
    }

    let updateTimer = null;
    function scheduleUpdate() {
        if (updateTimer) clearTimeout(updateTimer);
        updateTimer = setTimeout(updateRouteInsights, 180);
    }

    function bindInputListeners() {
        const ids = ['pickup', 'dropoff', 'pickupLocation', 'dropLocation'];
        ids.forEach((id) => {
            const node = document.getElementById(id);
            if (!node || node.dataset.goiSmartTouristBound === '1') return;
            node.dataset.goiSmartTouristBound = '1';
            node.addEventListener('input', scheduleUpdate);
            node.addEventListener('change', scheduleUpdate);
            node.addEventListener('blur', scheduleUpdate);
        });
    }

    function initialize() {
        ensureStyles();
        bindInputListeners();
        scheduleUpdate();
    }

    global.GOIRouteTouristInsights = {
        initialize,
        update: updateRouteInsights,
        resolveDistrictFromText
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

    global.addEventListener('goindiaride:rajasthan-live-ready', scheduleUpdate);
    global.addEventListener('goindiaride:rajasthan-master-ready', scheduleUpdate);
})(typeof window !== 'undefined' ? window : globalThis);
