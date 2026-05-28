        function buildAdminReviewQueuePayload(bookingRecord, reason = 'customer_booking_submit') {
            const bookingId = sanitizeInput(bookingRecord.id || bookingRecord.bookingId || '', 120);
            if (!bookingId) return null;

            const customerPhoneMeta = resolveCurrentCustomerPhoneMeta();
            const resolvedCustomerPhone = sanitizeInput(
                bookingRecord.customerPhone || customerPhoneMeta.displayPhone || customerPhoneMeta.localPhone || '',
                40
            );
            const pickupValue = sanitizeInput(bookingRecord.pickup || bookingRecord.pickupLocation || '', 180);
            const dropValue = sanitizeInput(bookingRecord.dropoff || bookingRecord.drop || bookingRecord.dropLocation || '', 180);

            return {
                ...bookingRecord,
                id: bookingId,
                bookingId,
                customerId: sanitizeInput(bookingRecord.customerId || (currentUser && currentUser.id) || '', 120),
                customerName: sanitizeInput(bookingRecord.customerName || (currentUser && (currentUser.fullname || currentUser.name)) || 'Customer', 140),
                customerEmail: sanitizeInput(bookingRecord.customerEmail || resolveCurrentCustomerEmail() || '', 180),
                customerPhone: resolvedCustomerPhone,
                pickup: pickupValue,
                pickupLocation: pickupValue,
                pickupCoordinates: bookingRecord.pickupCoordinates || bookingRecord.locationPins?.pickup?.coordinates || bookingRecord.customerFeatures?.pickupCoordinates || null,
                pickupGoogleMapsUrl: sanitizeInput(bookingRecord.pickupGoogleMapsUrl || bookingRecord.locationPins?.pickup?.googleMapsUrl || '', 240),
                dropoff: dropValue,
                drop: dropValue,
                dropLocation: dropValue,
                dropoffCoordinates: bookingRecord.dropoffCoordinates || bookingRecord.locationPins?.dropoff?.coordinates || bookingRecord.customerFeatures?.dropoffCoordinates || null,
                dropoffGoogleMapsUrl: sanitizeInput(bookingRecord.dropoffGoogleMapsUrl || bookingRecord.locationPins?.dropoff?.googleMapsUrl || '', 240),
                locationPins: bookingRecord.locationPins || bookingRecord.customerFeatures?.locationPins || {},
                routeStopLocations: Array.isArray(bookingRecord.routeStopLocations) ? bookingRecord.routeStopLocations : (bookingRecord.locationPins?.stops || []),
                amount: Number(bookingRecord.amount || bookingRecord.totalFare || bookingRecord.fare || 0),
                totalFare: Number(bookingRecord.totalFare || bookingRecord.amount || bookingRecord.fare || 0),
                sourceKey: 'customer_booking_submit',
                mode: sanitizeInput(bookingRecord.mode || reason || 'customer_booking_submit', 80),
                backendStatus: sanitizeInput(reason || bookingRecord.backendStatus || 'customer_booking_submit', 120),
                adminReviewStatus: sanitizeInput(bookingRecord.adminReviewStatus || 'pending', 40) || 'pending',
                status: sanitizeInput(bookingRecord.status || 'pending_admin_review', 40) || 'pending_admin_review'
            };
        }

        async function queueBookingRecordForBackendAdminReview(bookingRecord, reason = 'customer_booking_submit') {
            const payloadBooking = buildAdminReviewQueuePayload(bookingRecord, reason);
            if (!payloadBooking) {
                return { ok: false, reason: 'missing_booking_record' };
            }

            const bookingId = payloadBooking.bookingId;
            updateBookingDeliveryState(bookingId, {
                adminQueueSyncStatus: 'sending',
                adminQueueSyncReason: sanitizeInput(reason || 'customer_booking_submit', 120),
                adminQueueSyncUpdatedAt: new Date().toISOString()
            });

            const result = await fetchJsonAcrossApiBases('/api/bookings/fallback/admin-review-queue', {
                method: 'POST',
                token: '',
                includeJson: true,
                includeIdempotency: true,
                idPrefix: 'gir-booking-admin-review-queue',
                idempotencyKey: createAdminReviewQueueIdempotencyKey(bookingId),
                extraHeaders: {
                    'x-booking-client': 'goindiaride-web'
                },
                body: {
                    source: 'customer_booking_submit',
                    reason: sanitizeInput(reason || 'customer_booking_submit', 120),
                    bookings: [payloadBooking]
                },
                timeoutMs: 12000
            });

            const data = result.data || {};
            const queuedItem = Array.isArray(data.items)
                ? data.items.find((item) => sanitizeInput(item.bookingId || item.id || '', 120) === bookingId)
                : null;

            if (result.ok && data.ok !== false) {
                const queueState = sanitizeInput(queuedItem?.state || (data.queued ? 'queued' : data.existing ? 'existing' : 'queued'), 80);
                updateBookingDeliveryState(bookingId, {
                    adminQueueSyncStatus: queueState,
                    adminQueueSyncedAt: new Date().toISOString(),
                    backendStatus: `admin_review_queue_${queueState}`
                });
                broadcastAdminReviewQueueSync(bookingId, {
                    apiBase: result.apiBase,
                    state: queueState,
                    reason
                });
                return { ok: true, bookingId, apiBase: result.apiBase, data };
            }

            const reasonText = sanitizeInput(result.reason || data.message || 'admin_review_queue_failed', 160);
            updateBookingDeliveryState(bookingId, {
                adminQueueSyncStatus: 'pending',
                adminQueueSyncReason: reasonText,
                adminQueueSyncUpdatedAt: new Date().toISOString()
            });
            return { ok: false, bookingId, reason: reasonText, attempts: result.attempts || [] };
        }

        async function sendAdminEmailForQueuedBooking(bookingRecord, reason = 'local_fallback') {
            if (!bookingRecord || typeof bookingRecord !== 'object') {
                return { ok: false, reason: 'missing_booking_record' };
            }

            const bookingId = sanitizeInput(bookingRecord.id || bookingRecord.bookingId || '');
            if (!bookingId) {
                return { ok: false, reason: 'missing_booking_id' };
            }

            const token = String(getBackendAccessToken() || '').trim();
            const apiBases = getBackendApiBaseCandidates();
            if (!apiBases.length) {
                return {
                    ok: false,
                    reason: 'no_available_api_base_candidates',
                    status: 0,
                    attempts: []
                };
            }
            const customerPhoneMeta = resolveCurrentCustomerPhoneMeta();
            const resolvedCustomerPhone = sanitizeInput(
                bookingRecord.customerPhone || customerPhoneMeta.displayPhone || customerPhoneMeta.localPhone || '',
                40
            );
            const payload = {
                bookingId,
                customerId: sanitizeInput(bookingRecord.customerId || ''),
                customerName: sanitizeInput(bookingRecord.customerName || ''),
                customerEmail: sanitizeInput(bookingRecord.customerEmail || (currentUser && currentUser.email) || ''),
                customerPhone: resolvedCustomerPhone,
                pickup: sanitizeInput(bookingRecord.pickup || ''),
                drop: sanitizeInput(bookingRecord.dropoff || bookingRecord.drop || ''),
                pickupCoordinates: bookingRecord.pickupCoordinates || bookingRecord.locationPins?.pickup?.coordinates || bookingRecord.customerFeatures?.pickupCoordinates || null,
                dropoffCoordinates: bookingRecord.dropoffCoordinates || bookingRecord.locationPins?.dropoff?.coordinates || bookingRecord.customerFeatures?.dropoffCoordinates || null,
                pickupGoogleMapsUrl: sanitizeInput(bookingRecord.pickupGoogleMapsUrl || bookingRecord.locationPins?.pickup?.googleMapsUrl || '', 240),
                dropoffGoogleMapsUrl: sanitizeInput(bookingRecord.dropoffGoogleMapsUrl || bookingRecord.locationPins?.dropoff?.googleMapsUrl || '', 240),
                locationPins: bookingRecord.locationPins || bookingRecord.customerFeatures?.locationPins || {},
                rideDate: sanitizeInput(bookingRecord.rideDate || ''),
                rideTime: sanitizeInput(bookingRecord.rideTime || ''),
                returnDate: sanitizeInput(bookingRecord.returnTrip?.returnDate || ''),
                returnTime: sanitizeInput(bookingRecord.returnTrip?.returnTime || ''),
                tripPlan: sanitizeInput(bookingRecord.tripPlan || ''),
                tripServiceType: sanitizeInput(bookingRecord.tripServiceType || bookingRecord.serviceType || ''),
                airportTerminalNote: sanitizeInput(bookingRecord.airportTerminalNote || ''),
                travelAssurance: bookingRecord.travelAssurance || bookingRecord.customerFeatures?.travelAssurance || {},
                flightDetails: bookingRecord.flightDetails || bookingRecord.customerFeatures?.flightDetails || {},
                policyPreferences: bookingRecord.policyPreferences || bookingRecord.customerFeatures?.policyPreferences || {},
                billingDetails: bookingRecord.billingDetails || bookingRecord.customerFeatures?.billingDetails || {},
                bookingAddOns: bookingRecord.bookingAddOns || bookingRecord.customerFeatures?.addOns || {},
                paymentMethod: sanitizeInput(bookingRecord.paymentMethod || ''),
                vehicleType: sanitizeInput(bookingRecord.vehicleType || bookingRecord.rideType || ''),
                vehicleModel: sanitizeInput(bookingRecord.vehicleModel || ''),
                vehicleFuelPreference: sanitizeInput(bookingRecord.vehicleFuelPreference || bookingRecord.fuelPreference || ''),
                passengers: Number(bookingRecord.passengers || 1),
                luggage: sanitizeInput(bookingRecord.luggage || ''),
                notes: sanitizeInput(bookingRecord.notes || ''),
                stops: Array.isArray(bookingRecord.stops) ? bookingRecord.stops : [],
                routeStopLocations: Array.isArray(bookingRecord.routeStopLocations) ? bookingRecord.routeStopLocations : (bookingRecord.locationPins?.stops || []),
                specialRequests: bookingRecord.customerFeatures?.specialRequests || {},
                safetyAccessibility: bookingRecord.customerFeatures?.safetyAccessibility || {},
                distanceKm: Number(bookingRecord.distanceKm || bookingRecord.distance || 0),
                distanceSource: sanitizeInput(bookingRecord.distanceSource || ''),
                budgetAmount: Number(bookingRecord.budgetAmount || 0),
                customerBidAmount: Number(bookingRecord.customerBidAmount || 0),
                amount: Number(bookingRecord.totalFare || bookingRecord.amount || 0),
                fareBreakdown: bookingRecord.fareBreakdown || {},
                fareQuote: bookingRecord.fareQuote || {},
                fareHash: sanitizeInput(bookingRecord.fareHash || ''),
                promoCode: sanitizeInput(bookingRecord.promo?.code || bookingRecord.referralCode || ''),
                currency: 'INR',
                fallbackReason: sanitizeInput(reason || 'local_fallback')
            };

            localStorage.setItem(LAST_ADMIN_EMAIL_DISPATCH_KEY, JSON.stringify({
                bookingId,
                state: 'started',
                reason: sanitizeInput(reason || 'local_fallback', 120),
                updatedAt: new Date().toISOString()
            }));
            updateBookingDeliveryState(bookingId, {
                adminEmailDispatch: {
                    state: 'sending',
                    reason: sanitizeInput(reason || 'local_fallback', 120),
                    updatedAt: new Date().toISOString()
                }
            });

            const attempts = [];
            const fallbackIdempotencyKey = createStableFallbackEmailIdempotencyKey(bookingId);
            for (const apiBase of apiBases) {
                if (isApiBaseQuarantined(apiBase)) {
                    attempts.push({
                        apiBase,
                        status: 0,
                        reason: 'api_base_quarantined'
                    });
                    continue;
                }
                try {
                    const response = await fetchWithTimeout(`${apiBase}/api/bookings/fallback/admin-alert-email`, {
                        method: 'POST',
                        keepalive: true,
                        cache: 'no-store',
                        headers: {
                            ...buildSecureApiHeaders({
                                token,
                                includeJson: true,
                                includeIdempotency: true,
                                idPrefix: 'gir-booking-fallback-email',
                                idempotencyKey: fallbackIdempotencyKey
                            }),
                            'x-booking-client': 'goindiaride-web'
                        },
                        body: JSON.stringify(payload)
                    }, 65000);

                    const data = await parseJsonSafe(response);
                    if (isDuplicateIdempotencyConflictResponse(response.status, data)) {
                        clearApiBaseQuarantine(apiBase);
                        return {
                            ok: true,
                            bookingId: sanitizeInput(data.bookingId || bookingId),
                            adminEmail: {
                                sent: true,
                                skipped: false,
                                deduped: true,
                                reason: 'duplicate_suppressed'
                            },
                            customerEmail: data.customerEmail || {
                                sent: false,
                                skipped: true,
                                reason: 'duplicate_suppressed'
                            },
                            apiBase,
                            deduped: true
                        };
                    }
                    if (response.ok && data.ok !== false) {
                        clearApiBaseQuarantine(apiBase);
                        localStorage.setItem(LAST_ADMIN_EMAIL_DISPATCH_KEY, JSON.stringify({
                            bookingId: sanitizeInput(data.bookingId || bookingId, 120),
                            state: 'success',
                            apiBase,
                            adminEmail: data.adminEmail || null,
                            customerEmail: data.customerEmail || null,
                            updatedAt: new Date().toISOString()
                        }));
                        updateBookingDeliveryState(sanitizeInput(data.bookingId || bookingId, 120), {
                            adminEmailDispatch: resolveEmailDispatchState(data.adminEmail, 'sent', ''),
                            customerEmailDispatch: resolveEmailDispatchState(data.customerEmail, 'pending', ''),
                            lastEmailDispatchAt: new Date().toISOString()
                        });
                        return {
                            ok: true,
                            bookingId: sanitizeInput(data.bookingId || bookingId),
                            adminEmail: data.adminEmail || null,
                            customerEmail: data.customerEmail || null,
                            apiBase
                        };
                    }

                    const responseReason = sanitizeInput(data.reason || data.message || `http_${response.status}`, 140);
                    const statusCode = Number(response.status || 0);
                    if (shouldQuarantineApiBase(apiBase, statusCode, responseReason)) {
                        const ttlMs = statusCode === 404 || statusCode === 405
                            ? API_BASE_QUARANTINE_STATIC_MS
                            : API_BASE_QUARANTINE_DEFAULT_MS;
                        quarantineApiBase(apiBase, responseReason, statusCode, ttlMs);
                    }
                    attempts.push({
                        apiBase,
                        status: statusCode,
                        reason: responseReason
                    });

                    // Retry on known unavailable backends, keep trying next candidate.
                    if ([404, 405, 408, 429, 500, 502, 503, 504].includes(statusCode)) {
                        continue;
                    }

                    return {
                        ok: false,
                        reason: responseReason || `http_${response.status}`,
                        status: statusCode,
                        apiBase,
                        customerEmail: data.customerEmail || null,
                        attempts
                    };
                } catch (error) {
                    const reasonText = sanitizeInput(classifyBrowserRequestFailure(apiBase, error), 140);
                    if (shouldQuarantineApiBase(apiBase, 0, reasonText)) {
                        quarantineApiBase(apiBase, reasonText, 0, API_BASE_QUARANTINE_DNS_MS);
                    }
                    attempts.push({
                        apiBase,
                        status: 0,
                        reason: reasonText
                    });
                }
            }

            const lastAttempt = attempts.length ? attempts[attempts.length - 1] : null;
            localStorage.setItem(LAST_ADMIN_EMAIL_DISPATCH_KEY, JSON.stringify({
                bookingId,
                state: 'failed',
                reason: lastAttempt ? sanitizeInput(lastAttempt.reason || 'request_failed', 140) : 'fallback_email_request_failed',
                apiBase: lastAttempt ? sanitizeInput(lastAttempt.apiBase || '', 240) : '',
                updatedAt: new Date().toISOString()
            }));
            updateBookingDeliveryState(bookingId, {
                adminEmailDispatch: {
                    state: 'pending',
                    reason: lastAttempt ? sanitizeInput(lastAttempt.reason || 'request_failed', 140) : 'fallback_email_request_failed',
                    updatedAt: new Date().toISOString()
                },
                lastEmailDispatchAt: new Date().toISOString()
            });
            return {
                ok: false,
                reason: lastAttempt ? `${lastAttempt.reason || 'request_failed'} [${lastAttempt.apiBase}]` : 'fallback_email_request_failed',
                status: lastAttempt ? Number(lastAttempt.status || 0) : 0,
                attempts
            };
        }
