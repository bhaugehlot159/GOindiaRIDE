// Live homepage booking handoff
        const HOME_BASE_LOCATION_SUGGESTIONS = [
            { label: 'Delhi Airport', detail: 'Airport pickup' },
            { label: 'Jaipur', detail: 'City and outstation' },
            { label: 'Udaipur', detail: 'City, hotel and airport' },
            { label: 'Udaipur Airport', detail: 'Airport transfer' },
            { label: 'Jaipur Railway Station', detail: 'Station pickup' },
            { label: 'Udaipur Railway Station', detail: 'Station pickup' },
            { label: 'Mount Abu', detail: 'Outstation route' },
            { label: 'Agra Taj Mahal', detail: 'Tourist route' },
            { label: 'Jodhpur', detail: 'Intercity route' },
            { label: 'Kota', detail: 'Intercity route' },
            { label: 'Ahmedabad Airport', detail: 'Airport transfer' },
            { label: 'Mumbai Airport', detail: 'Airport transfer' }
        ];
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

        function buildBookingUrl(params = {}) {
            const query = new URLSearchParams();
            Object.entries(params).forEach(([key, value]) => {
                const clean = cleanBookingValue(value);
                if (clean) query.set(key, clean);
            });
            const suffix = query.toString() ? `?${query.toString()}` : '';
            return `./book-cab.html${suffix}#quickBookingForm`;
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
                const swVersion = '20260610-layout-polish2';
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
