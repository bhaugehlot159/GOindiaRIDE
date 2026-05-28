        function handleBookingFormSubmit(e) {
            if (e && typeof e.preventDefault === 'function') {
                e.preventDefault();
            }
            if (e && typeof e.stopPropagation === 'function') {
                e.stopPropagation();
            }

            if (bookingSubmitInProgress) {
                return false;
            }

            bookingSubmitInProgress = true;
            Promise.resolve(bookRide(e))
                .catch((error) => {
                    console.error('Booking submit wrapper failed', error);
                    showError('Booking submit failed. Please try again.');
                })
                .finally(() => {
                    bookingSubmitInProgress = false;
                });

            return false;
        }

        async function bookRide(e) {
            if (e && typeof e.preventDefault === 'function') {
                e.preventDefault();
            }
            if (e && typeof e.stopPropagation === 'function') {
                e.stopPropagation();
            }

            // Sanitize all inputs
            const pickup = sanitizeInput(document.getElementById('pickup').value);
            let dropoff = sanitizeInput(document.getElementById('dropoff').value);
            const rideDate = document.getElementById('rideDate').value;
            const rideTime = document.getElementById('rideTime').value;
            const rideType = document.querySelector('input[name="rideType"]:checked').value;
            const vehicleFuelPreference = document.getElementById('vehicleFuelPreference')?.value || 'no_preference';
            const tripPlan = document.getElementById('tripPlan').value;
            const activeFlow = getActiveCabFlow();
            const paymentMethod = document.getElementById('paymentMethod').value;
            const passengers = parseInt(document.getElementById('passengers').value, 10) || 1;
            const luggage = document.getElementById('luggage').value;
            const promoCodeInput = sanitizeInput(document.getElementById('promoCode').value).trim().toUpperCase();
            const isReturnTrip = document.getElementById('isReturnTrip').checked;
            const returnDate = document.getElementById('returnDate').value;
            const returnTime = document.getElementById('returnTime').value;
            const notes = sanitizeInput(document.getElementById('notes').value);
            const airportTerminalNote = activeFlow === 'airport'
                ? sanitizeInput(document.getElementById('cabQuickTerminalInput')?.value || '').trim()
                : '';
            const intermediateStops = readRouteStops();
            const travelAssurance = readTravelAssuranceDetails();
            if (activeFlow === 'day_trips' && pickup && !dropoff) {
                dropoff = `Day plan within ${pickup}`;
                const dropoffNode = document.getElementById('dropoff');
                if (dropoffNode) dropoffNode.value = dropoff;
            }
            const locationPins = buildBookingLocationSnapshot();

            const specialRequests = {
                airCondition: document.getElementById('airCondition').checked,
                wifi: document.getElementById('wifi').checked,
                charger: document.getElementById('charger').checked,
                music: document.getElementById('music').checked
            };

            const safetyAccessibility = {
                womenDriverPref: document.getElementById('womenDriverPref').checked,
                childSeat: document.getElementById('childSeat').checked,
                wheelchairAssist: document.getElementById('wheelchairAssist').checked,
                petFriendly: document.getElementById('petFriendly').checked,
                liveTripShare: document.getElementById('liveTripShare').checked,
                maskedCall: document.getElementById('maskedCall').checked
            };

            if (!pickup || !dropoff) {
                showError('Please enter both pickup and dropoff locations');
                revealBookingField(!pickup ? 'pickup' : 'dropoff');
                return;
            }

            if (pickup === dropoff && activeFlow !== 'day_trips') {
                showError('Pickup and dropoff cannot be same');
                revealBookingField('dropoff');
                return;
            }

            if (activeFlow === 'airport' && isAirportTerminalDetailRequired() && !airportTerminalNote) {
                showError('Please enter airport terminal, gate, pillar or pickup/drop point');
                const terminalField = document.getElementById('cabQuickTerminalInput');
                if (terminalField) {
                    terminalField.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    window.setTimeout(() => terminalField.focus({ preventScroll: true }), 40);
                }
                return;
            }

            if (
                travelAssurance.billingDetails.gstInvoiceRequired
                && (!travelAssurance.billingDetails.gstCompanyName || !travelAssurance.billingDetails.gstNumber)
            ) {
                showError('GST invoice ke liye company name aur GST number enter karein');
                revealBookingField(!travelAssurance.billingDetails.gstCompanyName ? 'gstCompanyName' : 'gstNumber');
                return;
            }

            const now = new Date();
            const outboundDateTime = buildLocalDateTime(rideDate, rideTime);
            if (!outboundDateTime) {
                showError('Please select valid ride date and time');
                revealBookingField(!rideDate ? 'rideDate' : 'rideTime');
                return;
            }

            if (outboundDateTime.getTime() < now.getTime() - 60 * 1000) {
                showError('Please select a future time for booking');
                revealBookingField('rideTime');
                return;
            }

            let returnDateTime = null;
            if (isReturnTrip) {
                returnDateTime = buildLocalDateTime(returnDate, returnTime);
                if (!returnDateTime) {
                    showError('Please select valid return date and time');
                    revealBookingField(!returnDate ? 'returnDate' : 'returnTime');
                    return;
                }

                if (returnDateTime.getTime() <= outboundDateTime.getTime()) {
                    showError('Return trip time must be after the onward trip');
                    revealBookingField('returnTime');
                    return;
                }
            }

            updateFare();
            const bookingId = 'RID' + Date.now();
            const fareCalculator = getFareCalculator();
            const fareEstimateInputs = readFareEstimateInputs();
            const currentFareEstimate = latestFareEstimate && typeof latestFareEstimate === 'object'
                ? latestFareEstimate
                : (fareCalculator ? fareCalculator.estimateBookingFare(fareEstimateInputs) : buildFallbackFareEstimate(fareEstimateInputs));
            const totalFare = Number(currentFareEstimate.totalFare || currentFareEstimate.amount || parseCurrencyValue(document.getElementById('totalFare').textContent) || 0);
            const distance = Math.max(0, Math.round(Number(currentFareEstimate.distanceKm || parseInt(document.getElementById('distanceKm').textContent, 10) || 0)));
            const distanceSource = sanitizeInput(currentFareEstimate.distanceSource || document.getElementById('distanceSource').textContent || '');
            if (BOOKING_STRICT_LIVE_MODE && (!distance || !isLiveDistanceResolved(distanceSource))) {
                showError('Live route distance unavailable. Please choose valid pickup/drop from suggestions and try again.');
                revealBookingField('dropoff');
                return;
            }
            const bookingPhoneInput = document.getElementById('bookingCustomerPhone');
            const customerPhoneMeta = resolveCurrentCustomerPhoneMeta();
            if (!customerPhoneMeta.localPhone) {
                showError('Booking ke liye customer mobile number compulsory hai. Please enter your mobile number.');
                revealBookingField('bookingCustomerPhone');
                return;
            }
            if (BOOKING_PHONE_OTP_REQUIRED && customerPhoneMeta.hasVerificationMarker && !customerPhoneMeta.verified) {
                showError('Booking ke liye verified mobile number compulsory hai. Please complete OTP verification first.');
                revealBookingField('bookingCustomerPhone');
                setBookingPhoneStatus('Please verify this mobile number with OTP before booking.', 'error');
                return;
            }
            const resolvedBookingPhone = customerPhoneMeta.displayPhone || customerPhoneMeta.localPhone;
            if (bookingPhoneInput) {
                bookingPhoneInput.value = resolvedBookingPhone;
            }
            setBookingPhoneStatus(
                BOOKING_PHONE_OTP_REQUIRED
                    ? `Verified mobile ready: ${resolvedBookingPhone}`
                    : `Contact number ready: ${resolvedBookingPhone}`,
                'success'
            );

            const fareBreakdown = {
                ...currentFareEstimate,
                baseFare: Number(currentFareEstimate.baseFare || parseCurrencyValue(document.getElementById('baseFare').textContent) || 0),
                distanceFare: Number(currentFareEstimate.distanceFare || parseCurrencyValue(document.getElementById('distanceFare').textContent) || 0),
                timeFare: Number(currentFareEstimate.timeFare || parseCurrencyValue(document.getElementById('timeFare').textContent) || 0),
                passengerFare: Number(currentFareEstimate.passengerFare || parseCurrencyValue(document.getElementById('passengerFare').textContent) || 0),
                tripPlanFare: Number(currentFareEstimate.tripPlanFare || parseCurrencyValue(document.getElementById('tripPlanFare').textContent) || 0),
                luggageFare: Number(currentFareEstimate.luggageFare || parseCurrencyValue(document.getElementById('luggageFare').textContent) || 0),
                extrasFare: Number(currentFareEstimate.extrasFare || parseCurrencyValue(document.getElementById('extrasFare').textContent) || 0),
                safetyFare: Number(currentFareEstimate.safetyFare || parseCurrencyValue(document.getElementById('safetyFare').textContent) || 0),
                stopFare: Number(currentFareEstimate.stopFare || parseCurrencyValue(document.getElementById('stopFare').textContent) || 0),
                returnTripFare: Number(currentFareEstimate.returnTripFare || parseCurrencyValue(document.getElementById('returnTripFare').textContent) || 0),
                tollCharge: Number(currentFareEstimate.tollCharge || parseCurrencyValue(document.getElementById('tollFare').textContent) || 0),
                parkingCharge: Number(currentFareEstimate.parkingCharge || parseCurrencyValue(document.getElementById('parkingFare').textContent) || 0),
                stateTax: Number(currentFareEstimate.stateTax || parseCurrencyValue(document.getElementById('stateTaxFare').textContent) || 0),
                nightCharge: Number(currentFareEstimate.nightCharge || parseCurrencyValue(document.getElementById('nightFare').textContent) || 0),
                paymentFee: Number(currentFareEstimate.paymentFee || parseCurrencyValue(document.getElementById('paymentFee').textContent) || 0),
                taxesFare: Number(currentFareEstimate.taxesFare || parseCurrencyValue(document.getElementById('taxesFare').textContent) || 0),
                promoDiscount: Math.abs(Number(currentFareEstimate.promoDiscount || parseCurrencyValue(document.getElementById('promoDiscount').textContent) || 0)),
                customerBidAmount: Number(currentFareEstimate.customerBidAmount || fareEstimateInputs.budgetAmount || 0),
                budgetAmount: Number(currentFareEstimate.budgetAmount || fareEstimateInputs.budgetAmount || 0),
                totalFare: totalFare,
                amount: totalFare,
                finalFare: totalFare
            };

            const paymentMeta = {
                method: paymentMethod,
                status: 'pending',
                mode: ['international_card', 'paypal'].includes(paymentMethod) ? 'international' : 'india',
                currency: 'INR'
            };

            const activePromoCode = appliedPromo?.code || promoCodeInput || null;
            const customerFeatures = {
                specialRequests,
                safetyAccessibility,
                hasStops: intermediateStops.length > 0,
                hasReturnTrip: isReturnTrip,
                airportTerminalNote,
                vehicleFuelPreference,
                locationPins,
                pickupCoordinates: locationPins.pickup.coordinates,
                dropoffCoordinates: locationPins.dropoff.coordinates,
                routeStopLocations: locationPins.stops,
                travelAssurance,
                flightDetails: travelAssurance.flightDetails,
                policyPreferences: travelAssurance.policyPreferences,
                billingDetails: travelAssurance.billingDetails,
                addOns: travelAssurance.addOns
            };

            const booking = {
                id: bookingId,
                bookingId: bookingId,
                customerId: currentUser.id,
                customerName: sanitizeInput(currentUser.fullname || currentUser.name || 'Customer', 140),
                customerEmail: resolveCurrentCustomerEmail(),
                customerPhone: resolvedBookingPhone,
                phoneVerification: {
                    status: BOOKING_PHONE_OTP_REQUIRED ? 'verified' : 'contact_only',
                    source: BOOKING_PHONE_OTP_REQUIRED ? 'customer_otp' : 'customer_required_contact',
                    fallbackReason: ''
                },
                pickup: pickup,
                dropoff: dropoff,
                pickupCoordinates: locationPins.pickup.coordinates,
                dropoffCoordinates: locationPins.dropoff.coordinates,
                pickupGoogleMapsUrl: locationPins.pickup.googleMapsUrl,
                dropoffGoogleMapsUrl: locationPins.dropoff.googleMapsUrl,
                locationPins,
                stops: intermediateStops,
                routeStopLocations: locationPins.stops,
                rideType: rideType,
                vehicleType: rideType,
                vehicleModel: fareEstimateInputs.vehicleModel || '',
                vehicleFuelPreference: fareEstimateInputs.vehicleFuelPreference || vehicleFuelPreference,
                fuelPreference: fareEstimateInputs.vehicleFuelPreference || vehicleFuelPreference,
                passengers: passengers,
                luggage: luggage,
                rideDate: rideDate,
                rideTime: rideTime,
                tripPlan: tripPlan,
                tripServiceType: fareEstimateInputs.tripServiceType || '',
                airportServiceMode: fareEstimateInputs.airportServiceMode || '',
                airportServiceLabel: fareEstimateInputs.airportServiceLabel || '',
                airportTerminalNote: airportTerminalNote || fareEstimateInputs.airportTerminalNote || '',
                travelAssurance,
                flightDetails: travelAssurance.flightDetails,
                policyPreferences: travelAssurance.policyPreferences,
                billingDetails: travelAssurance.billingDetails,
                bookingAddOns: travelAssurance.addOns,
                paymentMethod: paymentMethod,
                budgetAmount: Number(fareEstimateInputs.budgetAmount || 0),
                customerBidAmount: Number(fareEstimateInputs.budgetAmount || 0),
                distance: distance,
                distanceKm: distance,
                distanceSource: distanceSource,
                totalFare: totalFare,
                amount: totalFare,
                status: 'pending',
                notes: notes,
                createdAt: new Date().toISOString(),
                outboundDateTime: outboundDateTime.toISOString(),
                returnTrip: isReturnTrip ? {
                    enabled: true,
                    returnDate: returnDate,
                    returnTime: returnTime,
                    returnDateTime: returnDateTime ? returnDateTime.toISOString() : null
                } : {
                    enabled: false,
                    returnDate: null,
                    returnTime: null,
                    returnDateTime: null
                },
                fareBreakdown: fareBreakdown,
                fareQuote: {
                    amount: totalFare,
                    distanceKm: distance,
                    source: distanceSource,
                    routeCategory: fareBreakdown.routeCategory || ''
                },
                fareHash: fareBreakdown.fareHash || '',
                payment: paymentMeta,
                promo: {
                    code: activePromoCode,
                    discount: fareBreakdown.promoDiscount
                },
                customerFeatures: customerFeatures,
                driverId: null,
                driverName: null,
                driverETA: null,
                statusHistory: [
                    {
                        status: 'pending',
                        at: new Date().toISOString(),
                        source: 'customer'
                    }
                ]
            };

            let token = '';
            const tokenResult = await resolveFreshBookingAccessToken('booking_submit');
            if (tokenResult.ok && tokenResult.token) {
                token = String(tokenResult.token || '').trim();
            }
            if (!token) {
                console.warn('Booking fallback activated: secure token missing or expired.', tokenResult.reason || 'missing_or_expired_access_token');
                await submitBookingThroughAdminReviewFallback(
                    booking,
                    'token_missing_local_queue',
                    {
                        mode: 'local_secure_fallback',
                        clearAccessToken: true,
                        toastMessage: `Booking ${bookingId} submitted for admin review. Live email dispatch is running (token_missing_local_queue).`
                    }
                );
                return;
            }

            try {
                const fareEstimatePayload = {
                    ...fareEstimateInputs,
                    distanceKm: distance,
                    distanceSource,
                    budgetAmount: Number(fareEstimateInputs.budgetAmount || 0),
                    customerBidAmount: Number(fareEstimateInputs.budgetAmount || 0),
                    fareBreakdown,
                    fareQuote: {
                        amount: totalFare,
                        distanceKm: distance,
                        source: distanceSource,
                        routeCategory: fareBreakdown.routeCategory || ''
                    }
                };

                const fareEstimateResult = await fetchJsonAcrossApiBases(
                    '/api/bookings/fare/estimate',
                    {
                        method: 'POST',
                        token,
                        includeJson: true,
                        includeIdempotency: true,
                        idPrefix: 'gir-booking-fare-estimate',
                        body: fareEstimatePayload,
                        timeoutMs: 8000
                    }
                );

                if (!fareEstimateResult.ok) {
                    const estimateReason = formatApiReason(fareEstimateResult.reason, 'secure_fare_estimate_failed');
                    throw new Error(`Secure fare estimate unavailable (${estimateReason})`);
                }

                const fareEstimateData = fareEstimateResult.data || {};
                const secureEstimate = fareEstimateData.estimate && typeof fareEstimateData.estimate === 'object'
                    ? fareEstimateData.estimate
                    : fareEstimateData;
                const secureDistanceKm = Number(secureEstimate.distanceKm || distance);
                const secureAmount = Number(secureEstimate.totalFare || secureEstimate.amount || 0);
                const secureFareHash = sanitizeInput(fareEstimateData.fareHash || secureEstimate.fareHash || '');

                if (!Number.isFinite(secureDistanceKm) || secureDistanceKm <= 0 || !Number.isFinite(secureAmount) || secureAmount <= 0 || !secureFareHash) {
                    throw new Error('Secure fare estimate invalid. Please try again.');
                }

                const createPayload = {
                    cardToken: `tok_${paymentMethod}_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`,
                    distanceKm: secureDistanceKm,
                    amount: secureAmount,
                    fareHash: secureFareHash,
                    customerPhone: customerPhoneMeta.localPhone || '',
                    referralCode: activePromoCode || '',
                    promoCode: activePromoCode || '',
                    pickup,
                    drop: dropoff,
                    pickupCoordinates: locationPins.pickup.coordinates,
                    dropoffCoordinates: locationPins.dropoff.coordinates,
                    pickupGoogleMapsUrl: locationPins.pickup.googleMapsUrl,
                    dropoffGoogleMapsUrl: locationPins.dropoff.googleMapsUrl,
                    locationPins,
                    vehicleType: rideType,
                    vehicleModel: fareEstimateInputs.vehicleModel || '',
                    vehicleFuelPreference: fareEstimateInputs.vehicleFuelPreference || vehicleFuelPreference,
                    fuelPreference: fareEstimateInputs.vehicleFuelPreference || vehicleFuelPreference,
                    paymentMethod,
                    tripPlan,
                    tripServiceType: fareEstimateInputs.tripServiceType || '',
                    passengers,
                    budgetAmount: Number(fareEstimateInputs.budgetAmount || 0),
                    customerBidAmount: Number(fareEstimateInputs.budgetAmount || 0),
                    rideDate,
                    rideTime,
                    returnDate: isReturnTrip ? returnDate : '',
                    returnTime: isReturnTrip ? returnTime : '',
                    luggage,
                    stops: intermediateStops,
                    routeStopLocations: locationPins.stops,
                    travelAssurance,
                    flightDetails: travelAssurance.flightDetails,
                    policyPreferences: travelAssurance.policyPreferences,
                    billingDetails: travelAssurance.billingDetails,
                    bookingAddOns: travelAssurance.addOns,
                    specialRequests,
                    safetyAccessibility,
                    customerFeatures,
                    notes,
                    distanceSource,
                    fareBreakdown: secureEstimate,
                    fareQuote: {
                        amount: secureAmount,
                        distanceKm: secureDistanceKm,
                        source: secureEstimate.distanceSource || distanceSource,
                        routeCategory: secureEstimate.routeCategory || fareBreakdown.routeCategory || ''
                    }
                };

                let createResult = await fetchJsonAcrossApiBases('/api/bookings', {
                    method: 'POST',
                    token,
                    includeJson: true,
                    includeIdempotency: true,
                    idPrefix: 'gir-booking-create',
                    extraHeaders: {
                        'x-booking-client': 'goindiaride-web'
                    },
                    body: createPayload,
                    timeoutMs: 9000
                });

                if (!createResult.ok && isBookingAuthFailureReason(createResult.reason, createResult.status)) {
                    clearBackendAccessTokens();
                    const refreshedCreateToken = await refreshBookingBackendAccessToken('booking_create_auth_retry');
                    if (refreshedCreateToken.ok && refreshedCreateToken.token) {
                        token = String(refreshedCreateToken.token || '').trim();
                        createResult = await fetchJsonAcrossApiBases('/api/bookings', {
                            method: 'POST',
                            token,
                            includeJson: true,
                            includeIdempotency: true,
                            idPrefix: 'gir-booking-create-retry',
                            extraHeaders: {
                                'x-booking-client': 'goindiaride-web'
                            },
                            body: createPayload,
                            timeoutMs: 9000
                        });
                    }
                }

                if (!createResult.ok) {
                    const createReason = formatApiReason(createResult.reason, 'live_booking_create_failed');
                    if (isBookingAuthFailureReason(createReason, createResult.status)) {
                        console.warn('Live booking auth expired; sent to admin review fallback.', createReason);
                        await submitBookingThroughAdminReviewFallback(
                            booking,
                            `auth_expired_admin_queue:${createReason}`,
                            {
                                mode: 'local_secure_fallback',
                                clearAccessToken: true,
                                toastMessage: `Booking ${bookingId} submitted for admin review. Login session expired, so admin approval queue was used.`
                            }
                        );
                        return;
                    }
                    throw new Error(`Live booking create failed (${createReason})`);
                }

                const createData = createResult.data || {};
                const liveBookingId = sanitizeInput(createData.bookingId || bookingId);
                const liveBooking = {
                    ...booking,
                    id: liveBookingId,
                    bookingId: liveBookingId,
                    status: 'pending_admin_review',
                    backendStatus: sanitizeInput(createData.status || 'created'),
                    adminReviewStatus: sanitizeInput(createData.adminReviewStatus || 'pending'),
                    mode: 'live_backend',
                    createdAt: new Date().toISOString()
                };

                queueBookingForAdminReview(
                    liveBooking,
                    'live_backend',
                    sanitizeInput(createData.status || 'created'),
                    `Booking ${liveBookingId} created and sent to admin for live approval`
                );
                const liveQueueResult = await queueBookingRecordForBackendAdminReview(liveBooking, 'live_backend_created');
                if (!liveQueueResult.ok) {
                    console.warn('Live booking admin queue mirror pending:', liveQueueResult.reason || 'queue_failed');
                }
                handleBookingEmailDispatchFeedback({
                    ok: true,
                    bookingId: liveBookingId,
                    adminEmail: createData.adminEmail || null,
                    customerEmail: createData.customerEmail || null
                });
                console.log('✅ Live booking created:', liveBookingId, createData);
            } catch (error) {
                console.error('Live booking failed', error);
                const fallbackMessage = sanitizeInput(error.message || 'live_booking_failed');
                if (isBookingAuthFailureReason(fallbackMessage)) {
                    console.warn('Booking auth failed after submit; using admin review fallback.', fallbackMessage);
                    await submitBookingThroughAdminReviewFallback(
                        booking,
                        `auth_expired_admin_queue:${fallbackMessage}`,
                        {
                            mode: 'local_secure_fallback',
                            clearAccessToken: true,
                            toastMessage: `Booking ${bookingId} submitted for admin review. Login session expired, so admin approval queue was used.`
                        }
                    );
                    return;
                }
                if (BOOKING_STRICT_LIVE_MODE) {
                    showError(error?.message || 'Live booking server unavailable right now. Please retry in a moment.');
                    return;
                }
                await submitBookingThroughAdminReviewFallback(
                    booking,
                    `live_error:${fallbackMessage}`,
                    {
                        mode: 'local_secure_fallback',
                        toastMessage: `Live server unavailable, but booking ${bookingId} saved and sent to admin queue.`
                    }
                );
            }
        }

        function assignDriver(bookingId) {
            // Driver auto-assignment is intentionally paused for now.
            // Keep this block for future activation without deleting logic.
            if (!DRIVER_AUTO_ASSIGN_ENABLED) {
                console.info('Driver auto-assignment is disabled. Booking is waiting for admin review.', bookingId);
                return;
            }

            // Show "Finding driver" animation
            document.getElementById('matchingCard').style.display = 'block';
            document.getElementById('driverDetails').classList.remove('show');
            
            // Try to use database.js auto-assign if available
            if (typeof autoAssignDriver === 'function') {
                const driver = autoAssignDriver(bookingId);
                if (driver) {
                    setTimeout(() => {
                        updateDriverDisplay(driver, bookingId);
                        if (typeof showSuccessToast === 'function') {
                            showSuccessToast(`${driver.name} will be your driver. ETA: 5 minutes`, 'Driver Assigned');
                        }
                    }, 2000);
                    return;
                }
            }
            
            // Fallback to local drivers
            const drivers = JSON.parse(localStorage.getItem('goride_drivers')) || 
                           JSON.parse(localStorage.getItem('drivers')) || [];
            
            if (drivers.length === 0) {
                setTimeout(() => {
                    document.getElementById('matchingCard').style.display = 'none';
                    if (typeof showWarningToast === 'function') {
                        showWarningToast('No drivers available at the moment. Please try again in a few minutes.', 'No Drivers Available');
                    } else {
                        showError('No drivers available');
                    }
                }, 2000);
                return;
            }

            const randomDriver = drivers[Math.floor(Math.random() * drivers.length)];

            setTimeout(() => {
                let bookings = JSON.parse(localStorage.getItem('bookings')) || [];
                const bookingIdx = bookings.findIndex(b => b.id === bookingId);
                
                if (bookingIdx !== -1) {
                    bookings[bookingIdx].driverId = randomDriver.id;
                    bookings[bookingIdx].driverName = randomDriver.name;
                    bookings[bookingIdx].driverRating = randomDriver.rating || 5.0;
                    bookings[bookingIdx].driverPhone = randomDriver.phone;
                    bookings[bookingIdx].vehicleType = randomDriver.vehicle?.type || randomDriver.vehicleType;
                    bookings[bookingIdx].vehicleNumber = randomDriver.vehicle?.number || randomDriver.vehicleNumber;
                    bookings[bookingIdx].driverETA = (Math.floor(Math.random() * 5) + 2) + ' mins';
                    bookings[bookingIdx].status = 'confirmed';
                    bookings[bookingIdx].statusHistory = bookings[bookingIdx].statusHistory || [];
                    bookings[bookingIdx].statusHistory.push({
                        status: 'confirmed',
                        at: new Date().toISOString(),
                        source: 'driver',
                        driverId: randomDriver.id
                    });
                    
                    persistBookingStore(bookings);

                    const assignedBooking = bookings[bookingIdx];
                    broadcastPortalNotification({
                        type: 'driver_assigned',
                        title: 'Driver Assigned',
                        message: `Driver ${randomDriver.name} assigned to booking ${assignedBooking.id}`,
                        booking: assignedBooking,
                        sourcePortal: 'driver',
                        metadata: {
                            stage: 'driver_assigned',
                            bookingId: assignedBooking.id,
                            driverId: randomDriver.id
                        }
                    });

                    updateDriverDisplay(randomDriver, bookingId);
                    
                    if (typeof showSuccessToast === 'function') {
                        showSuccessToast(`${randomDriver.name} will be your driver. ETA: ${bookings[bookingIdx].driverETA}`, 'Driver Assigned');
                    }
                }
            }, 2000);
        }
        
        function updateDriverDisplay(driver, bookingId) {
            const bookings = JSON.parse(localStorage.getItem('bookings')) || [];
            const booking = bookings.find(b => b.id === bookingId);
            
            document.getElementById('driverName').textContent = driver.name;
            document.getElementById('driverRating').textContent = `⭐⭐⭐⭐⭐ ${driver.rating || 5.0}`;
            document.getElementById('vehicleType').textContent = driver.vehicle?.model || driver.vehicleType || 'Car';
            document.getElementById('vehicleNumber').textContent = driver.vehicle?.number || driver.vehicleNumber || 'Pending';
            document.getElementById('driverETA').textContent = booking?.driverETA || 'Pending';

            const initials = driver.name.split(' ').map(n => n[0]).join('').toUpperCase();
            document.getElementById('driverAvatar').textContent = initials;
            document.getElementById('driverDetails').classList.add('show');
        }

        // 🎯 Complete ride and show donation
        function completeRideAndShowDonation(bookingId) {
            let bookings = JSON.parse(localStorage.getItem('bookings')) || [];
            const idx = bookings.findIndex(b => b.id === bookingId);
            
            if (idx !== -1) {
                bookings[idx].status = 'completed';
                bookings[idx].duration = Math.floor(Math.random() * 30) + 10 + ' mins';
                bookings[idx].statusHistory = bookings[idx].statusHistory || [];
                bookings[idx].statusHistory.push({
                    status: 'completed',
                    at: new Date().toISOString(),
                    source: 'driver'
                });
                persistBookingStore(bookings);

                const completedBooking = bookings[idx];
                broadcastPortalNotification({
                    type: 'ride_completed',
                    title: 'Ride Completed',
                    message: `Ride ${completedBooking.id} completed successfully`,
                    booking: completedBooking,
                    sourcePortal: 'driver',
                    metadata: {
                        stage: 'ride_completed',
                        bookingId: completedBooking.id
                    }
                });

                setTimeout(() => {
                    document.getElementById('successModal').classList.remove('active');
                    currentRideForDonation = bookingId;
                    selectedDonationAmount = 50;
                    document.getElementById('donationModal').classList.add('active');
                }, 1000);
            }
        }
