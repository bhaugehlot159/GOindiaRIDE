(function initQuickBooking() {
    const ADMIN_PHONE = '918426891471';
    const API_RENDER_BASE = 'https://goindiaride.onrender.com';
    const STORE_KEYS = [
        'bookings',
        'goride_bookings',
        'goindiaride_active_bookings',
        'customerBookings',
        'customer_bookings',
        'goindiaride_customer_bookings_v1',
        'goindiaride_live_customer_booking_queue_v1'
    ];
    const ADMIN_REVIEW_KEY = 'goindiaride_admin_review_inbox_v1';
    const LAST_BOOKING_KEY = 'goindiaride_last_public_shortcut_booking_v1';
    const HOME_BOOKING_HANDOFF_KEY = 'goindiaride_home_booking_handoff_v2';

    const form = document.getElementById('quickBookingForm');
    if (!form) return;

    const fields = {
        pickup: document.getElementById('pickupInput'),
        drop: document.getElementById('dropInput'),
        rideDate: document.getElementById('rideDateInput'),
        rideTime: document.getElementById('rideTimeInput'),
        returnDate: document.getElementById('returnDateInput'),
        returnTime: document.getElementById('returnTimeInput'),
        stopOne: document.getElementById('stopOneInput'),
        stopTwo: document.getElementById('stopTwoInput'),
        serviceMode: document.getElementById('serviceModeInput'),
        vehicleModel: document.getElementById('vehicleModelInput'),
        name: document.getElementById('nameInput'),
        phone: document.getElementById('phoneInput'),
        email: document.getElementById('emailInput'),
        passengers: document.getElementById('passengerInput'),
        luggage: document.getElementById('luggageInput'),
        payment: document.getElementById('paymentInput'),
        budget: document.getElementById('budgetInput'),
        promo: document.getElementById('promoInput'),
        notes: document.getElementById('notesInput'),
        terminal: document.getElementById('terminalInput'),
        flight: document.getElementById('flightInput'),
        airline: document.getElementById('airlineInput'),
        meetGreet: document.getElementById('meetGreetInput'),
        waitingBuffer: document.getElementById('waitingBufferInput'),
        reschedule: document.getElementById('rescheduleInput'),
        cancellation: document.getElementById('cancellationInput'),
        driverCall: document.getElementById('driverCallInput'),
        fuelPreference: document.getElementById('fuelPreferenceInput'),
        gstCompany: document.getElementById('gstCompanyInput'),
        gstNumber: document.getElementById('gstNumberInput'),
        editReason: document.getElementById('editReasonInput'),
        manageBooking: document.getElementById('manageBookingInput')
    };

    const fareAmount = document.getElementById('fareAmount');
    const distanceAmount = document.getElementById('distanceAmount');
    const tollAmount = document.getElementById('tollAmount');
    const tollNote = document.getElementById('tollNote');
    const syncStatus = document.getElementById('syncStatus');
    const formMessage = document.getElementById('formMessage');
    const submitBtn = document.getElementById('submitBookingBtn');
    const whatsAppBookingLink = document.getElementById('whatsAppBookingLink');
    const loadBookingBtn = document.getElementById('loadBookingBtn');
    const newBookingBtn = document.getElementById('newBookingBtn');
    const routeSuggestions = document.querySelector('.route-suggestions');
    const tripPlanDetail = {
        shell: document.getElementById('tripPlanDetail'),
        kicker: document.getElementById('tripPlanKicker'),
        title: document.getElementById('tripPlanTitle'),
        copy: document.getElementById('tripPlanCopy'),
        points: document.getElementById('tripPlanPoints')
    };

    const state = {
        tripPlan: 'airport',
        journey: 'one_way',
        vehicleType: 'economy',
        lastFare: null,
        editingBookingId: '',
        editOriginal: null
    };

    const VEHICLE_MODEL_OPTIONS = [
        { value: '', label: 'Any clean cab' },
        { value: 'hatchback_car', label: 'Hatchback Car' },
        { value: 'ecco_car', label: 'Ecco Car' },
        { value: 'sedan_car', label: 'Sedan Car' },
        { value: 'swift_dzire', label: 'Swift Dzire' },
        { value: 'toyota_etios', label: 'Toyota Etios' },
        { value: 'suv_ertiga_car', label: 'SUV Ertiga Car' },
        { value: 'ertiga', label: 'Ertiga' },
        { value: 'toyota_rumion', label: 'Toyota Rumion' },
        { value: 'kia_carens', label: 'Kia Carens' },
        { value: 'suv_innova_car', label: 'SUV Innova Car' },
        { value: 'toyota_innova', label: 'Toyota Innova' },
        { value: 'suv_crysta_car', label: 'SUV Crysta Car' },
        { value: 'innova_crysta', label: 'Innova Crysta' },
        { value: 'toyota_hycross', label: 'Toyota Hycross' },
        { value: 'tempo_traveller', label: 'Tempo Traveller' },
        { value: 'twelve_seater_traveller', label: '12 Seater Traveller' },
        { value: 'force_urbania', label: 'Force Urbania' },
        { value: 'force_trax_cruiser', label: 'Force Trax Cruiser' },
        { value: 'small_coach', label: 'Small Coach' },
        { value: 'luxury_coach', label: 'Luxury Coach' },
        { value: 'premium_car', label: 'Premium Car' },
        { value: 'business_sedan', label: 'Business Sedan' },
        { value: 'wheelchair_accessible_car', label: 'Wheelchair Accessible Car' },
        { value: 'ev_car', label: 'EV Car' },
        { value: 'parcel_only', label: 'Parcel' },
        { value: 'driver_only', label: 'Driver' },
        { value: 'ambulance', label: 'Ambulance' },
        { value: 'loading_auto_truck', label: 'Loading Auto & Truck' },
        { value: 'hatchback', label: 'Hatchback' },
        { value: 'sedan_ac', label: 'AC Sedan' },
        { value: 'suv_ac', label: 'AC SUV' },
        { value: 'traveller', label: 'Traveller / Minivan' }
    ];

    const TRIP_PLAN_CONFIG = {
        airport: {
            kicker: 'Airport booking mode',
            title: 'Airport pickup, drop, transfer and hourly duty',
            copy: 'Airport mode keeps terminal, flight or train, meet and greet, luggage fit, waiting buffer, delay notes and airport-city route details together for admin review.',
            points: [
                'Airport Drop, Airport Pickup, Terminal Transfer, Return Pickup, Hourly and Multi-stop airport duties are separate service choices.',
                'Terminal / gate, flight number, carrier, placard name, waiting buffer and luggage details stay visible before submit.',
                'Best for city to airport, airport to city, airport to airport, hotel transfer, railway station and flight-delay coordination.'
            ],
            serviceModes: [
                { value: 'airport_drop', label: 'Airport Drop - city to airport' },
                { value: 'airport_pickup', label: 'Airport Pickup - airport to city' },
                { value: 'airport_transfer', label: 'Airport Transfer - terminal / airport to airport' },
                { value: 'airport_to_airport', label: 'Airport to Airport / Terminal Transfer' },
                { value: 'airport_round', label: 'Airport Return Pickup' },
                { value: 'airport_hourly', label: 'Airport Hourly - airport plus city' },
                { value: 'airport_day', label: 'Airport Full Day Duty' },
                { value: 'airport_multi', label: 'Airport Multi-stop Route' },
                { value: 'railway_station_transfer', label: 'Railway Station Transfer' }
            ],
            journeyModes: {
                one_way: 'airport_drop',
                round_trip: 'airport_round',
                multi_city: 'airport_multi'
            },
            labels: {
                pickup: 'Pickup',
                drop: 'Drop',
                notes: 'Airport notes'
            },
            placeholders: {
                pickup: 'City, hotel, station, or airport terminal',
                drop: 'Airport terminal, hotel, city, or station',
                terminal: 'Terminal, gate, pillar, arrival/departure point',
                flight: 'Flight or train number',
                stopOne: 'Terminal, hotel, station, or city stop',
                stopTwo: 'Second airport/city stop',
                notes: 'Flight delay, luggage, meet and greet, pickup point'
            },
            suggestions: [
                { pickup: 'Jaipur Airport', drop: 'Jaipur City', label: 'Jaipur Airport to City' },
                { pickup: 'Udaipur Airport', drop: 'Udaipur Hotel', label: 'Udaipur Airport to Hotel' },
                { pickup: 'Delhi Airport', drop: 'Jaipur', label: 'Delhi Airport to Jaipur' },
                { pickup: 'Ahmedabad Airport', drop: 'Udaipur', label: 'Ahmedabad Airport to Udaipur' }
            ]
        },
        city: {
            kicker: 'Local booking mode',
            title: 'Local point-to-point, hourly and city tour cabs',
            copy: 'Local mode is for within-city pickup/drop, station transfer, city tour, office duty, errands and hourly disposal with stops and passenger preferences.',
            points: [
                'Local Point to Point, Local Hourly, City Tour, Station Transfer and Corporate City Ride are separate choices.',
                'Use Multi stop for markets, hospitals, meetings or sightseeing points; use Round trip when driver wait and return are needed.',
                'Payment, passengers, luggage, add-ons, safety preferences and admin approval remain on the same public booking page.'
            ],
            serviceModes: [
                { value: 'local_point', label: 'Local Point to Point' },
                { value: 'local_hourly', label: 'Local Hourly / Disposal' },
                { value: 'local_city_tour', label: 'Local City Tour' },
                { value: 'local_round_wait', label: 'Local Return with Waiting' },
                { value: 'local_multi_stop', label: 'Local Multi-stop Ride' },
                { value: 'railway_station_transfer', label: 'Railway Station Transfer' },
                { value: 'corporate_city_ride', label: 'Corporate City Ride' }
            ],
            journeyModes: {
                one_way: 'local_point',
                round_trip: 'local_round_wait',
                multi_city: 'local_multi_stop'
            },
            labels: {
                pickup: 'Pickup',
                drop: 'Drop',
                notes: 'Local ride notes'
            },
            placeholders: {
                pickup: 'Home, hotel, office, railway station',
                drop: 'Mall, hospital, meeting, tourist place',
                terminal: 'Station platform, gate, landmark, office block',
                flight: 'Train number or local reference',
                stopOne: 'Market, office, hospital, tourist stop',
                stopTwo: 'Second local stop',
                notes: 'Waiting, local stops, driver call timing, landmark'
            },
            suggestions: [
                { pickup: 'Jaipur Railway Station', drop: 'Jaipur Hotel', label: 'Jaipur Station to Hotel' },
                { pickup: 'Udaipur Hotel', drop: 'City Palace Udaipur', label: 'Udaipur City Tour' },
                { pickup: 'Jodhpur Airport Road', drop: 'Mehrangarh Fort', label: 'Jodhpur Local Ride' },
                { pickup: 'Kota Railway Station', drop: 'Kota City', label: 'Kota Station to City' }
            ]
        },
        outstation: {
            kicker: 'Outstation booking mode',
            title: 'Intercity one way, round trip and multi-city routes',
            copy: 'Outstation mode captures intercity distance, return plan, route stops, toll/admin review notes, luggage fit and route approval before dispatch.',
            points: [
                'Outstation One Way, Round Trip, Multi-city, Pilgrimage, Hill Station and Long Route Duty are separate service modes.',
                'Round trip opens return date/time; Multi stop opens extra route fields for cities, temples, hotels or sightseeing points.',
                'Fare estimate, customer budget, vehicle segment, toll-ready admin review and WhatsApp confirmation stay connected.'
            ],
            serviceModes: [
                { value: 'outstation_one_way', label: 'Outstation One Way' },
                { value: 'outstation_round_trip', label: 'Outstation Round Trip' },
                { value: 'outstation_multi_city', label: 'Outstation Multi-city' },
                { value: 'outstation_pilgrimage', label: 'Pilgrimage / Temple Route' },
                { value: 'outstation_hill_station', label: 'Hill Station Route' },
                { value: 'outstation_long_route', label: 'Long Route Duty' }
            ],
            journeyModes: {
                one_way: 'outstation_one_way',
                round_trip: 'outstation_round_trip',
                multi_city: 'outstation_multi_city'
            },
            labels: {
                pickup: 'Pickup city',
                drop: 'Drop city',
                notes: 'Outstation notes'
            },
            placeholders: {
                pickup: 'Start city / pickup address',
                drop: 'Destination city / final address',
                terminal: 'Hotel, landmark, pickup gate, route point',
                flight: 'Train/flight reference if connected',
                stopOne: 'Intermediate city or route stop',
                stopTwo: 'Second route stop',
                notes: 'Route preference, tolls, night halt, luggage, driver stay'
            },
            suggestions: [
                { pickup: 'Jaipur', drop: 'Udaipur', label: 'Jaipur to Udaipur' },
                { pickup: 'Udaipur', drop: 'Mount Abu', label: 'Udaipur to Mount Abu' },
                { pickup: 'Jodhpur', drop: 'Jaisalmer', label: 'Jodhpur to Jaisalmer' },
                { pickup: 'Delhi', drop: 'Jaipur', label: 'Delhi to Jaipur' }
            ]
        },
        rental: {
            kicker: 'Rental booking mode',
            title: 'Hourly, half-day, full-day and event cab rental',
            copy: 'Rental mode is for disposal duty where the cab stays with the customer for hours, km packages, city stops, events, wedding duty or multi-day usage.',
            points: [
                'Half Day, Full Day, 8 hr / 80 km, 12 hr / 120 km, Multi-day Rental and Event Shuttle are separate choices.',
                'Use stops for package route points, add waiting buffer, roof carrier, new vehicle preference and driver call preference in full details.',
                'Best for city sightseeing, meetings, wedding guest movement, business disposal and hotel-to-hotel day plans.'
            ],
            serviceModes: [
                { value: 'rental_half_day', label: 'Rental Half Day' },
                { value: 'rental_full_day', label: 'Rental Full Day' },
                { value: 'rental_8h80km', label: 'Rental 8 hr / 80 km' },
                { value: 'rental_12h120km', label: 'Rental 12 hr / 120 km' },
                { value: 'rental_multi_day', label: 'Multi-day Rental' },
                { value: 'event_shuttle', label: 'Event / Wedding Shuttle' }
            ],
            journeyModes: {
                one_way: 'rental_full_day',
                round_trip: 'rental_12h120km',
                multi_city: 'rental_multi_day'
            },
            labels: {
                pickup: 'Rental start',
                drop: 'Rental end / base',
                notes: 'Rental notes'
            },
            placeholders: {
                pickup: 'Hotel, home, office, venue start point',
                drop: 'End point or base city',
                terminal: 'Venue gate, hotel lobby, office block',
                flight: 'Event, guest, flight or train reference',
                stopOne: 'Package route or venue stop',
                stopTwo: 'Second route or venue stop',
                notes: 'Hours, km package, event duty, waiting, driver stay'
            },
            suggestions: [
                { pickup: 'Jaipur Hotel', drop: 'Jaipur City Rental', label: 'Jaipur Full Day Rental' },
                { pickup: 'Udaipur Hotel', drop: 'Udaipur Sightseeing', label: 'Udaipur Sightseeing Rental' },
                { pickup: 'Jodhpur Hotel', drop: 'Jodhpur Local Rental', label: 'Jodhpur Rental' },
                { pickup: 'Wedding Venue', drop: 'Guest Hotel Shuttle', label: 'Wedding Shuttle' }
            ]
        }
    };

    function cleanText(value, maxLen) {
        return String(value || '')
            .replace(/[<>]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, maxLen || 220);
    }

    function toNumber(value, fallback) {
        const number = Number(value);
        return Number.isFinite(number) ? number : (fallback || 0);
    }

    function formatMoney(value) {
        const amount = Math.max(0, Math.round(toNumber(value, 0)));
        return `INR ${amount.toLocaleString('en-IN')}`;
    }

    function formatDistance(value) {
        const km = Math.max(0, toNumber(value, 0));
        return `${km.toLocaleString('en-IN', { maximumFractionDigits: 1 })} km`;
    }

    function formatTollNote(fare) {
        const plazas = Array.isArray(fare && fare.tollPlazas) ? fare.tollPlazas : [];
        if (plazas.length) {
            const names = plazas.map((item) => cleanText(item && item.name, 80)).filter(Boolean).slice(0, 2).join(', ');
            const more = plazas.length > 2 ? ` +${plazas.length - 2} more` : '';
            return `${names}${more}${fare.tollUsedReturnRate ? ' return rate' : ''}`;
        }
        if (fare && fare.tollRequiresAdminReview) return 'Admin review';
        if (fare && fare.tollSource === 'local_no_mapped_toll') return 'No mapped toll';
        return 'Mapped route check';
    }

    function todayValue() {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    function defaultTimeValue() {
        const next = new Date(Date.now() + 45 * 60 * 1000);
        const hh = String(next.getHours()).padStart(2, '0');
        const mm = String(Math.ceil(next.getMinutes() / 5) * 5).padStart(2, '0');
        return `${hh}:${mm === '60' ? '55' : mm}`;
    }

    function normalizePhone(value) {
        const raw = cleanText(value, 40).replace(/\s+/g, '');
        if (!raw) return '';
        if (raw.startsWith('+')) {
            const digits = raw.slice(1).replace(/\D/g, '');
            return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : '';
        }
        const digits = raw.replace(/\D/g, '');
        if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
        if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
        return '';
    }

    function normalizeEmail(value) {
        const email = cleanText(value, 180).toLowerCase();
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
    }

    function readStops() {
        return [fields.stopOne, fields.stopTwo]
            .map((input) => cleanText(input && input.value, 160))
            .filter(Boolean);
    }

    function readBooleanMap(selector) {
        const result = {};
        document.querySelectorAll(selector).forEach((input) => {
            const key = cleanText(input.dataset.addon || input.dataset.safety || '', 60);
            if (key) result[key] = Boolean(input.checked);
        });
        return result;
    }

    function readBookingAddOns() {
        return readBooleanMap('[data-addon]');
    }

    function readSafetyAccessibility() {
        return readBooleanMap('[data-safety]');
    }

    function readSpecialRequests() {
        const addOns = readBookingAddOns();
        const gstRequested = Boolean(addOns.gstInvoiceRequired || cleanText(fields.gstCompany && fields.gstCompany.value, 140) || cleanText(fields.gstNumber && fields.gstNumber.value, 40));
        return {
            aircondition: true,
            meetassist: Boolean(addOns.meetAssist),
            waterbottle: Boolean(addOns.waterBottle),
            charger: Boolean(addOns.phoneCharger),
            wifi: Boolean(addOns.wifi),
            gstinvoice: gstRequested,
            roofcarrier: Boolean(addOns.roofCarrier),
            newvehiclepreferred: Boolean(addOns.newVehiclePreferred),
            drivercallbeforearrival: Boolean(addOns.driverCallBeforeArrival),
            extrawaitapproval: Boolean(addOns.extraWaitApproval)
        };
    }

    function readTravelAssurance() {
        const addOns = readBookingAddOns();
        const safetyAccessibility = readSafetyAccessibility();
        const gstRequested = Boolean(addOns.gstInvoiceRequired || cleanText(fields.gstCompany && fields.gstCompany.value, 140) || cleanText(fields.gstNumber && fields.gstNumber.value, 40));
        return {
            flightDetails: {
                flightNumber: cleanText(fields.flight && fields.flight.value, 80),
                terminal: cleanText(fields.terminal && fields.terminal.value, 120),
                pickupPoint: cleanText(fields.terminal && fields.terminal.value, 120),
                airlineName: cleanText(fields.airline && fields.airline.value, 120),
                meetAndGreetName: cleanText(fields.meetGreet && fields.meetGreet.value, 120)
            },
            policyPreferences: {
                flexibleCancellation: true,
                adminReviewBeforeDispatch: true,
                customerEditRequested: Boolean(state.editingBookingId),
                liveTripShare: Boolean(safetyAccessibility.livetripshare),
                waitingBuffer: cleanText(fields.waitingBuffer && fields.waitingBuffer.value, 80),
                rescheduleWindow: cleanText(fields.reschedule && fields.reschedule.value, 80),
                cancellationPreference: cleanText(fields.cancellation && fields.cancellation.value, 80),
                driverCallPreference: cleanText(fields.driverCall && fields.driverCall.value, 80),
                flightTrackingConsent: Boolean(addOns.flightTrackingConsent),
                driverCallBeforeArrival: Boolean(addOns.driverCallBeforeArrival),
                extraWaitApproval: Boolean(addOns.extraWaitApproval),
                roofCarrierNeeded: Boolean(addOns.roofCarrier),
                newVehiclePreferred: Boolean(addOns.newVehiclePreferred)
            },
            billingDetails: {
                gstInvoiceRequired: gstRequested,
                gstCompanyName: cleanText(fields.gstCompany && fields.gstCompany.value, 140),
                gstNumber: cleanText(fields.gstNumber && fields.gstNumber.value, 40)
            },
            addOns
        };
    }

    function buildLocationPins(pickup, drop, stops) {
        const coordinateSuffixPattern = /\((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)\s*$/i;
        const currentMatch = coordinateSuffixPattern.exec(pickup || '');
        const pickupCoordinates = currentMatch
            ? { lat: Number(currentMatch[1]), lng: Number(currentMatch[2]), source: 'browser_geolocation' }
            : null;
        const pickupLabel = currentMatch
            ? cleanText(String(pickup || '').replace(coordinateSuffixPattern, '').trim(), 180) || pickup
            : pickup;
        return {
            pickup: {
                label: pickupLabel,
                coordinates: pickupCoordinates,
                googleMapsUrl: pickupCoordinates ? `https://www.google.com/maps?q=${pickupCoordinates.lat},${pickupCoordinates.lng}` : ''
            },
            dropoff: {
                label: drop,
                coordinates: null,
                googleMapsUrl: ''
            },
            stops: stops.map((label) => ({ label, coordinates: null, googleMapsUrl: '' }))
        };
    }

    function buildFullDetailNotes(baseNotes, details = {}) {
        const lines = [
            cleanText(baseNotes, 300),
            details.serviceMode ? `Service mode: ${details.serviceMode}` : '',
            details.journey ? `Journey: ${details.journey}` : '',
            details.terminal ? `Terminal/Gate: ${details.terminal}` : '',
            details.flight ? `Flight/Train: ${details.flight}` : '',
            details.airline ? `Airline/Carrier: ${details.airline}` : '',
            details.meetGreet ? `Meet/Greet: ${details.meetGreet}` : '',
            details.waitingBuffer ? `Waiting buffer: ${details.waitingBuffer}` : '',
            details.reschedule ? `Reschedule: ${details.reschedule}` : '',
            details.cancellation ? `Cancellation: ${details.cancellation}` : '',
            details.driverCall ? `Driver call: ${details.driverCall}` : '',
            details.stops && details.stops.length ? `Stops: ${details.stops.join(' | ')}` : '',
            details.luggage ? `Luggage: ${details.luggage}` : '',
            details.vehicleModel ? `Cab model: ${details.vehicleModel}` : '',
            details.fuelPreference ? `Fuel preference: ${details.fuelPreference}` : '',
            details.addOns ? `Add-ons: ${details.addOns}` : '',
            details.budgetAmount ? `Customer budget: INR ${details.budgetAmount}` : '',
            details.promoCode ? `Promo: ${details.promoCode}` : '',
            details.gstCompany || details.gstNumber ? `GST: ${details.gstCompany || 'Company not set'} ${details.gstNumber || ''}` : '',
            details.editReason ? `Customer edit note: ${details.editReason}` : ''
        ].filter(Boolean);
        return cleanText(lines.join(' | '), 1200);
    }

    function computeChangedFields(previous = {}, next = {}) {
        if (!previous || !previous.bookingId) return [];
        const pairs = [
            ['pickup', previous.pickup || previous.pickupLocation, next.pickup],
            ['dropoff', previous.dropoff || previous.drop || previous.dropLocation, next.dropoff],
            ['rideDate', previous.rideDate, next.rideDate],
            ['rideTime', previous.rideTime, next.rideTime],
            ['returnDate', previous.returnDate || previous.returnTrip?.returnDate, next.returnDate],
            ['returnTime', previous.returnTime || previous.returnTrip?.returnTime, next.returnTime],
            ['tripPlan', previous.tripPlan, next.tripPlan],
            ['tripServiceType', previous.tripServiceType || previous.serviceType, next.tripServiceType],
            ['vehicleType', previous.vehicleType || previous.rideType, next.vehicleType],
            ['vehicleModel', previous.vehicleModel, next.vehicleModel],
            ['passengers', previous.passengers, next.passengers],
            ['luggage', previous.luggage, next.luggage],
            ['paymentMethod', previous.paymentMethod || previous.payment?.method, next.paymentMethod],
            ['notes', previous.notes, next.notes],
            ['budgetAmount', previous.budgetAmount || previous.customerBidAmount, next.budgetAmount],
            ['stops', JSON.stringify(previous.stops || []), JSON.stringify(next.stops || [])],
            ['specialRequests', JSON.stringify(previous.specialRequests || previous.customerFeatures?.specialRequests || {}), JSON.stringify(next.specialRequests || {})],
            ['safetyAccessibility', JSON.stringify(previous.safetyAccessibility || previous.customerFeatures?.safetyAccessibility || {}), JSON.stringify(next.safetyAccessibility || {})]
        ];
        return pairs
            .filter(([, before, after]) => cleanText(before, 1000) !== cleanText(after, 1000))
            .map(([field]) => field);
    }

    function activeBookingId() {
        return cleanText(state.editingBookingId || '', 120).toUpperCase();
    }

    function normalizeTripServiceType() {
        const serviceMode = cleanText(fields.serviceMode && fields.serviceMode.value, 80);
        if (serviceMode) return serviceMode;
        if (state.tripPlan === 'airport') return 'airport_pickup_drop';
        if (state.tripPlan === 'rental') return 'hourly_rental';
        if (state.journey === 'multi_city') return 'multi_city';
        if (state.tripPlan === 'outstation') return state.journey === 'round_trip' ? 'outstation_round_trip' : 'outstation_one_way';
        return 'local_city';
    }

    function routeKey(left, right) {
        return `${cleanText(left, 90).toLowerCase()}|${cleanText(right, 90).toLowerCase()}`;
    }

    function estimateFallbackDistance(pickup, drop) {
        const routes = new Map([
            [routeKey('jaipur airport', 'jaipur city'), 13],
            [routeKey('delhi airport', 'jaipur'), 280],
            [routeKey('jaipur', 'agra taj mahal'), 240],
            [routeKey('jaipur', 'agra'), 240],
            [routeKey('jaipur', 'udaipur'), 395],
            [routeKey('jaipur', 'jodhpur'), 335],
            [routeKey('udaipur airport', 'udaipur city'), 22],
            [routeKey('delhi', 'agra'), 230]
        ]);
        const direct = routes.get(routeKey(pickup, drop));
        const reverse = routes.get(routeKey(drop, pickup));
        if (direct || reverse) return direct || reverse;
        if (state.tripPlan === 'airport') return 22;
        if (state.tripPlan === 'outstation') return state.journey === 'round_trip' ? 260 : 160;
        if (state.tripPlan === 'rental') return 80;
        if (state.journey === 'multi_city') return 45;
        return 12;
    }

    function buildFareInput() {
        const pickup = cleanText(fields.pickup.value, 180);
        const drop = cleanText(fields.drop.value, 180);
        const stops = readStops();
        const fallbackDistance = estimateFallbackDistance(pickup, drop);
        return {
            pickup,
            drop,
            tripPlan: state.tripPlan,
            tripServiceType: normalizeTripServiceType(),
            vehicleType: state.vehicleType,
            vehicleModel: cleanText(fields.vehicleModel && fields.vehicleModel.value, 80),
            vehicleFuelPreference: cleanText(fields.fuelPreference && fields.fuelPreference.value, 80),
            passengers: toNumber(fields.passengers.value, 1),
            luggage: cleanText(fields.luggage && fields.luggage.value, 80),
            paymentMethod: fields.payment.value || 'cash',
            rideDate: fields.rideDate.value,
            rideTime: fields.rideTime.value,
            returnDate: state.journey === 'round_trip' ? fields.returnDate.value : '',
            returnTime: state.journey === 'round_trip' ? fields.returnTime.value : '',
            isReturnTrip: state.journey === 'round_trip',
            stops,
            specialRequests: readSpecialRequests(),
            safetyAccessibility: readSafetyAccessibility(),
            budgetAmount: toNumber(fields.budget && fields.budget.value, 0),
            promoCode: cleanText(fields.promo && fields.promo.value, 40).toUpperCase(),
            distanceKm: fallbackDistance,
            distanceSource: pickup && drop ? 'shortcut_estimate' : 'shortcut_default'
        };
    }

    function estimateFare() {
        const input = buildFareInput();
        let fare = null;
        if (
            window.GoIndiaRideFareCalculator &&
            typeof window.GoIndiaRideFareCalculator.estimateBookingFare === 'function'
        ) {
            try {
                fare = window.GoIndiaRideFareCalculator.estimateBookingFare(input);
            } catch (_error) {
                fare = null;
            }
        }
        if (!fare) {
            const perKm = state.vehicleType === 'suv' ? 18 : state.vehicleType === 'sedan' ? 13 : 10;
            const base = state.tripPlan === 'airport' ? 180 : state.tripPlan === 'outstation' ? 260 : state.tripPlan === 'rental' ? 900 : 99;
            const returnBoost = state.journey === 'round_trip' ? 1.58 : 1;
            const totalFare = Math.max(99, Math.round((base + input.distanceKm * perKm) * returnBoost));
            fare = {
                ...input,
                totalFare,
                amount: totalFare,
                finalFare: totalFare,
                distanceKm: input.distanceKm,
                distanceSource: input.distanceSource,
                calculatedAt: new Date().toISOString()
            };
        }
        state.lastFare = fare;
        fareAmount.textContent = formatMoney(fare.totalFare || fare.amount || fare.finalFare || 0);
        distanceAmount.textContent = formatDistance(fare.distanceKm || 0);
        if (tollAmount) tollAmount.textContent = formatMoney(fare.tollCharge || 0);
        if (tollNote) tollNote.textContent = formatTollNote(fare);
        updateWhatsAppLink();
        return fare;
    }

    function makeBookingId() {
        const timePart = Date.now().toString(36).toUpperCase();
        const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
        return `RID${timePart}${randomPart}`;
    }

    function readArray(key) {
        try {
            const parsed = JSON.parse(localStorage.getItem(key) || '[]');
            return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object') : [];
        } catch (_error) {
            return [];
        }
    }

    function writeMergedArray(key, booking) {
        const bookingId = cleanText(booking.bookingId || booking.id, 120);
        if (!bookingId) return;
        const rows = readArray(key);
        const index = rows.findIndex((item) => cleanText(item.bookingId || item.id, 120) === bookingId);
        if (index >= 0) rows[index] = { ...rows[index], ...booking, id: bookingId, bookingId };
        else rows.unshift({ ...booking, id: bookingId, bookingId });
        localStorage.setItem(key, JSON.stringify(rows.slice(0, 250)));
    }

    function persistBooking(booking) {
        STORE_KEYS.forEach((key) => writeMergedArray(key, booking));
        writeMergedArray(ADMIN_REVIEW_KEY, {
            ...booking,
            adminReviewStatus: 'pending',
            status: 'pending_admin_review',
            sourceKey: booking.sourceKey || 'shortcut_public_booking'
        });
        localStorage.setItem(LAST_BOOKING_KEY, JSON.stringify({
            bookingId: booking.bookingId,
            pickup: booking.pickup,
            drop: booking.drop,
            totalFare: booking.totalFare,
            savedAt: new Date().toISOString()
        }));
    }

    function getApiBaseCandidates() {
        const host = String(window.location.hostname || '').toLowerCase();
        const origin = String(window.location.origin || '').replace(/\/$/, '');
        const candidates = [];
        const push = (value) => {
            const base = String(value || '').trim().replace(/\/$/, '');
            if (!base || !/^https?:\/\//i.test(base)) return;
            if (!candidates.includes(base)) candidates.push(base);
        };
        const runtimeBase = window.__GOINDIARIDE_RUNTIME_API_ORIGIN__ || window.__GOINDIARIDE_API_ORIGIN__ || window.GOINDIARIDE_API_BASE || '';
        if (host === 'goindiaride.in' || host === 'www.goindiaride.in' || host.endsWith('.goindiaride.in') || host.endsWith('.github.io')) {
            push(API_RENDER_BASE);
        }
        push(runtimeBase);
        try {
            push(localStorage.getItem('goindiaride_api_base') || '');
        } catch (_error) {
            // Storage can be disabled in strict browser modes.
        }
        if (host === 'localhost' || host === '127.0.0.1') {
            push('http://localhost:5000');
            push(API_RENDER_BASE);
        }
        if (!host.endsWith('.github.io') && host !== 'goindiaride.in' && host !== 'www.goindiaride.in') {
            push(origin);
        }
        return candidates;
    }

    function makeIdempotencyKey(body, endpointPath) {
        const bookingPart = cleanText(body && (body.bookingId || body.id), 80)
            .replace(/[^A-Za-z0-9_-]/g, '')
            .slice(0, 48) || Date.now().toString(36);
        const endpointPart = cleanText(endpointPath, 90)
            .replace(/[^A-Za-z0-9:_-]/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 52) || 'booking';
        const randomPart = Math.random().toString(36).slice(2, 10);
        return `gir-shortcut_${bookingPart}_${endpointPart}_${randomPart}`.slice(0, 128);
    }

    async function postJsonAcrossBases(path, body, timeoutMs) {
        const attempts = [];
        for (const base of getApiBaseCandidates()) {
            const controller = new AbortController();
            const timeout = window.setTimeout(() => controller.abort(), timeoutMs || 12000);
            try {
                const response = await fetch(`${base}${path}`, {
                    method: 'POST',
                    cache: 'no-store',
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                        'x-booking-client': 'goindiaride-web',
                        'x-request-id': `gir-shortcut-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                        'x-timestamp': String(Date.now()),
                        'x-idempotency-key': makeIdempotencyKey(body, path)
                    },
                    body: JSON.stringify(body),
                    signal: controller.signal
                });
                window.clearTimeout(timeout);
                let data = {};
                try {
                    data = await response.json();
                } catch (_error) {
                    data = {};
                }
                if (response.ok && data.ok !== false) {
                    return { ok: true, base, status: response.status, data };
                }
                attempts.push({ base, status: response.status, reason: cleanText(data.message || data.reason || 'request_failed', 160) });
            } catch (error) {
                window.clearTimeout(timeout);
                attempts.push({ base, status: 0, reason: cleanText(error && error.name === 'AbortError' ? 'request_timeout' : error.message, 160) });
            }
        }
        return { ok: false, attempts, reason: attempts.length ? attempts[attempts.length - 1].reason : 'api_unavailable' };
    }

    function buildDispatchUpdate(booking, isEdit, queueResult, emailResult) {
        const dispatchData = emailResult && emailResult.data && typeof emailResult.data === 'object' ? emailResult.data : {};
        const adminEmail = dispatchData.adminEmail && typeof dispatchData.adminEmail === 'object' ? dispatchData.adminEmail : null;
        const customerEmail = dispatchData.customerEmail && typeof dispatchData.customerEmail === 'object' ? dispatchData.customerEmail : null;
        const adminWhatsApp = dispatchData.adminWhatsApp && typeof dispatchData.adminWhatsApp === 'object' ? dispatchData.adminWhatsApp : null;
        const customerSms = dispatchData.customerSms && typeof dispatchData.customerSms === 'object' ? dispatchData.customerSms : null;
        const backendStatus = emailResult.ok
            ? (isEdit ? 'admin_alert_sent_after_customer_edit' : 'admin_alert_sent')
            : queueResult.ok
                ? (isEdit ? 'admin_queue_synced_customer_edit_email_pending' : 'admin_queue_synced_email_pending')
                : (isEdit ? 'customer_edit_local_saved_sync_pending' : 'local_saved_sync_pending');
        return {
            ...booking,
            backendStatus,
            adminQueueSyncStatus: queueResult.ok ? 'queued' : 'pending',
            adminQueueSyncReason: queueResult.ok ? '' : cleanText(queueResult.reason || 'api_unavailable', 120),
            adminEmailDispatch: {
                state: adminEmail && adminEmail.sent ? 'sent' : (emailResult.ok ? 'sent' : 'pending'),
                reason: adminEmail ? cleanText(adminEmail.reason || adminEmail.message || '', 120) : (emailResult.ok ? '' : cleanText(emailResult.reason || 'api_unavailable', 120)),
                ...adminEmail,
                updatedAt: new Date().toISOString()
            },
            customerEmailDispatch: {
                state: customerEmail && customerEmail.sent ? 'sent' : (customerEmail && customerEmail.skipped ? 'skipped' : 'pending'),
                reason: customerEmail ? cleanText(customerEmail.reason || customerEmail.message || '', 120) : '',
                ...customerEmail,
                updatedAt: new Date().toISOString()
            },
            adminWhatsAppDispatch: {
                state: adminWhatsApp && adminWhatsApp.sent ? 'sent' : (adminWhatsApp && adminWhatsApp.skipped ? 'skipped' : 'pending'),
                reason: adminWhatsApp ? cleanText(adminWhatsApp.reason || adminWhatsApp.message || '', 120) : '',
                ...adminWhatsApp,
                updatedAt: new Date().toISOString()
            },
            customerSmsDispatch: {
                state: customerSms && customerSms.sent ? 'sent' : (customerSms && customerSms.skipped ? 'skipped' : 'pending'),
                reason: customerSms ? cleanText(customerSms.reason || customerSms.message || '', 120) : (emailResult.ok ? '' : cleanText(emailResult.reason || 'api_unavailable', 120)),
                bookingReference: booking.bookingId,
                ...customerSms,
                updatedAt: new Date().toISOString()
            },
            updatedAt: new Date().toISOString()
        };
    }

    async function syncBookingInBackground(booking, isEdit) {
        const queueBody = {
            source: isEdit ? 'shortcut_customer_edit' : 'shortcut_public_booking',
            reason: isEdit ? (booking.customerEditReason || 'public_no_login_customer_edit') : 'public_no_login_shortcut',
            mode: booking.mode,
            changedFields: booking.changedFields || [],
            bookings: [booking]
        };
        const queueResult = await postJsonAcrossBases('/api/bookings/fallback/admin-review-queue', queueBody, 5000);
        if (queueResult.ok && activeBookingId() === booking.bookingId) syncStatus.textContent = 'Queued';
        const emailResult = await postJsonAcrossBases('/api/bookings/fallback/admin-alert-email', booking, 7000);
        const updated = buildDispatchUpdate(booking, isEdit, queueResult, emailResult);
        persistBooking(updated);
        if (activeBookingId() === booking.bookingId) {
            syncStatus.textContent = emailResult.ok ? 'Sent' : (queueResult.ok ? 'Queued' : 'Saved');
            if (emailResult.ok || queueResult.ok) {
                setMessage(
                    isEdit
                        ? `Booking ${booking.bookingId} updated. Admin portal will show the latest details.`
                        : `Booking ${booking.bookingId} received. GO India RIDE will confirm on your mobile.`,
                    'success'
                );
            }
        }
    }

    function buildBookingPayload(existingId) {
        const fare = estimateFare();
        const bookingId = (existingId || activeBookingId() || makeBookingId()).toUpperCase();
        const phone = normalizePhone(fields.phone.value);
        const pickup = cleanText(fields.pickup.value, 180);
        const drop = cleanText(fields.drop.value, 180);
        const customerName = cleanText(fields.name.value, 140) || 'Public booking customer';
        const customerEmail = normalizeEmail(fields.email && fields.email.value);
        const totalFare = Math.round(toNumber(fare.totalFare || fare.amount || fare.finalFare, 0));
        const now = new Date().toISOString();
        const stops = readStops();
        const specialRequests = readSpecialRequests();
        const safetyAccessibility = readSafetyAccessibility();
        const travelAssurance = readTravelAssurance();
        const terminal = cleanText(fields.terminal && fields.terminal.value, 120);
        const flightNumber = cleanText(fields.flight && fields.flight.value, 80);
        const serviceMode = normalizeTripServiceType();
        const serviceModeLabel = selectLabel(fields.serviceMode, serviceMode);
        const vehicleModel = cleanText(fields.vehicleModel && fields.vehicleModel.value, 80);
        const vehicleModelLabel = selectLabel(fields.vehicleModel, vehicleModel);
        const fuelPreference = cleanText(fields.fuelPreference && fields.fuelPreference.value, 80);
        const fuelPreferenceLabel = selectLabel(fields.fuelPreference, fuelPreference);
        const luggage = cleanText(fields.luggage && fields.luggage.value, 80);
        const airline = cleanText(fields.airline && fields.airline.value, 120);
        const meetGreet = cleanText(fields.meetGreet && fields.meetGreet.value, 120);
        const waitingBuffer = selectLabel(fields.waitingBuffer, fields.waitingBuffer && fields.waitingBuffer.value);
        const reschedule = selectLabel(fields.reschedule, fields.reschedule && fields.reschedule.value);
        const cancellation = selectLabel(fields.cancellation, fields.cancellation && fields.cancellation.value);
        const driverCall = selectLabel(fields.driverCall, fields.driverCall && fields.driverCall.value);
        const addOnLabels = checkedLabels('[data-addon], [data-safety]');
        const budgetAmount = toNumber(fields.budget && fields.budget.value, 0);
        const promoCode = cleanText(fields.promo && fields.promo.value, 40).toUpperCase();
        const editReason = cleanText(fields.editReason && fields.editReason.value, 180);
        const locationPins = buildLocationPins(pickup, drop, stops);
        const fullNotes = buildFullDetailNotes(fields.notes.value, {
            serviceMode: serviceModeLabel,
            journey: state.journey,
            terminal,
            flight: flightNumber,
            airline,
            meetGreet,
            waitingBuffer,
            reschedule,
            cancellation,
            driverCall,
            stops,
            luggage,
            vehicleModel: vehicleModelLabel,
            fuelPreference: fuelPreferenceLabel,
            addOns: addOnLabels,
            budgetAmount,
            promoCode,
            gstCompany: cleanText(fields.gstCompany && fields.gstCompany.value, 140),
            gstNumber: cleanText(fields.gstNumber && fields.gstNumber.value, 40),
            editReason
        });
        const existing = state.editOriginal && state.editOriginal.bookingId === bookingId ? state.editOriginal : {};
        const editHistory = Array.isArray(existing.editHistory) ? existing.editHistory.slice(-49) : [];
        if (existing.bookingId) {
            editHistory.push({
                editedAt: now,
                by: 'customer',
                source: 'public_shortcut_booking',
                reason: editReason || 'Updated by customer from shortcut booking page.',
                changedFields: []
            });
        }
        const returnTrip = {
            enabled: state.journey === 'round_trip',
            returnDate: state.journey === 'round_trip' ? fields.returnDate.value : '',
            returnTime: state.journey === 'round_trip' ? fields.returnTime.value : '',
            returnDateTime: state.journey === 'round_trip' && fields.returnDate.value && fields.returnTime.value
                ? `${fields.returnDate.value}T${fields.returnTime.value}:00`
                : null
        };
        const customerFeatures = {
            specialRequests,
            safetyAccessibility,
            hasStops: stops.length > 0,
            hasReturnTrip: returnTrip.enabled,
            airportTerminalNote: terminal,
            vehicleFuelPreference: fuelPreference,
            locationPins,
            pickupCoordinates: locationPins.pickup.coordinates,
            dropoffCoordinates: locationPins.dropoff.coordinates,
            routeStopLocations: locationPins.stops,
            travelAssurance,
            flightDetails: travelAssurance.flightDetails,
            policyPreferences: travelAssurance.policyPreferences,
            billingDetails: travelAssurance.billingDetails,
            addOns: travelAssurance.addOns,
            publicShortcutEditEnabled: true
        };
        const payload = {
            ...existing,
            id: bookingId,
            bookingId,
            customerId: '',
            customerName,
            customerPhone: phone,
            customerEmail,
            customerSnapshot: {
                name: customerName,
                phone,
                email: customerEmail
            },
            phoneVerification: {
                status: 'contact_only',
                source: 'public_shortcut_required_contact',
                fallbackReason: ''
            },
            pickup,
            pickupLocation: pickup,
            pickupCoordinates: locationPins.pickup.coordinates,
            pickupGoogleMapsUrl: locationPins.pickup.googleMapsUrl,
            drop,
            dropoff: drop,
            dropLocation: drop,
            dropoffCoordinates: locationPins.dropoff.coordinates,
            dropoffGoogleMapsUrl: locationPins.dropoff.googleMapsUrl,
            locationPins,
            stops,
            routeStopLocations: locationPins.stops,
            rideDate: fields.rideDate.value,
            rideTime: fields.rideTime.value,
            returnDate: returnTrip.returnDate,
            returnTime: returnTrip.returnTime,
            returnTrip,
            journeyType: state.journey,
            tripPlan: state.tripPlan,
            tripServiceType: serviceMode,
            tripServiceTypeLabel: serviceModeLabel,
            serviceType: serviceMode,
            serviceTypeLabel: serviceModeLabel,
            airportServiceMode: serviceMode,
            airportServiceLabel: serviceModeLabel,
            airportTerminalNote: terminal,
            travelAssurance,
            flightDetails: travelAssurance.flightDetails,
            policyPreferences: travelAssurance.policyPreferences,
            billingDetails: travelAssurance.billingDetails,
            bookingAddOns: travelAssurance.addOns,
            vehicleType: state.vehicleType,
            rideType: state.vehicleType,
            vehicleModel,
            vehicleModelLabel,
            vehicleFuelPreference: fuelPreference,
            vehicleFuelPreferenceLabel: fuelPreferenceLabel,
            fuelPreference,
            passengers: toNumber(fields.passengers.value, 1),
            luggage,
            paymentMethod: fields.payment.value || 'cash',
            notes: fullNotes,
            distanceKm: toNumber(fare.distanceKm, 0),
            distance: toNumber(fare.distanceKm, 0),
            distanceSource: cleanText(fare.distanceSource || 'shortcut_estimate', 80),
            budgetAmount,
            customerBidAmount: budgetAmount,
            amount: totalFare,
            totalFare,
            finalFare: totalFare,
            fareBreakdown: {
                ...fare,
                totalFare,
                amount: totalFare,
                finalFare: totalFare,
                budgetAmount,
                customerBidAmount: budgetAmount
            },
            fareQuote: {
                amount: totalFare,
                currency: 'INR',
                distanceKm: toNumber(fare.distanceKm, 0),
                source: cleanText(fare.distanceSource || 'shortcut_estimate', 80),
                routeCategory: fare.routeCategory || '',
                estimatedAt: now
            },
            fareHash: cleanText(fare.fareHash || '', 240),
            payment: {
                method: fields.payment.value || 'cash',
                status: 'pending',
                mode: fields.payment.value === 'card' ? 'india_card' : 'india',
                currency: 'INR'
            },
            promo: {
                code: promoCode || null,
                discount: toNumber(fare.promoDiscount, 0)
            },
            referralCode: promoCode,
            promoCode,
            specialRequests,
            safetyAccessibility,
            customerFeatures,
            currency: 'INR',
            status: 'pending_admin_review',
            adminReviewStatus: 'pending',
            adminBookingScope: 'customer',
            sourceKey: existing.bookingId ? 'shortcut_customer_edit' : 'shortcut_public_booking',
            mode: existing.bookingId ? 'public_no_login_customer_edit' : 'public_no_login_shortcut',
            backendStatus: existing.bookingId ? 'public_shortcut_edit_local_saved' : 'public_shortcut_local_saved',
            bookingChannel: 'google_direct_shortcut',
            editCount: existing.bookingId ? Math.max(toNumber(existing.editCount, 0) + 1, editHistory.length) : toNumber(existing.editCount, 0),
            editHistory,
            lastEditedAt: existing.bookingId ? now : (existing.lastEditedAt || null),
            customerLastEditedAt: existing.bookingId ? now : (existing.customerLastEditedAt || null),
            customerEditReason: existing.bookingId ? (editReason || 'Updated by customer from shortcut booking page.') : '',
            statusHistory: [
                ...(Array.isArray(existing.statusHistory) ? existing.statusHistory.slice(-25) : []),
                {
                    status: existing.bookingId ? 'customer_edited' : 'pending_admin_review',
                    at: now,
                    source: 'public_shortcut_booking',
                    note: existing.bookingId ? (editReason || 'Customer edited booking details.') : 'Public shortcut booking submitted.'
                }
            ],
            createdAt: existing.createdAt || now,
            updatedAt: now
        };
        if (existing.bookingId) {
            const changedFields = computeChangedFields(existing, payload);
            payload.changedFields = changedFields;
            if (payload.editHistory.length) {
                payload.editHistory[payload.editHistory.length - 1].changedFields = changedFields;
            }
        }
        return payload;
    }

    function setMessage(message, type) {
        formMessage.textContent = message || '';
        formMessage.classList.toggle('is-success', type === 'success');
        formMessage.classList.toggle('is-error', type === 'error');
    }

    function setBusy(isBusy) {
        submitBtn.disabled = Boolean(isBusy);
        const idleLabel = activeBookingId() ? 'Update booking request' : 'Send booking request';
        submitBtn.querySelector('span').textContent = isBusy ? (activeBookingId() ? 'Updating request' : 'Sending request') : idleLabel;
        syncStatus.textContent = isBusy ? 'Sending' : 'Ready';
    }

    function clearFieldErrors() {
        form.querySelectorAll('.field-shell.has-error').forEach((field) => field.classList.remove('has-error'));
    }

    function markError(input) {
        const shell = input && input.closest('.field-shell');
        if (shell) shell.classList.add('has-error');
    }

    function validate() {
        clearFieldErrors();
        const errors = [];
        if (!cleanText(fields.pickup.value, 180)) {
            errors.push('Pickup is required');
            markError(fields.pickup);
        }
        if (!cleanText(fields.drop.value, 180)) {
            errors.push('Drop is required');
            markError(fields.drop);
        }
        if (!fields.rideDate.value) {
            errors.push('Date is required');
            markError(fields.rideDate);
        }
        if (!fields.rideTime.value) {
            errors.push('Time is required');
            markError(fields.rideTime);
        }
        if (!normalizePhone(fields.phone.value)) {
            errors.push('Valid mobile number is required');
            markError(fields.phone);
        }
        if (state.journey === 'round_trip' && !fields.returnDate.value) {
            errors.push('Return date is required');
            markError(fields.returnDate);
        }
        if (fields.email && fields.email.value && !normalizeEmail(fields.email.value)) {
            errors.push('Valid email is required');
            markError(fields.email);
        }
        return errors;
    }

    function updateWhatsAppLink(booking) {
        const pickup = booking ? booking.pickup : cleanText(fields.pickup.value, 120);
        const drop = booking ? booking.drop : cleanText(fields.drop.value, 120);
        const fare = booking ? booking.totalFare : (state.lastFare && state.lastFare.totalFare);
        const text = [
            'I want to book a GO India RIDE cab.',
            pickup ? `Pickup: ${pickup}` : '',
            drop ? `Drop: ${drop}` : '',
            fields.rideDate.value ? `Date: ${fields.rideDate.value}` : '',
            fields.rideTime.value ? `Time: ${fields.rideTime.value}` : '',
            fare ? `Estimated fare: ${formatMoney(fare)}` : ''
        ].filter(Boolean).join('\n');
        whatsAppBookingLink.href = `https://wa.me/${ADMIN_PHONE}?text=${encodeURIComponent(text)}`;
    }

    function findBookingById(bookingId) {
        const safeId = cleanText(bookingId, 120).toUpperCase();
        if (!safeId) return null;
        for (const key of [ADMIN_REVIEW_KEY, ...STORE_KEYS]) {
            const found = readArray(key).find((item) => cleanText(item.bookingId || item.id, 120).toUpperCase() === safeId);
            if (found) return found;
        }
        return null;
    }

    function planConfig(plan) {
        return TRIP_PLAN_CONFIG[plan] || TRIP_PLAN_CONFIG.city;
    }

    function optionExists(input, value) {
        if (!input || input.tagName !== 'SELECT') return false;
        return Array.from(input.options || []).some((option) => option.value === value);
    }

    function setSelectOptions(input, options, preferredValue) {
        if (!input || input.tagName !== 'SELECT') return;
        const cleanPreferred = cleanText(preferredValue, 100);
        input.innerHTML = '';
        options.forEach((item) => {
            const option = document.createElement('option');
            option.value = item.value;
            option.textContent = item.label;
            input.appendChild(option);
        });
        if (cleanPreferred && optionExists(input, cleanPreferred)) {
            input.value = cleanPreferred;
            return;
        }
        input.value = options[0] ? options[0].value : '';
    }

    function selectLabel(input, value) {
        if (!input || input.tagName !== 'SELECT') return cleanText(value, 140);
        const clean = cleanText(value, 100);
        const match = Array.from(input.options || []).find((option) => option.value === clean);
        return cleanText(match ? match.textContent : clean, 160);
    }

    function checkedLabels(selector) {
        return Array.from(document.querySelectorAll(selector))
            .filter((input) => input.checked)
            .map((input) => cleanText(input.parentElement ? input.parentElement.textContent : input.dataset.addon || input.dataset.safety, 120))
            .filter(Boolean)
            .join(', ');
    }

    function defaultServiceModeForTripPlan(plan) {
        const config = planConfig(plan);
        return config.journeyModes[state.journey] || (config.serviceModes[0] && config.serviceModes[0].value) || '';
    }

    function renderTripPlanDetail(config) {
        if (!tripPlanDetail.shell) return;
        tripPlanDetail.kicker.textContent = config.kicker;
        tripPlanDetail.title.textContent = config.title;
        tripPlanDetail.copy.textContent = config.copy;
        tripPlanDetail.points.innerHTML = '';
        config.points.forEach((point) => {
            const item = document.createElement('span');
            item.className = 'trip-plan-point';
            item.innerHTML = '<i class="fas fa-check" aria-hidden="true"></i>';
            const text = document.createElement('span');
            text.textContent = point;
            item.appendChild(text);
            tripPlanDetail.points.appendChild(item);
        });
    }

    function renderRouteSuggestions(config) {
        if (!routeSuggestions) return;
        routeSuggestions.innerHTML = '';
        config.suggestions.forEach((suggestion) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.pickup = suggestion.pickup;
            button.dataset.drop = suggestion.drop;
            button.textContent = suggestion.label;
            routeSuggestions.appendChild(button);
        });
    }

    function applyPlanLabels(config) {
        const labelMap = [
            [fields.pickup, config.labels.pickup, config.placeholders.pickup],
            [fields.drop, config.labels.drop, config.placeholders.drop],
            [fields.notes, config.labels.notes, config.placeholders.notes],
            [fields.terminal, null, config.placeholders.terminal],
            [fields.flight, null, config.placeholders.flight],
            [fields.stopOne, null, config.placeholders.stopOne],
            [fields.stopTwo, null, config.placeholders.stopTwo]
        ];
        labelMap.forEach(([input, label, placeholder]) => {
            if (!input) return;
            if (placeholder) input.placeholder = placeholder;
            if (label && input.previousElementSibling) input.previousElementSibling.textContent = label;
        });
    }

    function syncPlanControls(keepServiceMode = false) {
        const config = planConfig(state.tripPlan);
        setSelectOptions(fields.vehicleModel, VEHICLE_MODEL_OPTIONS, fields.vehicleModel && fields.vehicleModel.value);
        setSelectOptions(
            fields.serviceMode,
            config.serviceModes,
            keepServiceMode ? fields.serviceMode && fields.serviceMode.value : defaultServiceModeForTripPlan(state.tripPlan)
        );
        renderTripPlanDetail(config);
        renderRouteSuggestions(config);
        applyPlanLabels(config);
        form.dataset.tripPlan = state.tripPlan;
    }

    function setTripPlan(plan, keepServiceMode = false) {
        const cleanPlan = cleanText(plan, 40) || 'city';
        state.tripPlan = TRIP_PLAN_CONFIG[cleanPlan] ? cleanPlan : 'city';
        document.querySelectorAll('.service-tab').forEach((tab) => {
            const active = tab.dataset.tripPlan === state.tripPlan;
            tab.classList.toggle('is-active', active);
            tab.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        syncPlanControls(keepServiceMode);
    }

    function setJourney(journey, keepServiceMode = false) {
        state.journey = cleanText(journey, 40) || 'one_way';
        document.querySelectorAll('.journey-btn').forEach((tab) => {
            const active = tab.dataset.journey === state.journey;
            tab.classList.toggle('is-active', active);
            tab.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        form.classList.toggle('is-round-trip', state.journey === 'round_trip');
        form.classList.toggle('is-multi-city', state.journey === 'multi_city');
        if (fields.serviceMode && !keepServiceMode) {
            fields.serviceMode.value = defaultServiceModeForTripPlan(state.tripPlan);
        }
        renderTripPlanDetail(planConfig(state.tripPlan));
    }

    function setVehicle(vehicleType) {
        state.vehicleType = cleanText(vehicleType, 40) || 'economy';
        document.querySelectorAll('.vehicle-card').forEach((card) => card.classList.toggle('is-active', card.dataset.vehicle === state.vehicleType));
    }

    function hasSelectOption(input, value) {
        if (!input || input.tagName !== 'SELECT') return true;
        return Array.from(input.options || []).some((option) => option.value === value);
    }

    function setFieldValue(input, value, maxLen) {
        if (!input) return false;
        const clean = cleanText(value, maxLen || 220);
        if (!clean) return false;
        if (!hasSelectOption(input, clean)) return false;
        input.value = clean;
        return true;
    }

    function parseStoredObject(value) {
        try {
            const parsed = JSON.parse(value || '{}');
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (_error) {
            return {};
        }
    }

    function readHomepageHandoff(params) {
        const handoffId = cleanText(params.get('handoffId'), 120);
        const source = cleanText(params.get('source'), 80);
        let cameFromHome = false;
        try {
            const referrer = document.referrer ? new URL(document.referrer) : null;
            cameFromHome = Boolean(referrer && referrer.origin === window.location.origin && /^\/(?:index\.html)?$/i.test(referrer.pathname || '/'));
        } catch (_error) {
            cameFromHome = false;
        }
        const mayUseStored = Boolean(handoffId || source.startsWith('home_') || cameFromHome);
        const stores = [];
        try {
            stores.push(parseStoredObject(sessionStorage.getItem(HOME_BOOKING_HANDOFF_KEY)));
            stores.push(parseStoredObject(localStorage.getItem(HOME_BOOKING_HANDOFF_KEY)));
        } catch (_error) {
            // Storage can be unavailable in privacy mode.
        }
        const now = Date.now();
        return stores.find((item) => {
            if (!item || typeof item !== 'object') return false;
            if (item.expiresAt && Number(item.expiresAt) < now) return false;
            if (handoffId) return cleanText(item.handoffId, 120) === handoffId;
            return mayUseStored && cleanText(item.source, 80).startsWith('home_');
        }) || {};
    }

    function applyHomepagePrefillFromUrl() {
        const params = new URLSearchParams(window.location.search || '');
        const handoff = readHomepageHandoff(params);
        const getPrefill = (key) => params.get(key) || handoff[key] || '';
        const prefillKeys = [
            'source',
            'handoffId',
            'tripPlan',
            'journey',
            'serviceMode',
            'vehicleType',
            'vehicleModel',
            'pickup',
            'drop',
            'phone',
            'customerPhone',
            'name',
            'customerName',
            'email',
            'customerEmail',
            'rideDate',
            'rideTime',
            'returnDate',
            'returnTime',
            'passengers',
            'luggage',
            'paymentMethod',
            'budget',
            'promo',
            'notes'
        ];
        if (!prefillKeys.some((key) => params.has(key) || cleanText(handoff[key], 300))) return false;

        const tripPlan = cleanText(getPrefill('tripPlan'), 40);
        const journey = cleanText(getPrefill('journey'), 40);
        const vehicleType = cleanText(getPrefill('vehicleType'), 40);
        if (tripPlan) setTripPlan(tripPlan, true);
        if (journey) setJourney(journey);
        if (vehicleType) setVehicle(vehicleType);

        setFieldValue(fields.serviceMode, getPrefill('serviceMode'), 80);
        setFieldValue(fields.vehicleModel, getPrefill('vehicleModel'), 80);
        setFieldValue(fields.pickup, getPrefill('pickup'), 180);
        setFieldValue(fields.drop, getPrefill('drop'), 180);
        setFieldValue(fields.phone, getPrefill('phone') || getPrefill('customerPhone'), 40);
        setFieldValue(fields.name, getPrefill('name') || getPrefill('customerName'), 140);
        setFieldValue(fields.email, getPrefill('email') || getPrefill('customerEmail'), 180);
        setFieldValue(fields.rideDate, getPrefill('rideDate'), 40);
        setFieldValue(fields.rideTime, getPrefill('rideTime'), 40);
        setFieldValue(fields.returnDate, getPrefill('returnDate'), 40);
        setFieldValue(fields.returnTime, getPrefill('returnTime'), 40);
        setFieldValue(fields.passengers, getPrefill('passengers'), 20);
        setFieldValue(fields.luggage, getPrefill('luggage'), 80);
        setFieldValue(fields.payment, getPrefill('paymentMethod'), 80);
        setFieldValue(fields.budget, getPrefill('budget'), 40);
        setFieldValue(fields.promo, getPrefill('promo'), 40);
        setFieldValue(fields.notes, getPrefill('notes'), 300);

        if (state.journey === 'round_trip' && !fields.returnDate.value) {
            fields.returnDate.value = fields.rideDate.value || todayValue();
        }

        estimateFare();
        syncStatus.textContent = 'Prefilled';
        setMessage('Trip details prefilled from homepage. Add remaining details and send booking request.', 'success');
        return true;
    }

    function writeCheckboxMap(selector, values = {}) {
        document.querySelectorAll(selector).forEach((input) => {
            const key = cleanText(input.dataset.addon || input.dataset.safety || '', 60);
            if (!key) return;
            input.checked = values[key] === true;
        });
    }

    function setEditMode(booking) {
        const bookingId = cleanText(booking && (booking.bookingId || booking.id), 120).toUpperCase();
        state.editingBookingId = bookingId;
        state.editOriginal = bookingId ? { ...booking, bookingId } : null;
        form.classList.toggle('is-editing', Boolean(bookingId));
        if (fields.manageBooking && bookingId) fields.manageBooking.value = bookingId;
        setBusy(false);
    }

    function clearEditMode() {
        state.editingBookingId = '';
        state.editOriginal = null;
        form.classList.remove('is-editing');
        if (fields.manageBooking) fields.manageBooking.value = '';
        if (fields.editReason) fields.editReason.value = '';
        setBusy(false);
        syncStatus.textContent = 'Ready';
    }

    function populateFormFromBooking(booking) {
        if (!booking) return false;
        const pickup = cleanText(booking.pickup || booking.pickupLocation || booking.from, 180);
        const drop = cleanText(booking.dropoff || booking.drop || booking.dropLocation || booking.to, 180);
        const returnEnabled = Boolean(booking.returnTrip?.enabled || booking.returnDate || booking.returnTime);
        const stops = Array.isArray(booking.stops) && booking.stops.length
            ? booking.stops
            : (Array.isArray(booking.routeStopLocations) ? booking.routeStopLocations.map((item) => item.label || item.name || item).filter(Boolean) : []);
        const customer = booking.customerSnapshot || {};
        const features = booking.customerFeatures || {};
        const travel = booking.travelAssurance || features.travelAssurance || {};
        const policy = booking.policyPreferences || travel.policyPreferences || {};
        const desiredVehicleModel = cleanText(booking.vehicleModel, 80);
        const desiredServiceMode = cleanText(booking.tripServiceType || booking.serviceType || booking.airportServiceMode, 80);
        const bookingTripPlan = cleanText(booking.tripPlan, 40) || 'city';
        const bookingJourney = cleanText(booking.journeyType, 40) || (stops.length ? 'multi_city' : (returnEnabled ? 'round_trip' : 'one_way'));
        fields.pickup.value = pickup;
        fields.drop.value = drop;
        fields.rideDate.value = cleanText(booking.rideDate, 40) || fields.rideDate.value;
        fields.rideTime.value = cleanText(booking.rideTime, 40) || fields.rideTime.value;
        fields.returnDate.value = cleanText(booking.returnDate || booking.returnTrip?.returnDate, 40);
        fields.returnTime.value = cleanText(booking.returnTime || booking.returnTrip?.returnTime, 40);
        fields.stopOne.value = cleanText(stops[0], 160);
        fields.stopTwo.value = cleanText(stops[1], 160);
        fields.name.value = cleanText(booking.customerName || customer.name, 140);
        fields.phone.value = cleanText(booking.customerPhone || customer.phone, 40);
        fields.email.value = cleanText(booking.customerEmail || customer.email, 180);
        fields.passengers.value = String(Math.max(1, Math.min(6, toNumber(booking.passengers, 1))));
        fields.luggage.value = cleanText(booking.luggage, 80) || 'none';
        fields.payment.value = cleanText(booking.paymentMethod || booking.payment?.method, 80) || 'cash';
        fields.budget.value = cleanText(booking.budgetAmount || booking.customerBidAmount || '', 40);
        fields.promo.value = cleanText(booking.promoCode || booking.referralCode || booking.promo?.code || '', 40);
        fields.notes.value = cleanText(booking.notes, 300);
        fields.terminal.value = cleanText(booking.airportTerminalNote || booking.flightDetails?.terminal || travel.flightDetails?.terminal || features.airportTerminalNote, 120);
        fields.flight.value = cleanText(booking.flightDetails?.flightNumber || travel.flightDetails?.flightNumber, 80);
        fields.airline.value = cleanText(booking.flightDetails?.airlineName || travel.flightDetails?.airlineName, 120);
        fields.meetGreet.value = cleanText(booking.flightDetails?.meetAndGreetName || travel.flightDetails?.meetAndGreetName, 120);
        fields.waitingBuffer.value = cleanText(policy.waitingBuffer, 80) || fields.waitingBuffer.value;
        fields.reschedule.value = cleanText(policy.rescheduleWindow, 80) || fields.reschedule.value;
        fields.cancellation.value = cleanText(policy.cancellationPreference, 80) || fields.cancellation.value;
        fields.driverCall.value = cleanText(policy.driverCallPreference, 80) || fields.driverCall.value;
        fields.fuelPreference.value = cleanText(booking.vehicleFuelPreference || booking.fuelPreference || features.vehicleFuelPreference, 80);
        fields.gstCompany.value = cleanText(booking.billingDetails?.gstCompanyName || travel.billingDetails?.gstCompanyName, 140);
        fields.gstNumber.value = cleanText(booking.billingDetails?.gstNumber || travel.billingDetails?.gstNumber, 40);
        writeCheckboxMap('[data-addon]', booking.bookingAddOns || travel.addOns || features.addOns || {});
        writeCheckboxMap('[data-safety]', booking.safetyAccessibility || features.safetyAccessibility || {});
        setTripPlan(bookingTripPlan, true);
        setJourney(bookingJourney, true);
        setFieldValue(fields.vehicleModel, desiredVehicleModel, 80);
        setFieldValue(fields.serviceMode, desiredServiceMode, 80);
        setVehicle(cleanText(booking.vehicleType || booking.rideType, 40) || 'economy');
        setEditMode(booking);
        estimateFare();
        return true;
    }

    function loadBookingForEdit() {
        const requestedId = cleanText(fields.manageBooking && fields.manageBooking.value, 120).toUpperCase();
        const booking = findBookingById(requestedId);
        if (!booking) {
            setMessage('Booking reference not found on this device. Use the same browser or submit a fresh request.', 'error');
            return;
        }
        populateFormFromBooking(booking);
        setMessage(`Booking ${requestedId} loaded for customer edit.`, 'success');
    }

    function resetForNewBooking() {
        form.reset();
        clearEditMode();
        setTripPlan('airport');
        setJourney('one_way');
        setVehicle('economy');
        const today = todayValue();
        fields.rideDate.min = today;
        fields.returnDate.min = today;
        fields.rideDate.value = today;
        fields.rideTime.value = defaultTimeValue();
        setMessage('', '');
        estimateFare();
    }

    async function submitBooking(event) {
        event.preventDefault();
        const errors = validate();
        if (errors.length) {
            setMessage(errors[0], 'error');
            syncStatus.textContent = 'Check form';
            return;
        }

        setBusy(true);
        setMessage('', '');
        const isEdit = Boolean(activeBookingId());
        const booking = buildBookingPayload(activeBookingId());
        persistBooking(booking);
        updateWhatsAppLink(booking);

        setBusy(false);
        syncStatus.textContent = 'Saved';
        fields.manageBooking.value = booking.bookingId;
        setEditMode(booking);
        setMessage(
            isEdit
                ? `Booking ${booking.bookingId} edit is saved. Admin sync is running in background.`
                : `Booking ${booking.bookingId} received. Admin sync is running in background.`,
            'success'
        );
        window.setTimeout(() => {
            syncBookingInBackground(booking, isEdit).catch(() => {
                if (activeBookingId() === booking.bookingId) syncStatus.textContent = 'Saved';
            });
        }, 0);
    }

    function wireTabs() {
        document.querySelectorAll('.service-tab').forEach((button) => {
            button.addEventListener('click', () => {
                setTripPlan(button.dataset.tripPlan || 'city');
                estimateFare();
            });
        });

        document.querySelectorAll('.journey-btn').forEach((button) => {
            button.addEventListener('click', () => {
                setJourney(button.dataset.journey || 'one_way');
                if (state.journey === 'round_trip' && !fields.returnDate.value) {
                    fields.returnDate.value = fields.rideDate.value || todayValue();
                }
                estimateFare();
            });
        });

        document.querySelectorAll('.vehicle-card').forEach((button) => {
            button.addEventListener('click', () => {
                setVehicle(button.dataset.vehicle || 'economy');
                estimateFare();
            });
        });

        if (routeSuggestions) {
            routeSuggestions.addEventListener('click', (event) => {
                const button = event.target && event.target.closest ? event.target.closest('button') : null;
                if (!button || !routeSuggestions.contains(button)) return;
                fields.pickup.value = button.dataset.pickup || '';
                fields.drop.value = button.dataset.drop || '';
                estimateFare();
            });
        }
    }

    function wireManageButtons() {
        if (loadBookingBtn) loadBookingBtn.addEventListener('click', loadBookingForEdit);
        if (newBookingBtn) newBookingBtn.addEventListener('click', resetForNewBooking);
        document.querySelectorAll('[data-addon], [data-safety]').forEach((input) => {
            input.addEventListener('change', estimateFare);
        });
    }

    function wireLocationButton() {
        const button = document.getElementById('useLocationBtn');
        if (!button) return;
        button.addEventListener('click', () => {
            if (!navigator.geolocation) {
                setMessage('Current location is not available in this browser.', 'error');
                return;
            }
            button.disabled = true;
            navigator.geolocation.getCurrentPosition((position) => {
                const lat = Number(position.coords.latitude || 0).toFixed(5);
                const lng = Number(position.coords.longitude || 0).toFixed(5);
                fields.pickup.value = `Current location (${lat}, ${lng})`;
                button.disabled = false;
                estimateFare();
            }, () => {
                button.disabled = false;
                setMessage('Location permission was not allowed.', 'error');
            }, {
                enableHighAccuracy: true,
                timeout: 9000,
                maximumAge: 120000
            });
        });
    }

    function initDefaults() {
        const today = todayValue();
        fields.rideDate.min = today;
        fields.returnDate.min = today;
        fields.rideDate.value = fields.rideDate.value || today;
        fields.rideTime.value = fields.rideTime.value || defaultTimeValue();
        setTripPlan(state.tripPlan, true);
        setJourney(state.journey, true);
        setVehicle(state.vehicleType);
        Object.values(fields).forEach((input) => {
            if (input) input.addEventListener('input', estimateFare);
            if (input && input.tagName === 'SELECT') input.addEventListener('change', estimateFare);
        });
        estimateFare();
    }

    wireTabs();
    wireManageButtons();
    wireLocationButton();
    initDefaults();
    applyHomepagePrefillFromUrl();
    form.addEventListener('submit', submitBooking);
})();
