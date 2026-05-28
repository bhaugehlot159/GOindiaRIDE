        // ============================================
        // LOCATION FUNCTIONS
        // ============================================

        // Update route highlights when locations change
        function updateRouteHighlights() {
            const pickup = document.getElementById('pickup').value;
            const dropoff = document.getElementById('dropoff').value;
            
            if (pickup && dropoff && typeof showRouteHighlights === 'function') {
                showRouteHighlights(pickup, dropoff, 'routeHighlightsContainer');
            }
        }

        let distanceEstimateToken = 0;

        function updateRoutePreview(statusText = '') {
            const pickup = sanitizeInput(document.getElementById('pickup')?.value || '').trim();
            const dropoff = sanitizeInput(document.getElementById('dropoff')?.value || '').trim();
            const distance = sanitizeInput(document.getElementById('distanceKm')?.textContent || '0');
            const source = sanitizeInput(document.getElementById('distanceSource')?.textContent || '');
            const titleNode = document.getElementById('routePreviewTitle');
            const textNode = document.getElementById('routePreviewText');
            const linkNode = document.getElementById('routePreviewLink');

            if (!titleNode || !textNode || !linkNode) return;

            if (!pickup || !dropoff) {
                titleNode.textContent = 'Live route preview';
                textNode.textContent = 'Enter pickup and dropoff to calculate fare and route.';
                linkNode.style.display = 'none';
                linkNode.removeAttribute('href');
                return;
            }

            const cleanedSource = source && source !== 'Awaiting route' ? ` • ${source}` : '';
            titleNode.textContent = `${pickup} to ${dropoff}`;
            textNode.textContent = statusText || `${distance || '0'} km route ready${cleanedSource}`;
            const origin = getBookingMapQueryValue('pickup') || pickup;
            const destination = getBookingMapQueryValue('dropoff') || dropoff;
            linkNode.href = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
            linkNode.style.display = 'inline-flex';
        }

        async function updateDistanceEstimate() {
            const pickup = sanitizeInput(document.getElementById('pickup').value).trim();
            const dropoff = sanitizeInput(document.getElementById('dropoff').value).trim();
            const pickupQuery = getBookingMapQueryValue('pickup') || pickup;
            const dropoffQuery = getBookingMapQueryValue('dropoff') || dropoff;
            const sourceNode = document.getElementById('distanceSource');

            if (!pickup || !dropoff) {
                document.getElementById('distanceKm').textContent = '0';
                if (sourceNode) sourceNode.textContent = 'Awaiting route';
                updateRoutePreview();
                updateFare();
                return;
            }

            const token = ++distanceEstimateToken;
            let previewStatus = '';
            if (sourceNode) sourceNode.textContent = 'Calculating...';
            updateRoutePreview('Calculating live distance...');

            try {
                if (window.LocationDistanceEstimator && typeof LocationDistanceEstimator.estimateDistanceKm === 'function') {
                    const estimate = await LocationDistanceEstimator.estimateDistanceKm(pickupQuery, dropoffQuery);
                    if (token !== distanceEstimateToken) return;

                    const km = Number(estimate && estimate.km);
                    const finalKm = Number.isFinite(km) && km > 0 ? Math.max(1, Math.round(km)) : 0;
                    document.getElementById('distanceKm').textContent = String(finalKm);

                    if (sourceNode) {
                        const rawSource = String((estimate && estimate.source) || '');
                        sourceNode.textContent = rawSource
                            ? rawSource.replace(/_/g, ' ')
                            : (BOOKING_STRICT_LIVE_MODE ? 'live route unavailable' : 'fallback');
                    }
                } else {
                    document.getElementById('distanceKm').textContent = '0';
                    if (sourceNode) sourceNode.textContent = BOOKING_STRICT_LIVE_MODE ? 'live route unavailable' : 'fallback';
                    if (BOOKING_STRICT_LIVE_MODE) {
                        previewStatus = 'Live route temporarily unavailable. Please refine pickup/drop and try again.';
                    }
                }
            } catch (error) {
                document.getElementById('distanceKm').textContent = '0';
                if (sourceNode) sourceNode.textContent = BOOKING_STRICT_LIVE_MODE ? 'live route unavailable' : 'fallback';
                if (BOOKING_STRICT_LIVE_MODE) {
                    previewStatus = 'Live route temporarily unavailable. Please refine pickup/drop and try again.';
                }
            }

            updateRoutePreview(previewStatus);
            updateFare();
        }

        function handleLocationUpdated() {
            updateRouteHighlights();
            updateDistanceEstimate();
        }

        // Add event listeners for location changes
        document.getElementById('pickup').addEventListener('change', handleLocationUpdated);
        document.getElementById('dropoff').addEventListener('change', handleLocationUpdated);
        document.getElementById('pickup').addEventListener('blur', handleLocationUpdated);
        document.getElementById('dropoff').addEventListener('blur', handleLocationUpdated);
        document.getElementById('pickup').addEventListener('input', handleLocationUpdated);
        document.getElementById('dropoff').addEventListener('input', handleLocationUpdated);

        function swapLocations() {
            const pickup = document.getElementById('pickup').value;
            const dropoff = document.getElementById('dropoff').value;

            document.getElementById('pickup').value = dropoff;
            document.getElementById('dropoff').value = pickup;

            updateFare();
            updateDistanceEstimate();
        }
