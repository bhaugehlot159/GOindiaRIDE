        // ============================================
        // FARE CALCULATION
        // ============================================

        function getFareCalculator() {
            if (window.GoIndiaRideFareCalculator && typeof window.GoIndiaRideFareCalculator.estimateBookingFare === 'function') {
                return window.GoIndiaRideFareCalculator;
            }
            return null;
        }

        function readTravelAssuranceDetails() {
            const readValue = (id, limit = 180) => sanitizeInput(document.getElementById(id)?.value || '', limit).trim();
            const readChecked = (id) => Boolean(document.getElementById(id)?.checked);
            return {
                flightDetails: {
                    flightNumber: readValue('flightNumber', 40).toUpperCase(),
                    airlineName: readValue('airlineName', 120),
                    meetAndGreetName: readValue('meetAndGreetName', 140),
                    useFlightDelayNotes: readChecked('airportFlightTrackingConsent')
                },
                policyPreferences: {
                    waitingBuffer: readValue('waitingBuffer', 60) || 'airport_30',
                    rescheduleWindow: readValue('rescheduleWindow', 80) || 'standard_policy',
                    cancellationPreference: readValue('cancellationPreference', 80) || 'standard_policy',
                    driverCallPreference: readValue('driverCallPreference', 80) || 'call_30_min_before',
                    driverCallBeforeArrival: readChecked('driverCallBeforeArrival'),
                    extraWaitApproval: readChecked('extraWaitApproval')
                },
                billingDetails: {
                    gstInvoiceRequired: readChecked('gstInvoiceRequired'),
                    gstCompanyName: readValue('gstCompanyName', 160),
                    gstNumber: readValue('gstNumber', 40).toUpperCase()
                },
                addOns: {
                    roofCarrierNeeded: readChecked('roofCarrierNeeded'),
                    newVehicleGuarantee: readChecked('newVehicleGuarantee')
                }
            };
        }

        function readFareEstimateInputs() {
            const routeStops = readRouteStops();
            const travelAssurance = readTravelAssuranceDetails();
            const locationPins = buildBookingLocationSnapshot();

            return {
                pickup: sanitizeInput(document.getElementById('pickup').value).trim(),
                drop: sanitizeInput(document.getElementById('dropoff').value).trim(),
                pickupCoordinates: locationPins.pickup.coordinates,
                dropoffCoordinates: locationPins.dropoff.coordinates,
                routeStopLocations: locationPins.stops,
                locationPins,
                rideDate: document.getElementById('rideDate').value,
                rideTime: document.getElementById('rideTime').value,
                returnDate: document.getElementById('returnDate').value,
                returnTime: document.getElementById('returnTime').value,
                isReturnTrip: document.getElementById('isReturnTrip').checked,
                rideType: document.querySelector('input[name="rideType"]:checked')?.value || 'economy',
                vehicleType: document.querySelector('input[name="rideType"]:checked')?.value || 'economy',
                vehicleModel: document.getElementById('vehicleModel').value,
                vehicleFuelPreference: document.getElementById('vehicleFuelPreference')?.value || 'no_preference',
                tripPlan: document.getElementById('tripPlan').value,
                tripServiceType: document.getElementById('tripServiceType').value,
                airportServiceMode: getActiveCabFlow() === 'airport' ? getAirportServiceMode() : '',
                airportServiceLabel: getActiveCabFlow() === 'airport' ? getAirportServiceConfig().label : '',
                airportTerminalNote: getActiveCabFlow() === 'airport'
                    ? sanitizeInput(document.getElementById('cabQuickTerminalInput')?.value || '').trim()
                    : '',
                paymentMethod: document.getElementById('paymentMethod').value,
                passengers: Number.parseInt(document.getElementById('passengers').value, 10) || 1,
                luggage: document.getElementById('luggage').value,
                budgetAmount: Number.parseFloat(document.getElementById('budgetAmount').value || 0) || 0,
                distanceKm: Number.parseFloat(document.getElementById('distanceKm').textContent) || 0,
                distanceSource: sanitizeInput(document.getElementById('distanceSource').textContent || 'fallback'),
                stops: routeStops,
                travelAssurance,
                flightDetails: travelAssurance.flightDetails,
                policyPreferences: travelAssurance.policyPreferences,
                billingDetails: travelAssurance.billingDetails,
                bookingAddOns: travelAssurance.addOns,
                specialRequests: {
                    airCondition: document.getElementById('airCondition').checked,
                    wifi: document.getElementById('wifi').checked,
                    charger: document.getElementById('charger').checked,
                    music: document.getElementById('music').checked
                },
                safetyAccessibility: {
                    womenDriverPref: document.getElementById('womenDriverPref').checked,
                    childSeat: document.getElementById('childSeat').checked,
                    wheelchairAssist: document.getElementById('wheelchairAssist').checked,
                    petFriendly: document.getElementById('petFriendly').checked,
                    liveTripShare: document.getElementById('liveTripShare').checked,
                    maskedCall: document.getElementById('maskedCall').checked
                },
                promoCode: appliedPromo?.code || '',
                notes: sanitizeInput(document.getElementById('notes').value),
                currency: 'INR'
            };
        }

        function routeIsReady(inputs = {}) {
            return Boolean(sanitizeInput(inputs.pickup || '').trim() && sanitizeInput(inputs.drop || inputs.dropoff || '').trim());
        }

        function isLiveDistanceResolved(source) {
            const normalized = String(source || '')
                .toLowerCase()
                .replace(/\s+/g, '_')
                .trim();
            if (!normalized) return false;
            if (normalized === 'awaiting_route' || normalized === 'calculating') return false;
            if (normalized.includes('fallback') || normalized.includes('unavailable') || normalized === 'none') return false;
            return true;
        }

        function renderFareEstimate(estimate = {}) {
            const values = estimate && typeof estimate === 'object' ? estimate : {};
            const hasRoute = routeIsReady(values);
            const setText = (id, text) => {
                const node = document.getElementById(id);
                if (node) node.textContent = text;
            };

            if (Number.isFinite(Number(values.distanceKm))) {
                setText('distanceKm', String(Math.max(0, Math.round(Number(values.distanceKm)))));
            }
            if (values.distanceSource) {
                setText('distanceSource', String(values.distanceSource).replace(/_/g, ' '));
            }

            setText('baseFare', formatCurrency(values.baseFare || 0));
            setText('distanceFare', formatCurrency(values.distanceFare || 0));
            setText('extraDistanceFare', formatCurrency(values.extraDistanceFare || 0));
            setText(
                'distanceBreakdownNote',
                hasRoute
                    ? `Included: ${Number(values.includedDistanceKm || 0)} km • Extra: ${Number(values.extraDistanceKm || 0)} km`
                    : 'Enter pickup and dropoff to calculate live distance.'
            );
            setText('timeFare', formatCurrency(values.timeFare || 0));
            setText('extraTimeFare', formatCurrency(values.extraTimeFare || 0));
            setText(
                'timeBreakdownNote',
                hasRoute
                    ? `Included: ${Number(values.includedDurationMin || 0)} min • Extra: ${Number(values.extraTimeMin || 0)} min`
                    : 'Time and traffic charges appear after route calculation.'
            );
            setText('passengerFare', formatCurrency(values.passengerFare || 0));
            setText('tripPlanFare', formatCurrency(values.tripPlanFare || 0));
            setText('luggageFare', formatCurrency(values.luggageFare || 0));
            setText('extrasFare', formatCurrency(values.extrasFare || 0));
            setText('safetyFare', formatCurrency(values.safetyFare || 0));
            setText('stopFare', formatCurrency(values.stopFare || 0));
            setText('returnTripFare', formatCurrency(values.roundTripCharge || values.returnTripFare || 0));
            setText('tollFare', formatCurrency(values.tollCharge || 0));
            const tollPlazas = Array.isArray(values.tollPlazas) ? values.tollPlazas : [];
            const tollNames = tollPlazas.map((item) => item && item.name).filter(Boolean).slice(0, 4).join(', ');
            const tollSource = String(values.tollSource || '').replace(/_/g, ' ');
            const tollNote = tollPlazas.length
                ? `Mapped toll plazas: ${tollNames}${tollPlazas.length > 4 ? ` +${tollPlazas.length - 4} more` : ''}${values.tollUsedReturnRate ? ' • return rate' : ''}`
                : (hasRoute && tollSource ? `Toll source: ${tollSource}` : 'Toll source: awaiting mapped route');
            setText('tollBreakdownNote', tollNote);
            setText('parkingFare', formatCurrency(values.parkingCharge || 0));
            setText('stateTaxFare', formatCurrency(values.otherStateTax || values.stateTax || 0));
            setText('nightFare', formatCurrency(values.driverNightBatta || values.nightCharge || 0));
            const customerBidAmount = Number(values.customerBidAmount || values.budgetAmount || 0);
            setText('customerBidFare', customerBidAmount > 0 ? formatCurrency(customerBidAmount) : '₹0');
            setText('paymentFee', formatCurrency(values.paymentFee || 0));
            setText('taxesFare', formatCurrency(values.taxesFare || 0));
            setText('promoDiscount', `-${formatCurrency(values.promoDiscount || 0)}`);
            setText('totalFare', formatCurrency(values.totalFare || values.amount || 0));

            latestFareEstimate = values;
            syncCabMiniFare(values);
            updateBookingExperience();
            return Number(values.totalFare || values.amount || 0);
        }

        function createAwaitingFareEstimate(inputs = {}) {
            return {
                ...inputs,
                distanceKm: 0,
                distanceSource: 'Awaiting route',
                baseFare: 0,
                distanceFare: 0,
                includedDistanceKm: 0,
                extraDistanceKm: 0,
                extraDistanceFare: 0,
                includedDurationMin: 0,
                estimatedDurationMin: 0,
                extraTimeMin: 0,
                extraTimeFare: 0,
                timeFare: 0,
                passengerFare: 0,
                tripPlanFare: 0,
                luggageFare: 0,
                extrasFare: 0,
                safetyFare: 0,
                stopFare: 0,
                returnTripFare: 0,
                roundTripCharge: 0,
                tollCharge: 0,
                parkingCharge: 0,
                stateTax: 0,
                otherStateTax: 0,
                nightCharge: 0,
                driverNightBatta: 0,
                paymentFee: 0,
                taxesFare: 0,
                promoDiscount: 0,
                totalFare: 0,
                amount: 0,
                finalFare: 0,
                customerBidAmount: Number(inputs.budgetAmount || 0),
                budgetAmount: Number(inputs.budgetAmount || 0),
                budgetGap: Number(inputs.budgetAmount || 0)
            };
        }

        function buildFallbackFareEstimate(inputs = {}) {
            if (!routeIsReady(inputs)) {
                return createAwaitingFareEstimate(inputs);
            }
            const distance = Math.max(1, Number(inputs.distanceKm || 5));
            const baseFare = 50;
            const includedDistanceKm = Math.min(distance, 5);
            const extraDistanceKm = Math.max(0, distance - includedDistanceKm);
            const distanceFare = Math.round(includedDistanceKm * 10);
            const extraDistanceFare = Math.round(extraDistanceKm * 12);
            const includedDurationMin = 20;
            const estimatedDurationMin = Math.max(includedDurationMin, Math.round(distance * 3));
            const extraTimeMin = Math.max(0, estimatedDurationMin - includedDurationMin);
            const timeFare = Math.round(includedDurationMin * 0.8);
            const extraTimeFare = Math.round(extraTimeMin * 1.1);
            const subtotal = baseFare + distanceFare + extraDistanceFare + timeFare + extraTimeFare;
            const totalFare = Math.max(99, subtotal + Math.round(subtotal * 0.05));
            return {
                ...inputs,
                distanceKm: distance,
                baseFare,
                distanceFare,
                includedDistanceKm,
                extraDistanceKm,
                extraDistanceFare,
                includedDurationMin,
                estimatedDurationMin,
                extraTimeMin,
                extraTimeFare,
                timeFare,
                passengerFare: 0,
                tripPlanFare: 0,
                luggageFare: 0,
                extrasFare: 0,
                safetyFare: 0,
                stopFare: 0,
                returnTripFare: 0,
                roundTripCharge: 0,
                tollCharge: 0,
                parkingCharge: 0,
                stateTax: 0,
                otherStateTax: 0,
                nightCharge: 0,
                driverNightBatta: 0,
                paymentFee: 0,
                taxesFare: Math.round(subtotal * 0.05),
                promoDiscount: 0,
                totalFare,
                amount: totalFare,
                finalFare: totalFare,
                customerBidAmount: Number(inputs.budgetAmount || 0),
                budgetAmount: Number(inputs.budgetAmount || 0),
                budgetGap: Math.round(Number(inputs.budgetAmount || 0) - totalFare),
                distanceSource: inputs.distanceSource || 'fallback'
            };
        }

        function updateFare() {
            const calculator = getFareCalculator();
            const inputs = readFareEstimateInputs();
            if (!routeIsReady(inputs)) {
                return renderFareEstimate(createAwaitingFareEstimate(inputs));
            }
            const estimate = calculator ? calculator.estimateBookingFare(inputs) : buildFallbackFareEstimate(inputs);

            if (appliedPromo) {
                if (estimate.promoDiscount > 0) {
                    setPromoStatus(`Applied ${appliedPromo.code}: Saved ${formatCurrency(estimate.promoDiscount)}`, 'success');
                } else {
                    setPromoStatus(`${appliedPromo.code} is not applicable for the selected trip or payment mode`, 'error');
                }
            }

            return renderFareEstimate(estimate);
        }
