// Live homepage booking handoff
        const HOME_BASE_LOCATION_SUGGESTIONS = [
            { label: 'Delhi Airport', detail: 'Airport pickup' },
            { label: 'Jaipur', detail: 'City and outstation' },
            { label: 'Udaipur', detail: 'City, hotel and airport' },
            { label: 'Udaipur Airport', detail: 'Airport transfer' },
            { label: 'Jaisalmer', detail: 'Outstation route' },
            { label: 'Jaisalmer Railway Station', detail: 'Station pickup' },
            { label: 'Jaipur Railway Station', detail: 'Station pickup' },
            { label: 'Udaipur Railway Station', detail: 'Station pickup' },
            { label: 'Mount Abu', detail: 'Outstation route' },
            { label: 'Agra Taj Mahal', detail: 'Tourist route' },
            { label: 'Jodhpur', detail: 'Intercity route' },
            { label: 'Kota', detail: 'Intercity route' },
            { label: 'Ahmedabad Airport', detail: 'Airport transfer' },
            { label: 'Mumbai Airport', detail: 'Airport transfer' }
        ];
        const HOME_BOOKING_HANDOFF_KEY = 'goindiaride_home_booking_handoff_v2';
        let homeLocationSuggestionsCache = null;

        function cleanBookingValue(value) {
            return String(value || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
        }

        function simplifyHomeLocation(value) {
            return cleanBookingValue(value).toLowerCase().replace(/[^a-z0-9]/g, '');
        }

        function homeCategoryLabel(key) {
            const labels = {
                airports: 'Airport',
                railway_stations: 'Railway station',
                bus_stands: 'Bus stand',
                tourist_places: 'Tourist place',
                forts: 'Fort',
                temples: 'Temple',
                hospitals: 'Hospital',
                markets: 'Market',
                landmarks: 'Landmark'
            };
            return labels[key] || cleanBookingValue(key).replace(/_/g, ' ');
        }

        function addHomeLocationSuggestion(items, seen, label, detail, priority) {
            const cleanLabel = cleanBookingValue(label);
            if (!cleanLabel) return;
            const key = simplifyHomeLocation(cleanLabel);
            if (!key || seen.has(key)) return;
            seen.add(key);
            items.push({
                label: cleanLabel,
                detail: cleanBookingValue(detail) || 'Location',
                priority: Number.isFinite(priority) ? priority : 40
            });
        }

        function buildHomeLocationSuggestions() {
            if (homeLocationSuggestionsCache) return homeLocationSuggestionsCache;

            const items = [];
            const seen = new Set();
            HOME_BASE_LOCATION_SUGGESTIONS.forEach((item, index) => {
                addHomeLocationSuggestion(items, seen, item.label, item.detail, index);
            });

            const data = window.locationsData || {};
            const states = data.states && typeof data.states === 'object' ? data.states : {};
            Object.entries(states).forEach(([state, cities]) => {
                if (!Array.isArray(cities)) return;
                cities.forEach((city) => {
                    addHomeLocationSuggestion(items, seen, city, `${state} city`, state === 'Rajasthan' ? 18 : 60);
                });
            });

            const rajasthan = data.rajasthan && typeof data.rajasthan === 'object' ? data.rajasthan : {};
            Object.entries(rajasthan).forEach(([district, groups]) => {
                addHomeLocationSuggestion(items, seen, district, 'Rajasthan district', 20);
                if (!groups || typeof groups !== 'object') return;
                Object.entries(groups).forEach(([groupKey, values]) => {
                    if (!Array.isArray(values)) return;
                    const label = homeCategoryLabel(groupKey);
                    const priority = groupKey === 'airports' ? 4
                        : groupKey === 'railway_stations' ? 8
                        : groupKey === 'bus_stands' ? 12
                            : groupKey === 'landmarks' ? 24
                                : groupKey === 'tourist_places' ? 28
                                    : 34;

                    values.forEach((place) => {
                        const cleanPlace = cleanBookingValue(place);
                        if (!cleanPlace) return;
                        const hasDistrict = simplifyHomeLocation(cleanPlace).includes(simplifyHomeLocation(district));
                        addHomeLocationSuggestion(
                            items,
                            seen,
                            hasDistrict ? cleanPlace : `${cleanPlace}, ${district}`,
                            `${label} · ${district}`,
                            priority
                        );
                    });
                });
            });

            homeLocationSuggestionsCache = items.sort((a, b) => (
                a.priority - b.priority || a.label.localeCompare(b.label)
            ));
            return homeLocationSuggestionsCache;
        }

        function homeSuggestionScore(item, query, compactQuery) {
            const label = cleanBookingValue(item.label).toLowerCase();
            const detail = cleanBookingValue(item.detail).toLowerCase();
            const compactLabel = simplifyHomeLocation(item.label);
            if (!query) return item.priority;
            if (label.startsWith(query)) return 0;
            if (compactLabel.startsWith(compactQuery)) return 1;
            if (label.includes(query)) return 2;
            if (compactLabel.includes(compactQuery)) return 3;
            if (detail.includes(query)) return 4;
            return 9;
        }

        function getHomeLocationSuggestions(query) {
            const cleanQuery = cleanBookingValue(query).toLowerCase();
            const compactQuery = simplifyHomeLocation(query);
            const suggestions = buildHomeLocationSuggestions();
            if (!cleanQuery) return suggestions;

            return suggestions
                .filter((item) => {
                    const label = cleanBookingValue(item.label).toLowerCase();
                    const detail = cleanBookingValue(item.detail).toLowerCase();
                    const compactLabel = simplifyHomeLocation(item.label);
                    return label.includes(cleanQuery)
                        || compactLabel.includes(compactQuery)
                        || detail.includes(cleanQuery);
                })
                .sort((a, b) => (
                    homeSuggestionScore(a, cleanQuery, compactQuery) - homeSuggestionScore(b, cleanQuery, compactQuery)
                    || a.priority - b.priority
                    || a.label.localeCompare(b.label)
                ));
        }

        function makeHomeHandoffId() {
            return `home_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        }

        function writeHomeBookingHandoff(params = {}) {
            const payload = {};
            Object.entries(params).forEach(([key, value]) => {
                const clean = cleanBookingValue(value);
                if (clean) payload[key] = clean;
            });
            payload.handoffId = payload.handoffId || makeHomeHandoffId();
            payload.createdAt = new Date().toISOString();
            payload.expiresAt = Date.now() + 20 * 60 * 1000;
            try {
                sessionStorage.setItem(HOME_BOOKING_HANDOFF_KEY, JSON.stringify(payload));
                localStorage.setItem(HOME_BOOKING_HANDOFF_KEY, JSON.stringify(payload));
            } catch (_error) {
                // The URL still carries the same fields when storage is unavailable.
            }
            return payload;
        }

        function buildBookingUrl(params = {}) {
            const handoff = writeHomeBookingHandoff(params);
            const query = new URLSearchParams();
            Object.entries(handoff).forEach(([key, value]) => {
                if (key === 'createdAt' || key === 'expiresAt') return;
                const clean = cleanBookingValue(value);
                if (clean) query.set(key, clean);
            });
            const suffix = query.toString() ? `?${query.toString()}` : '';
            return `./book-cab.html${suffix}#quickBookingForm`;
        }

        const HOME_PUBLIC_REVIEW_PATH = '/api/future-runtime-business/reviews?public=1&targetType=ride&limit=3';
        const HOME_PRODUCTION_API_BASE = 'https://goindiaride.onrender.com';
        const HOME_FARE_ROUTE_DISTANCES = [
            ['udaipur', 'udaipurairport', 22],
            ['udaipurcity', 'udaipurairport', 22],
            ['udaipur', 'maharanapratapairport', 22],
            ['udaipur', 'udaipurrailwaystation', 6],
            ['udaipur', 'sirohi', 126],
            ['udaipur', 'sirohibusstand', 126],
            ['jaisalmer', 'jaisalmerrailwaystation', 4],
            ['udaipur', 'jaisalmer', 489],
            ['udaipur', 'jaisalmerrailwaystation', 489],
            ['udaipurcity', 'jaisalmerrailwaystation', 489],
            ['udaipurrailwaystation', 'jaisalmerrailwaystation', 489],
            ['jaipurairport', 'jaipurcity', 13],
            ['jaipurairport', 'jaipur', 13],
            ['delhiairport', 'jaipur', 280],
            ['jaipur', 'agratajmahal', 240],
            ['jaipur', 'agra', 240],
            ['jaipur', 'udaipur', 395],
            ['jaipur', 'jodhpur', 335],
            ['delhi', 'agra', 230]
        ];
        const HOME_FARE_ENDPOINT_DISTANCES = [
            ['udaipur', 'jaisalmer', 489],
            ['jaisalmer', 'udaipur', 490],
            ['udaipur', 'jodhpur', 250],
            ['jodhpur', 'udaipur', 250],
            ['jodhpur', 'jaisalmer', 285],
            ['jaisalmer', 'jodhpur', 285],
            ['udaipur', 'jaipur', 395],
            ['jaipur', 'udaipur', 395],
            ['jaipur', 'jodhpur', 335],
            ['jodhpur', 'jaipur', 335],
            ['jaipur', 'agra', 240],
            ['agra', 'jaipur', 240],
            ['jaipur', 'delhi', 280],
            ['delhi', 'jaipur', 280],
            ['udaipur', 'mountabu', 165],
            ['mountabu', 'udaipur', 165],
            ['udaipur', 'sirohi', 126],
            ['sirohi', 'udaipur', 126],
            ['udaipur', 'ajmer', 265],
            ['ajmer', 'udaipur', 265]
        ];
        const HOME_FARE_ENDPOINT_ALIASES = [
            ['udaipur', ['udaipur', 'udaipurcity', 'citypalaceudaipur', 'udaipurrailwaystation', 'maharanapratapairport', 'udaipurairport']],
            ['jaisalmer', ['jaisalmer', 'jaisalmerrailwaystation', 'jaisalmerairport', 'samdunes', 'samsanddunes']],
            ['jodhpur', ['jodhpur', 'jodhpurjunction', 'jodhpurairport']],
            ['jaipur', ['jaipur', 'jaipurcity', 'jaipurjunction', 'jaipurinternationalairport', 'jaipurairport']],
            ['agra', ['agra', 'agratajmahal', 'tajmahal']],
            ['delhi', ['delhi', 'newdelhi', 'delhiairport', 'indira gandhi airport']],
            ['mountabu', ['mountabu', 'nakki lake']],
            ['sirohi', ['sirohi', 'sirohibusstand']],
            ['ajmer', ['ajmer', 'ajmerjunction', 'ajmersharifdargah', 'pushkar']]
        ];
        const HOME_FARE_SUGGESTION_LIMIT = 5;

        function normalizeHomeApiBase(value) {
            const clean = cleanBookingValue(value).replace(/\/+$/, '');
            return /^https?:\/\//i.test(clean) ? clean : '';
        }

        function pushHomeReviewApiBase(list, value) {
            const clean = normalizeHomeApiBase(value);
            if (clean && !list.includes(clean)) list.push(clean);
        }

        function getHomeReviewApiBases() {
            const bases = [];
            pushHomeReviewApiBase(bases, window.GOINDIARIDE_API_BASE);
            pushHomeReviewApiBase(bases, window.__GOINDIARIDE_API_ORIGIN__);
            pushHomeReviewApiBase(bases, window.__GOINDIARIDE_RUNTIME_API_ORIGIN__);

            const location = window.location || {};
            const host = cleanBookingValue(location.hostname).toLowerCase();
            const sameOrigin = location.origin && location.origin !== 'null' ? location.origin : '';
            if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
                pushHomeReviewApiBase(bases, 'http://127.0.0.1:5000');
            }
            if (host === 'goindiaride.in' || host === 'www.goindiaride.in' || host.endsWith('.github.io')) {
                pushHomeReviewApiBase(bases, HOME_PRODUCTION_API_BASE);
            }
            pushHomeReviewApiBase(bases, sameOrigin);
            pushHomeReviewApiBase(bases, HOME_PRODUCTION_API_BASE);
            return bases;
        }

        function isGenericHomeReviewName(value) {
            const compact = simplifyHomeLocation(value);
            return !compact
                || compact === 'customer'
                || compact === 'guest'
                || compact === 'rider'
                || compact === 'user'
                || compact === 'test'
                || compact === 'demo'
                || compact === 'internationalguest'
                || compact === 'businesstraveler'
                || compact === 'domesticcustomer';
        }

        function formatHomeReviewRating(value) {
            const rating = Number(value);
            if (!Number.isFinite(rating) || rating < 1 || rating > 5) return '';
            return rating.toFixed(1);
        }

        function normalizeHomeReviewItem(item) {
            if (!item || typeof item !== 'object') return null;
            const customerName = cleanBookingValue(item.customerName || item.reviewerName || item.name);
            const city = cleanBookingValue(item.city || item.customerCity || item.location || item.pickupCity);
            const rating = formatHomeReviewRating(item.rating);
            const comment = cleanBookingValue(item.comment || item.review || item.message);
            if (isGenericHomeReviewName(customerName) || !city || !rating) return null;
            return {
                customerName,
                city,
                rating,
                comment
            };
        }

        function renderHomeCustomerReviews(reviews) {
            const section = document.querySelector('[data-home-review-section]');
            const grid = document.querySelector('[data-home-review-grid]');
            if (!section || !grid) return;

            const rows = Array.isArray(reviews) ? reviews.map(normalizeHomeReviewItem).filter(Boolean).slice(0, 3) : [];
            if (!rows.length) {
                grid.replaceChildren();
                section.hidden = true;
                return;
            }

            const cards = rows.map((review) => {
                const article = document.createElement('article');
                article.className = 'home-story-card';

                const rating = document.createElement('div');
                rating.className = 'home-story-rating';
                rating.textContent = `${review.rating}/5`;

                const quote = document.createElement('p');
                quote.textContent = review.comment || `Rated ${review.rating}/5 after a GO India RIDE trip.`;

                const name = document.createElement('strong');
                name.textContent = review.customerName;

                const meta = document.createElement('span');
                meta.className = 'home-story-meta';
                meta.textContent = `${review.city} - ${review.rating}/5`;

                article.append(rating, quote, name, meta);
                return article;
            });

            grid.replaceChildren(...cards);
            section.hidden = false;
        }

        async function fetchHomeReviewsFromBase(apiBase) {
            const controller = window.AbortController ? new AbortController() : null;
            const timeoutId = controller ? window.setTimeout(() => controller.abort(), 6000) : null;
            try {
                const response = await fetch(`${apiBase}${HOME_PUBLIC_REVIEW_PATH}`, {
                    headers: { Accept: 'application/json' },
                    signal: controller ? controller.signal : undefined
                });
                if (!response.ok) throw new Error(`review_api_${response.status}`);
                return response.json();
            } finally {
                if (timeoutId) window.clearTimeout(timeoutId);
            }
        }

        async function loadHomeCustomerReviews() {
            if (typeof window.fetch !== 'function') return;
            const bases = getHomeReviewApiBases();
            for (const apiBase of bases) {
                try {
                    const payload = await fetchHomeReviewsFromBase(apiBase);
                    const items = Array.isArray(payload && payload.items) ? payload.items : [];
                    const reviews = items.map(normalizeHomeReviewItem).filter(Boolean).slice(-3).reverse();
                    renderHomeCustomerReviews(reviews);
                    if (reviews.length) return;
                } catch (_error) {
                    // Try the next live API base without showing unverified fallback reviews.
                }
            }
            renderHomeCustomerReviews([]);
        }

        function formatHomeFareMoney(value) {
            const amount = Math.max(0, Math.round(Number(value) || 0));
            return `₹${amount.toLocaleString('en-IN')}`;
        }

        function getHomeFareRouteKey(value) {
            return simplifyHomeLocation(value);
        }

        function getHomeFareEndpointKey(value) {
            const compact = getHomeFareRouteKey(value);
            if (!compact) return '';
            for (const [endpoint, aliases] of HOME_FARE_ENDPOINT_ALIASES) {
                if (aliases.some((alias) => compact.includes(simplifyHomeLocation(alias)))) {
                    return endpoint;
                }
            }
            return compact;
        }

        function getHomeFareDistance(pickup, drop) {
            const left = getHomeFareRouteKey(pickup);
            const right = getHomeFareRouteKey(drop);
            const match = HOME_FARE_ROUTE_DISTANCES.find(([from, to]) => (
                (from === left && to === right) || (from === right && to === left)
            ));
            if (match) {
                return {
                    distanceKm: match[2],
                    distanceSource: 'home_known_route',
                    enforceTrustedDistance: false
                };
            }

            const endpointLeft = getHomeFareEndpointKey(pickup);
            const endpointRight = getHomeFareEndpointKey(drop);
            const endpointMatch = HOME_FARE_ENDPOINT_DISTANCES.find(([from, to]) => (
                from === endpointLeft && to === endpointRight
            ));
            if (endpointMatch) {
                return {
                    distanceKm: endpointMatch[2],
                    distanceSource: 'home_known_route',
                    enforceTrustedDistance: false
                };
            }

            return {
                distanceKm: 0,
                distanceSource: 'home_coordinate_lookup',
                enforceTrustedDistance: true
            };
        }

        function getHomeFareFallbackDistance(tripPlan) {
            if (tripPlan === 'airport') return 22;
            if (tripPlan === 'outstation') return 160;
            return 12;
        }

        function getHomeFareTripPlan(pickup, drop, distanceKm) {
            const routeText = `${pickup} ${drop}`.toLowerCase();
            if (routeText.includes('airport')) return 'airport';
            if (Number(distanceKm) >= 90) return 'outstation';
            return 'city';
        }

        function getHomeFareServiceType(tripPlan) {
            if (tripPlan === 'airport') return 'airport_transfer';
            if (tripPlan === 'outstation') return 'outstation_one_way';
            return 'local_city';
        }

        function buildHomeFareInput({ pickup, drop, vehicleType, tripPlan, distanceDetails, useFallbackDistance = false }) {
            const distanceKm = useFallbackDistance
                ? getHomeFareFallbackDistance(tripPlan)
                : Number(distanceDetails.distanceKm || 0);
            return {
                pickup,
                drop,
                tripPlan,
                tripServiceType: getHomeFareServiceType(tripPlan),
                vehicleType: vehicleType || 'sedan',
                passengers: 1,
                luggage: 'none',
                paymentMethod: 'cash',
                distanceKm,
                distanceSource: useFallbackDistance ? 'fallback' : distanceDetails.distanceSource,
                enforceTrustedDistance: useFallbackDistance ? false : distanceDetails.enforceTrustedDistance,
                routeData: useFallbackDistance ? null : (distanceDetails.routeData || null)
            };
        }

        function estimateHomeFareWithEngine(input) {
            if (
                window.GoIndiaRideFareCalculator &&
                typeof window.GoIndiaRideFareCalculator.estimateBookingFare === 'function'
            ) {
                return window.GoIndiaRideFareCalculator.estimateBookingFare(input);
            }
            return null;
        }

        function hasUsableHomeFareDistance(fare, distanceDetails) {
            const distanceKm = Number(fare && fare.distanceKm);
            return Number.isFinite(distanceKm)
                && distanceKm > 1
                && (distanceDetails.distanceKm > 0 || fare.distanceTrusted === true || fare.distanceSource === 'route_table');
        }

        function isUsableLiveHomeDistance(estimate) {
            const km = Number(estimate && estimate.km);
            const source = cleanBookingValue(estimate && estimate.source).toLowerCase();
            return Number.isFinite(km)
                && km > 1
                && source
                && source !== 'none'
                && source !== 'fallback'
                && source !== 'district_geo_partial';
        }

        function getLiveHomeFareDistanceDetails(estimate) {
            return {
                distanceKm: Math.max(1, Math.round(Number(estimate && estimate.km) || 0)),
                distanceSource: cleanBookingValue(estimate && estimate.source) || 'live_route',
                enforceTrustedDistance: false
            };
        }

        function isUsableOfficialHomeRouteQuote(quote) {
            const km = Number(quote && quote.distanceKm);
            return Boolean(quote && quote.ok)
                && Number.isFinite(km)
                && km > 1
                && quote.routeData
                && cleanBookingValue(quote.source);
        }

        function getOfficialHomeRouteDistanceDetails(quote) {
            return {
                distanceKm: Math.max(1, Math.round(Number(quote && quote.distanceKm) || 0)),
                distanceSource: 'official_route_planner',
                enforceTrustedDistance: false,
                routeData: quote.routeData
            };
        }

        async function fetchHomeOfficialRouteQuote({ pickup, drop }) {
            if (!window.fetch) return null;
            const controller = window.AbortController ? new AbortController() : null;
            const timeoutId = controller ? window.setTimeout(() => controller.abort(), 9000) : null;
            try {
                const response = await window.fetch('/api/fares/route-quote', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pickup, drop, vehicletype: '35' }),
                    signal: controller ? controller.signal : undefined
                });
                if (!response.ok) return null;
                return await response.json();
            } catch (_error) {
                return null;
            } finally {
                if (timeoutId) window.clearTimeout(timeoutId);
            }
        }

        function estimateHomeFareForDistance({ pickup, drop, vehicleType, distanceDetails }) {
            const probeTripPlan = getHomeFareTripPlan(pickup, drop, distanceDetails.distanceKm);
            let input = buildHomeFareInput({
                pickup,
                drop,
                vehicleType,
                tripPlan: probeTripPlan,
                distanceDetails
            });

            if (window.GoIndiaRideFareCalculator) {
                try {
                    const probeFare = estimateHomeFareWithEngine(input);
                    if (hasUsableHomeFareDistance(probeFare, distanceDetails)) {
                        const tripPlan = getHomeFareTripPlan(pickup, drop, probeFare.distanceKm);
                        if (tripPlan === probeTripPlan) return probeFare;
                        input = buildHomeFareInput({ pickup, drop, vehicleType, tripPlan, distanceDetails });
                        const fare = estimateHomeFareWithEngine(input);
                        if (hasUsableHomeFareDistance(fare, distanceDetails)) return fare;
                    }
                } catch (_error) {
                    // Keep the homepage responsive if the shared fare engine fails to initialize.
                }
            }

            const tripPlan = getHomeFareTripPlan(pickup, drop, distanceDetails.distanceKm);
            input = buildHomeFareInput({
                pickup,
                drop,
                vehicleType,
                tripPlan,
                distanceDetails,
                useFallbackDistance: true
            });
            const perKm = input.vehicleType === 'suv' ? 18 : input.vehicleType === 'sedan' ? 12 : 10;
            const base = tripPlan === 'airport' ? 190 : tripPlan === 'outstation' ? 260 : 99;
            const totalFare = Math.max(99, Math.round(base + input.distanceKm * perKm));
            return {
                ...input,
                totalFare,
                amount: totalFare,
                finalFare: totalFare,
                tollCharge: 0,
                parkingCharge: tripPlan === 'airport' ? 90 : 0,
                taxesFare: Math.round(totalFare * 0.05),
                nightCharge: 0,
                driverNightBatta: 0,
                stateTax: 0,
                calculatedAt: new Date().toISOString()
            };
        }

        function calculateHomeFareEstimate({ pickup, drop, vehicleType }) {
            return estimateHomeFareForDistance({
                pickup,
                drop,
                vehicleType,
                distanceDetails: getHomeFareDistance(pickup, drop)
            });
        }

        async function calculateHomeFareEstimateAsync({ pickup, drop, vehicleType }) {
            try {
                const routeQuote = await fetchHomeOfficialRouteQuote({ pickup, drop });
                if (isUsableOfficialHomeRouteQuote(routeQuote)) {
                    return estimateHomeFareForDistance({
                        pickup,
                        drop,
                        vehicleType,
                        distanceDetails: getOfficialHomeRouteDistanceDetails(routeQuote)
                    });
                }
            } catch (_error) {
                // Local distance estimation remains available when the official route quote is temporarily unavailable.
            }

            const estimator = window.LocationDistanceEstimator;
            if (!estimator || typeof estimator.estimateDistanceKm !== 'function') {
                return calculateHomeFareEstimate({ pickup, drop, vehicleType });
            }

            try {
                const liveEstimate = await estimator.estimateDistanceKm(pickup, drop);
                if (isUsableLiveHomeDistance(liveEstimate)) {
                    return estimateHomeFareForDistance({
                        pickup,
                        drop,
                        vehicleType,
                        distanceDetails: getLiveHomeFareDistanceDetails(liveEstimate)
                    });
                }
            } catch (_error) {
                // Local fare estimate remains visible when live routing is temporarily unavailable.
            }

            return calculateHomeFareEstimate({ pickup, drop, vehicleType });
        }

        function getHomeFareRunningCharge(fare) {
            return Math.round(
                Number(fare.distanceFare || 0)
                + Number(fare.extraDistanceFare || 0)
                + Number(fare.timeFare || 0)
                + Number(fare.extraTimeFare || 0)
            );
        }

        function renderHomeFareBreakdown(container, fare) {
            if (!container) return;
            const distanceKm = Number(fare.distanceKm || 0).toFixed(0);
            const items = [
                ['Distance', `${distanceKm} km`],
                ['Base', formatHomeFareMoney(fare.baseFare || 0)],
                ['Running', formatHomeFareMoney(getHomeFareRunningCharge(fare))],
                ['Toll', formatHomeFareMoney(fare.tollCharge || 0)],
                ['Parking', formatHomeFareMoney(fare.parkingCharge || 0)],
                ['Night bhatta', formatHomeFareMoney(fare.driverNightBatta || fare.nightCharge || 0)],
                ['State tax', formatHomeFareMoney(fare.stateTax || 0)],
                ['GST', formatHomeFareMoney(fare.taxesFare || 0)]
            ];
            if (Number(fare.competitiveDiscount || 0) > 0) {
                items.push(['Fare discount', `-${formatHomeFareMoney(fare.competitiveDiscount)}`]);
            }

            container.replaceChildren(...items.map(([label, value]) => {
                const row = document.createElement('div');
                const term = document.createElement('dt');
                const detail = document.createElement('dd');
                term.textContent = label;
                detail.textContent = value;
                row.append(term, detail);
                return row;
            }));
        }

        function wireHomeFareCalculator() {
            const form = document.getElementById('homeFareCalculatorForm');
            const pickupInput = document.getElementById('homeFarePickupInput');
            const dropInput = document.getElementById('homeFareDropInput');
            const vehicleInput = document.getElementById('homeFareVehicleInput');
            const routeText = document.getElementById('homeFareRouteText');
            const amountText = document.getElementById('homeFareEstimateAmount');
            const metaText = document.getElementById('homeFareMetaText');
            const breakdown = document.getElementById('homeFareBreakdown');
            const bookLink = document.getElementById('homeFareBookLink');
            const suggestionPanel = document.getElementById('homeFareLocationSuggestPanel');
            if (!form || !pickupInput || !dropInput || !vehicleInput || !routeText || !amountText || !metaText || !bookLink) return;
            let homeFareRefreshToken = 0;
            let homeFareLiveTimer = 0;

            function hideHomeFareSuggestions() {
                if (!suggestionPanel) return;
                suggestionPanel.hidden = true;
                suggestionPanel.replaceChildren();
                suggestionPanel.removeAttribute('style');
                [pickupInput, dropInput].forEach((input) => {
                    input.setAttribute('aria-expanded', 'false');
                });
            }

            function fillHomeFareLocation(input, value) {
                if (!input) return;
                input.value = cleanBookingValue(value);
                hideHomeFareSuggestions();
                refreshHomeFareEstimate();
            }

            function renderHomeFareSuggestions(input) {
                if (!suggestionPanel || !input || (input !== pickupInput && input !== dropInput)) return;
                const matches = getHomeLocationSuggestions(input.value).slice(0, HOME_FARE_SUGGESTION_LIMIT);
                if (!matches.length) {
                    hideHomeFareSuggestions();
                    return;
                }

                const target = input === pickupInput ? 'pickup' : 'drop';
                const field = input.closest('.home-fare-field');
                const rows = matches.map((item) => {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.dataset.homeFareSuggestTarget = target;
                    button.dataset.homeFareSuggestValue = item.label;

                    const label = document.createElement('strong');
                    label.textContent = item.label;

                    const detail = document.createElement('small');
                    detail.textContent = item.detail;
                    button.append(label, detail);
                    return button;
                });

                suggestionPanel.replaceChildren(...rows);
                if (field) {
                    suggestionPanel.style.left = `${field.offsetLeft}px`;
                    suggestionPanel.style.top = `${field.offsetTop + field.offsetHeight + 4}px`;
                    suggestionPanel.style.width = `${field.offsetWidth}px`;
                    const fieldRect = field.getBoundingClientRect();
                    const availableBelow = Math.max(150, window.innerHeight - fieldRect.bottom - 18);
                    suggestionPanel.style.maxHeight = `${Math.min(228, availableBelow)}px`;
                }
                suggestionPanel.hidden = false;
                input.setAttribute('aria-expanded', 'true');
            }

            function applyHomeFareEstimate({ pickup, drop, vehicleType, fare }) {
                const total = fare.totalFare || fare.finalFare || fare.amount || 0;
                const distanceKm = Number(fare.distanceKm || 0).toFixed(0);
                const toll = fare.tollCharge || 0;
                const parking = fare.parkingCharge || 0;
                const night = fare.driverNightBatta || fare.nightCharge || 0;
                const tollNote = fare.tollRequiresAdminReview ? ' (admin review)' : '';
                const stateTax = fare.stateTax || 0;
                const stateTaxNote = fare.stateTaxRequiresAdminReview ? ' (official check)' : '';

                routeText.textContent = `${pickup} -> ${drop} =`;
                amountText.textContent = formatHomeFareMoney(total);
                metaText.textContent = `${distanceKm} km | Toll ${formatHomeFareMoney(toll)}${tollNote} | State tax ${formatHomeFareMoney(stateTax)}${stateTaxNote} | Night ${formatHomeFareMoney(night)}`;
                renderHomeFareBreakdown(breakdown, fare);
                bookLink.href = buildBookingUrl({
                    source: 'home_fare_calculator',
                    tripPlan: fare.tripPlan || getHomeFareTripPlan(pickup, drop, fare.distanceKm),
                    serviceMode: fare.tripPlan === 'airport' ? 'airport_pickup' : fare.tripPlan === 'outstation' ? 'outstation_one_way' : 'local_point',
                    pickup,
                    drop,
                    vehicleType,
                    fareEstimate: String(Math.round(Number(total) || 0)),
                    distanceKm: String(fare.distanceKm || ''),
                    tollCharge: String(fare.tollCharge || 0),
                    parkingCharge: String(fare.parkingCharge || 0),
                    nightCharge: String(fare.driverNightBatta || fare.nightCharge || 0),
                    stateTax: String(fare.stateTax || 0),
                    marketDiscount: String(fare.competitiveDiscount || 0)
                });
            }

            function refreshHomeFareEstimate() {
                const pickup = cleanBookingValue(pickupInput.value) || 'Udaipur';
                const drop = cleanBookingValue(dropInput.value) || 'Udaipur Airport';
                const vehicleType = cleanBookingValue(vehicleInput.value) || 'sedan';
                const token = ++homeFareRefreshToken;
                const fare = calculateHomeFareEstimate({ pickup, drop, vehicleType });
                applyHomeFareEstimate({ pickup, drop, vehicleType, fare });

                if (homeFareLiveTimer) window.clearTimeout(homeFareLiveTimer);
                if (window.fetch || (window.LocationDistanceEstimator && typeof window.LocationDistanceEstimator.estimateDistanceKm === 'function')) {
                    metaText.textContent = `${metaText.textContent} | Live km checking...`;
                    homeFareLiveTimer = window.setTimeout(async () => {
                        try {
                            const liveFare = await calculateHomeFareEstimateAsync({ pickup, drop, vehicleType });
                            if (token !== homeFareRefreshToken) return;
                            applyHomeFareEstimate({ pickup, drop, vehicleType, fare: liveFare });
                        } catch (_error) {
                            // Keep the latest local estimate visible.
                        }
                    }, 450);
                }

                return fare;
            }

            form.addEventListener('submit', (event) => {
                event.preventDefault();
                if (!form.reportValidity()) return;
                refreshHomeFareEstimate();
            });

            [pickupInput, dropInput, vehicleInput].forEach((input) => {
                input.addEventListener('change', refreshHomeFareEstimate);
                input.addEventListener('input', refreshHomeFareEstimate);
            });

            [pickupInput, dropInput].forEach((input) => {
                input.addEventListener('focus', () => renderHomeFareSuggestions(input));
                input.addEventListener('input', () => renderHomeFareSuggestions(input));
                input.addEventListener('keydown', (event) => {
                    if (event.key === 'Escape') hideHomeFareSuggestions();
                });
            });

            if (suggestionPanel) {
                suggestionPanel.addEventListener('click', (event) => {
                    const button = event.target.closest('[data-home-fare-suggest-value]');
                    if (!button) return;
                    const targetInput = button.dataset.homeFareSuggestTarget === 'pickup' ? pickupInput : dropInput;
                    fillHomeFareLocation(targetInput, button.dataset.homeFareSuggestValue);
                });
            }

            document.addEventListener('click', (event) => {
                if (!suggestionPanel || suggestionPanel.hidden || form.contains(event.target)) return;
                hideHomeFareSuggestions();
            });

            bookLink.addEventListener('click', () => {
                refreshHomeFareEstimate();
            });

            refreshHomeFareEstimate();
        }

        function goToBooking(params = {}) {
            window.location.href = buildBookingUrl({
                source: 'home_button',
                tripPlan: 'city',
                serviceMode: 'local_point',
                ...params
            });
        }

        window.goToBooking = goToBooking;

        function datasetBookingParams(element) {
            if (!element) return {};
            const data = element.dataset || {};
            return {
                source: data.source || 'home_live_link',
                tripPlan: data.tripPlan || data.homeTripPlan,
                journey: data.journey || data.homeJourney,
                serviceMode: data.serviceMode || data.homeServiceMode,
                vehicleType: data.vehicleType,
                vehicleModel: data.vehicleModel,
                pickup: data.pickup,
                drop: data.drop,
                phone: data.phone,
                notes: data.notes
            };
        }

        function wireHomeQuickBookingForm() {
            const form = document.getElementById('homeQuickBookingForm');
            if (!form) return;

            const tripPlanInput = document.getElementById('homeTripPlanInput');
            const journeyInput = document.getElementById('homeJourneyInput');
            const serviceModeInput = document.getElementById('homeServiceModeInput');
            const pickupInput = document.getElementById('homePickupInput');
            const dropInput = document.getElementById('homeDropInput');
            const status = document.getElementById('homeFormStatus');
            const suggestionPanel = document.getElementById('homeLocationSuggestPanel');
            const currentLocationButton = document.getElementById('homeUseLocationBtn');

            function setHomeStatus(message, tone) {
                if (!status) return;
                status.textContent = message || '';
                status.classList.toggle('is-success', tone === 'success');
                status.classList.toggle('is-error', tone === 'error');
            }

            function hideHomeSuggestions() {
                if (suggestionPanel) {
                    suggestionPanel.hidden = true;
                    suggestionPanel.replaceChildren();
                    suggestionPanel.removeAttribute('style');
                    [pickupInput, dropInput].filter(Boolean).forEach((input) => {
                        input.setAttribute('aria-expanded', 'false');
                    });
                }
            }

            function getBookingLocationValue(input) {
                return cleanBookingValue((input && input.dataset && input.dataset.bookingValue) || (input && input.value));
            }

            function uniqueHomeAddressParts(parts) {
                const seen = new Set();
                return parts
                    .map((part) => cleanBookingValue(part))
                    .filter((part) => {
                        const key = simplifyHomeLocation(part);
                        if (!key || seen.has(key)) return false;
                        seen.add(key);
                        return true;
                    });
            }

            function formatHomeReverseLocation(data) {
                if (!data || typeof data !== 'object') return '';
                const address = data.address && typeof data.address === 'object' ? data.address : {};
                const primary = cleanBookingValue(
                    data.name
                    || address.road
                    || address.neighbourhood
                    || address.suburb
                    || address.village
                    || address.town
                    || address.city
                );
                const parts = uniqueHomeAddressParts([
                    primary,
                    address.neighbourhood || address.suburb || address.village || address.town || address.city,
                    address.city || address.state_district || address.county,
                    address.state,
                    address.postcode
                ]);
                const compact = cleanBookingValue(parts.join(', '));
                if (compact) return compact.slice(0, 180);
                return cleanBookingValue(data.display_name).split(',').slice(0, 5).join(', ').trim().slice(0, 180);
            }

            async function resolveHomeLocationName(lat, lng) {
                if (!window.fetch) return '';
                const controller = window.AbortController ? new AbortController() : null;
                const timeoutId = controller ? window.setTimeout(() => controller.abort(), 7000) : null;
                const url = new URL('https://nominatim.openstreetmap.org/reverse');
                url.searchParams.set('format', 'jsonv2');
                url.searchParams.set('lat', lat);
                url.searchParams.set('lon', lng);
                url.searchParams.set('zoom', '18');
                url.searchParams.set('addressdetails', '1');
                url.searchParams.set('accept-language', 'en');
                url.searchParams.set('email', 'support@goindiaride.in');

                try {
                    const response = await fetch(url.toString(), {
                        headers: { Accept: 'application/json' },
                        signal: controller ? controller.signal : undefined
                    });
                    if (!response.ok) return '';
                    return formatHomeReverseLocation(await response.json());
                } catch (error) {
                    return '';
                } finally {
                    if (timeoutId) window.clearTimeout(timeoutId);
                }
            }

            function fillHomeLocation(input, value, bookingValue) {
                if (!input) return;
                input.value = cleanBookingValue(value);
                const exact = cleanBookingValue(bookingValue);
                input.title = exact || input.value;
                if (exact && exact !== input.value) {
                    input.dataset.bookingValue = exact;
                } else {
                    delete input.dataset.bookingValue;
                }
                hideHomeSuggestions();
                setHomeStatus('');
            }

            function renderHomeSuggestions(input) {
                if (!suggestionPanel || !input || (input !== pickupInput && input !== dropInput)) return;
                const query = cleanBookingValue(input.value).toLowerCase();
                if (input.dataset.bookingValue || query.startsWith('current location (')) {
                    hideHomeSuggestions();
                    return;
                }

                const matches = getHomeLocationSuggestions(query);

                if (!matches.length) {
                    hideHomeSuggestions();
                    return;
                }

                const target = input === pickupInput ? 'pickup' : 'drop';
                const field = input.closest('.home-route-point');
                const rows = matches.map((item) => {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.dataset.homeSuggestTarget = target;
                    button.dataset.homeSuggestValue = item.label;
                    button.textContent = item.label;

                    const detail = document.createElement('small');
                    detail.textContent = item.detail;
                    button.appendChild(detail);
                    return button;
                });

                suggestionPanel.replaceChildren(...rows);
                if (field) {
                    const anchor = input === pickupInput && currentLocationButton ? currentLocationButton : field;
                    suggestionPanel.style.left = `${field.offsetLeft}px`;
                    suggestionPanel.style.top = `${anchor.offsetTop + anchor.offsetHeight + 4}px`;
                    suggestionPanel.style.width = `${field.offsetWidth}px`;
                }
                suggestionPanel.hidden = false;
                input.setAttribute('aria-expanded', 'true');
            }

            [pickupInput, dropInput].filter(Boolean).forEach((input) => {
                input.addEventListener('focus', () => renderHomeSuggestions(input));
                input.addEventListener('input', () => {
                    delete input.dataset.bookingValue;
                    if (input === pickupInput && currentLocationButton) {
                        currentLocationButton.classList.remove('is-success');
                    }
                    renderHomeSuggestions(input);
                });
                input.addEventListener('keydown', (event) => {
                    if (event.key === 'Escape') hideHomeSuggestions();
                });
            });

            if (suggestionPanel) {
                suggestionPanel.addEventListener('click', (event) => {
                    const button = event.target.closest('[data-home-suggest-value]');
                    if (!button) return;
                    const targetInput = button.dataset.homeSuggestTarget === 'pickup' ? pickupInput : dropInput;
                    fillHomeLocation(targetInput, button.dataset.homeSuggestValue);
                });
            }

            form.querySelectorAll('[data-home-suggestion]').forEach((button) => {
                button.addEventListener('click', () => {
                    const targetInput = button.dataset.homeSuggestion === 'pickup' ? pickupInput : dropInput;
                    fillHomeLocation(targetInput, button.dataset.value);
                });
            });

            document.addEventListener('click', (event) => {
                if (!suggestionPanel || suggestionPanel.hidden || form.contains(event.target)) return;
                hideHomeSuggestions();
            });

            if (currentLocationButton && pickupInput) {
                currentLocationButton.addEventListener('click', () => {
                    if (!navigator.geolocation) {
                        setHomeStatus('Current location is not available in this browser. Search pickup manually.', 'error');
                        return;
                    }

                    currentLocationButton.disabled = true;
                    currentLocationButton.classList.add('is-loading');
                    currentLocationButton.classList.remove('is-success');
                    hideHomeSuggestions();
                    setHomeStatus('Detecting GPS location...', '');
                    navigator.geolocation.getCurrentPosition((position) => {
                        const lat = Number(position.coords.latitude || 0).toFixed(5);
                        const lng = Number(position.coords.longitude || 0).toFixed(5);
                        const gpsLabel = `Current location (${lat}, ${lng})`;
                        fillHomeLocation(pickupInput, gpsLabel);
                        currentLocationButton.disabled = false;
                        currentLocationButton.classList.remove('is-loading');
                        currentLocationButton.classList.add('is-success');
                        setHomeStatus(`GPS selected: ${lat}, ${lng}. Finding address name...`, 'success');
                        resolveHomeLocationName(lat, lng).then((addressLabel) => {
                            if (!pickupInput || pickupInput.value !== gpsLabel) return;
                            if (!addressLabel) {
                                setHomeStatus(`GPS selected: ${lat}, ${lng}. Exact pickup will be sent with booking.`, 'success');
                                return;
                            }
                            fillHomeLocation(pickupInput, addressLabel, `${addressLabel} (${lat}, ${lng})`);
                            setHomeStatus(`Pickup selected: ${addressLabel}. GPS: ${lat}, ${lng}.`, 'success');
                        });
                    }, (error) => {
                        currentLocationButton.disabled = false;
                        currentLocationButton.classList.remove('is-loading');
                        const denied = error && error.code === 1;
                        setHomeStatus(denied
                            ? 'Location permission was not allowed. Search pickup manually.'
                            : 'Current location could not be detected. Search pickup manually.', 'error');
                    }, {
                        enableHighAccuracy: true,
                        timeout: 9000,
                        maximumAge: 120000
                    });
                });
            }

            form.querySelectorAll('[data-home-trip-plan]').forEach((button) => {
                button.addEventListener('click', () => {
                    form.querySelectorAll('[data-home-trip-plan]').forEach((item) => {
                        const active = item === button;
                        item.classList.toggle('is-active', active);
                        item.setAttribute('aria-selected', active ? 'true' : 'false');
                    });
                    if (tripPlanInput) tripPlanInput.value = button.dataset.homeTripPlan || 'city';
                    if (journeyInput) journeyInput.value = button.dataset.homeJourney || 'one_way';
                    if (serviceModeInput) serviceModeInput.value = button.dataset.homeServiceMode || 'local_point';
                });
            });

            form.addEventListener('submit', (event) => {
                event.preventDefault();
                if (!form.reportValidity()) return;
                setHomeStatus('');
                const params = {};
                new FormData(form).forEach((value, key) => {
                    params[key] = value;
                });
                params.pickup = getBookingLocationValue(pickupInput);
                params.drop = getBookingLocationValue(dropInput);
                window.location.href = buildBookingUrl(params);
            });
        }

        function wireLiveBookingLinks() {
            document.querySelectorAll('[data-home-booking-link]').forEach((link) => {
                link.addEventListener('click', (event) => {
                    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                    event.preventDefault();
                    window.location.href = buildBookingUrl(datasetBookingParams(link));
                });
            });
        }

        wireHomeQuickBookingForm();
        wireLiveBookingLinks();
        wireHomeFareCalculator();
        loadHomeCustomerReviews();

        // Smooth scrolling
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth' });
                }
            });
        });

        let deferredInstallPrompt = null;
        const installAppBtn = document.getElementById('installAppBtn');
        const isStandaloneMode = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
        const refreshInstallAppButton = () => {
            if (!installAppBtn) return;
            if (isStandaloneMode()) {
                installAppBtn.style.display = 'none';
                return;
            }
            installAppBtn.style.display = 'inline-flex';
            const label = installAppBtn.querySelector('span');
            if (label) {
                label.textContent = deferredInstallPrompt ? 'Install App' : 'Open / Install App';
            }
        };

        window.addEventListener('beforeinstallprompt', (event) => {
            event.preventDefault();
            deferredInstallPrompt = event;
            refreshInstallAppButton();
        });

        if (installAppBtn) {
            installAppBtn.addEventListener('click', async () => {
                if (!deferredInstallPrompt) {
                    alert('Agar address bar me "Open in app" button dikh raha hai to uspar click karein. Warna browser menu se "Install app / Add to Home Screen" use karein.');
                    return;
                }

                deferredInstallPrompt.prompt();
                const choice = await deferredInstallPrompt.userChoice;
                deferredInstallPrompt = null;
                refreshInstallAppButton();
            });
        }

        window.addEventListener('appinstalled', () => {
            deferredInstallPrompt = null;
            refreshInstallAppButton();
        });
        refreshInstallAppButton();

        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                const swVersion = '20260610-handoff-nav1';
                navigator.serviceWorker
                    .register(`./sw.js?v=${swVersion}`)
                    .then((registration) => {
                        registration.update().catch(() => {});
                    })
                    .catch((error) => {
                        console.warn('Service worker registration failed:', error);
                    });
            });
        }

        // Admin entry is visible but always protected by admin login/2FA.
        (function wireAdminEntry() {
            const adminBtn = document.getElementById('adminPortalBtn');
            if (!adminBtn) return;

            try {
                const role = String(localStorage.getItem('userRole') || localStorage.getItem('role') || '').toLowerCase();
                const accountType = String(localStorage.getItem('accountType') || '').toLowerCase();
                const currentAdmin = localStorage.getItem('currentAdmin');
                const isAdmin = role === 'admin' || accountType === 'admin' || Boolean(currentAdmin);

                if (isAdmin) {
                    adminBtn.href = './admin/app.html';
                    adminBtn.title = 'Open Admin App';
                }
            } catch (error) {
                // Keep login gate if storage cannot be read.
            }
        })();

        console.log('✅ Homepage loaded successfully!');
