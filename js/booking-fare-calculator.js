(function initGoIndiaRideFareCalculator(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
    return;
  }

  root.GoIndiaRideFareCalculator = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function createGoIndiaRideFareCalculator(globalScope) {
  const PROMO_RULES = {
    RIDE50: { type: 'flat', value: 50, description: 'Flat INR 50 off on any ride' },
    SAVE10: { type: 'percent', value: 10, max: 250, description: '10% off up to INR 250' },
    AIRPORT100: { type: 'flat', value: 100, tripPlan: 'airport', description: 'Airport transfer flat INR 100 off' },
    GLOBAL15: { type: 'percent', value: 15, max: 400, paymentMethods: ['international_card', 'paypal'], description: '15% off for international payment methods' }
  };

  const VEHICLE_PROFILES = {
    economy: { baseFare: 50, perKm: 10, perMinute: 0.8, minimumFare: 99, includedPassengers: 2, passengerExtra: 20, includedDistanceKm: 5, includedDurationMin: 20, extraKmMultiplier: 1.3, extraTimeMultiplier: 1.4 },
    premium: { baseFare: 80, perKm: 15, perMinute: 1.05, minimumFare: 149, includedPassengers: 4, passengerExtra: 25, includedDistanceKm: 6, includedDurationMin: 25, extraKmMultiplier: 1.25, extraTimeMultiplier: 1.3 },
    xl: { baseFare: 110, perKm: 20, perMinute: 1.3, minimumFare: 199, includedPassengers: 6, passengerExtra: 30, includedDistanceKm: 8, includedDurationMin: 30, extraKmMultiplier: 1.2, extraTimeMultiplier: 1.25 },
    sedan: { baseFare: 70, perKm: 12, perMinute: 0.95, minimumFare: 129, includedPassengers: 4, passengerExtra: 20, includedDistanceKm: 5, includedDurationMin: 20, extraKmMultiplier: 1.28, extraTimeMultiplier: 1.32 },
    suv: { baseFare: 95, perKm: 18, perMinute: 1.2, minimumFare: 179, includedPassengers: 6, passengerExtra: 30, includedDistanceKm: 7, includedDurationMin: 25, extraKmMultiplier: 1.25, extraTimeMultiplier: 1.3 }
  };

  const TRIP_PLAN_FARES = {
    city: 0,
    airport: 120,
    outstation: 220,
    rental: 160
  };

  const LUGGAGE_FARES = {
    none: 0,
    small: 20,
    medium: 40,
    large: 60
  };

  const SPECIAL_REQUEST_FARES = {
    aircondition: 20,
    wifi: 10,
    charger: 10,
    music: 15
  };

  const SAFETY_FARES = {
    womendriverpref: 25,
    childseat: 45,
    wheelchairassist: 40,
    petfriendly: 35,
    livetripshare: 15,
    maskedcall: 10
  };

  const PAYMENT_FEE_RATES = {
    cash: 0,
    upi: 0,
    wallet: 0,
    card: 0.02,
    netbanking: 0.01,
    international_card: 0.035,
    paypal: 0.03
  };

  const STATE_KEYWORD_MAP = [
    ['Rajasthan', ['jaipur', 'jodhpur', 'udaipur', 'ajmer', 'kota', 'bikaner', 'jaisalmer', 'alwar', 'bharatpur', 'bhilwara', 'chittorgarh', 'churu', 'dausa', 'dholpur', 'dungarpur', 'hanumangarh', 'jalore', 'jhalawar', 'jhunjhunu', 'karauli', 'pali', 'rajsamand', 'sawai madhopur', 'tonk', 'sikar', 'sirohi', 'barmer', 'nagaur', 'pratapgarh', 'ganganagar', 'sriganganagar', 'sri ganganagar']],
    ['Delhi', ['delhi', 'new delhi', 'connaught place', 'karol bagh', 'dwarka', 'rohini']],
    ['Haryana', ['gurugram', 'gurgaon', 'faridabad', 'panipat', 'ambala', 'karnal', 'rohtak', 'sonipat']],
    ['Uttar Pradesh', ['agra', 'lucknow', 'kanpur', 'varanasi', 'prayagraj', 'noida', 'ghaziabad', 'mathura', 'meerut']],
    ['Madhya Pradesh', ['bhopal', 'indore', 'gwalior', 'jabalpur', 'ujjain']],
    ['Gujarat', ['ahmedabad', 'surat', 'vadodara', 'rajkot', 'bhavnagar', 'gandhinagar']],
    ['Punjab', ['chandigarh', 'ludhiana', 'amritsar', 'jalandhar', 'patiala', 'bathinda']],
    ['Himachal Pradesh', ['shimla', 'manali', 'dharamshala', 'kullu', 'solan']],
    ['Uttarakhand', ['dehradun', 'haridwar', 'rishikesh', 'nainital', 'mussoorie']],
    ['Maharashtra', ['mumbai', 'pune', 'nagpur', 'nashik', 'aurangabad', 'thane']],
    ['Karnataka', ['bangalore', 'bengaluru', 'mysore', 'mangalore', 'hubli', 'belgaum']],
    ['Tamil Nadu', ['chennai', 'coimbatore', 'madurai', 'salem', 'tiruchirappalli']],
    ['West Bengal', ['kolkata', 'howrah', 'durgapur', 'siliguri', 'asansol']],
    ['Kerala', ['thiruvananthapuram', 'kochi', 'kozhikode', 'thrissur', 'kollam']],
    ['Goa', ['panaji', 'margao', 'vasco da gama', 'mapusa', 'ponda']]
  ];

  const ROUTE_TOURISM_KEYWORDS = [
    'airport',
    'station',
    'fort',
    'palace',
    'temple',
    'museum',
    'market',
    'mall',
    'dargah',
    'lake',
    'garden',
    'safari',
    'dunes',
    'tourist'
  ];

  function sanitizeText(value, maxLen = 180) {
    return String(value || '')
      .replace(/[\u0000-\u001f<>]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLen);
  }

  function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function roundMoney(value) {
    return Math.max(0, Math.round(toNumber(value, 0)));
  }

  function normalizeKey(value) {
    return sanitizeText(value, 80).toLowerCase();
  }

  function extractFirstNumber(value) {
    const match = String(value || '').match(/([\d.]+)/);
    if (!match) return 0;
    return toNumber(match[1], 0);
  }

  function parseDistanceValue(value) {
    return extractFirstNumber(value);
  }

  function parseDurationMinutes(value) {
    const text = normalizeKey(value);
    if (!text) return 0;

    let total = 0;
    const hourMatch = text.match(/([\d.]+)\s*(?:h|hr|hrs|hour|hours)/);
    const minuteMatch = text.match(/([\d.]+)\s*(?:m|min|mins|minute|minutes)/);

    if (hourMatch) {
      total += toNumber(hourMatch[1], 0) * 60;
    }
    if (minuteMatch) {
      total += toNumber(minuteMatch[1], 0);
    }

    if (!total) {
      const genericHourMatch = text.match(/([\d.]+)\s*hour/);
      if (genericHourMatch) {
        total = toNumber(genericHourMatch[1], 0) * 60;
      }
    }

    if (!total) {
      const bareHours = text.match(/^([\d.]+)$/);
      if (bareHours) {
        total = toNumber(bareHours[1], 0) * 60;
      }
    }

    return Math.max(0, Math.round(total));
  }

  function hasAnyKeyword(text, keywords) {
    const normalized = normalizeKey(text);
    return keywords.some((keyword) => normalized.includes(keyword));
  }

  function getGlobalStatesMap() {
    const states = globalScope && globalScope.locationsData && globalScope.locationsData.states;
    return states && typeof states === 'object' ? states : null;
  }

  function resolveStateName(text) {
    const normalized = normalizeKey(text);
    if (!normalized) return '';

    const states = getGlobalStatesMap();
    if (states) {
      for (const [stateName, cities] of Object.entries(states)) {
        const stateKey = normalizeKey(stateName);
        if (stateKey && normalized.includes(stateKey)) {
          return stateName;
        }
        if (Array.isArray(cities) && cities.some((city) => normalized.includes(normalizeKey(city)))) {
          return stateName;
        }
      }
    }

    for (const [stateName, keywords] of STATE_KEYWORD_MAP) {
      if (keywords.some((keyword) => normalized.includes(keyword))) {
        return stateName;
      }
    }

    return '';
  }

  function resolveRouteData(pickup, dropoff) {
    const routeFn = globalScope && typeof globalScope.getRouteSuggestions === 'function'
      ? globalScope.getRouteSuggestions
      : null;

    if (!routeFn) return null;

    try {
      return routeFn(pickup, dropoff) || null;
    } catch (_error) {
      return null;
    }
  }

  function normalizeVehicleType(rideType, vehicleModel) {
    const modelText = normalizeKey(vehicleModel);
    const rideText = normalizeKey(rideType);
    const combined = `${modelText} ${rideText}`.trim();

    if (hasAnyKeyword(combined, ['tempo', 'urbania', 'traveller', 'traveler', 'coach', 'bus', 'truck'])) return 'xl';
    if (hasAnyKeyword(combined, ['innova', 'crysta', 'hycross', 'ertiga', 'carens', 'rumion', 'suv', 'trax'])) return 'suv';
    if (hasAnyKeyword(combined, ['premium', 'sedan'])) return 'premium';
    if (hasAnyKeyword(combined, ['hatch', 'economy', 'ecco'])) return 'economy';
    if (hasAnyKeyword(combined, ['ambulance'])) return 'premium';

    if (['premium', 'xl', 'economy'].includes(rideText)) return rideText;
    return 'sedan';
  }

  function normalizeTripPlan(value) {
    const key = normalizeKey(value);
    if (['city', 'airport', 'outstation', 'rental'].includes(key)) return key;
    if (key.includes('airport')) return 'airport';
    if (key.includes('outstation') || key.includes('out station')) return 'outstation';
    if (key.includes('rent')) return 'rental';
    return 'city';
  }

  function normalizeServiceType(value) {
    const key = normalizeKey(value);
    if (!key) return 'airport_transfer';
    if (key.includes('railway')) return 'railway_station_transfer';
    if (key.includes('airport')) return 'airport_transfer';
    if (key.includes('city')) return 'city_local_trip';
    if (key.includes('round')) return 'round_trip_service';
    return key;
  }

  function normalizeLuggage(value) {
    const key = normalizeKey(value);
    if (['none', 'small', 'medium', 'large'].includes(key)) return key;
    if (key.includes('large')) return 'large';
    if (key.includes('medium')) return 'medium';
    if (key.includes('small')) return 'small';
    return 'none';
  }

  function normalizeBooleanMap(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.entries(value).reduce((acc, [key, raw]) => {
      if (raw) acc[normalizeKey(key)] = true;
      return acc;
    }, {});
  }

  function countEnabledValues(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
    return Object.values(value).reduce((acc, item) => acc + (item ? 1 : 0), 0);
  }

  function isNightTime(timeValue) {
    const text = normalizeKey(timeValue);
    const match = text.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return false;

    const hour = Math.max(0, Math.min(23, Number.parseInt(match[1], 10) || 0));
    return hour >= 22 || hour < 5;
  }

  function resolveVehicleProfile(vehicleType) {
    return VEHICLE_PROFILES[vehicleType] || VEHICLE_PROFILES.sedan;
  }

  function estimateDurationMinutes(distanceKm, tripPlan, serviceType, routeData) {
    const routeDuration = parseDurationMinutes(routeData && routeData.duration);
    if (routeDuration > 0) return routeDuration;

    const normalizedTripPlan = normalizeTripPlan(tripPlan);
    const normalizedServiceType = normalizeServiceType(serviceType);
    let minutesPerKm = 3.8;
    let minMinutes = 12;

    if (normalizedTripPlan === 'airport' || normalizedServiceType === 'airport_transfer') {
      minutesPerKm = 2.2;
      minMinutes = 25;
    } else if (normalizedTripPlan === 'outstation') {
      minutesPerKm = 1.5;
      minMinutes = 45;
    } else if (normalizedTripPlan === 'rental') {
      minutesPerKm = 3.2;
      minMinutes = 120;
    } else if (normalizedServiceType === 'railway_station_transfer') {
      minutesPerKm = 2.4;
      minMinutes = 20;
    } else if (normalizedServiceType === 'city_local_trip') {
      minutesPerKm = 4.0;
      minMinutes = 15;
    }

    return Math.max(minMinutes, Math.round(distanceKm * minutesPerKm));
  }

  function estimateTripPlanFare(tripPlan) {
    return TRIP_PLAN_FARES[normalizeTripPlan(tripPlan)] || 0;
  }

  function getIncludedDistanceKm(tripPlan, serviceType, vehicleProfile) {
    const plan = normalizeTripPlan(tripPlan);
    const service = normalizeServiceType(serviceType);
    const profileDistance = Math.max(0, roundMoney(vehicleProfile.includedDistanceKm || 0));

    if (plan === 'outstation') return Math.max(profileDistance, 120);
    if (plan === 'airport' || service === 'airport_transfer') return Math.max(profileDistance, 15);
    if (service === 'railway_station_transfer') return Math.max(profileDistance, 12);
    if (plan === 'rental') return Math.max(profileDistance, 40);
    return Math.max(profileDistance, 5);
  }

  function getIncludedDurationMin(tripPlan, serviceType, distanceKm, vehicleProfile, routeData) {
    const plan = normalizeTripPlan(tripPlan);
    const service = normalizeServiceType(serviceType);
    const routeDuration = parseDurationMinutes(routeData && routeData.duration);
    if (routeDuration > 0) {
      return Math.max(
        routeDuration,
        plan === 'outstation' ? 180 : 0
      );
    }

    const profileDuration = Math.max(0, roundMoney(vehicleProfile.includedDurationMin || 0));

    if (plan === 'outstation') return Math.max(profileDuration, 180, Math.round(distanceKm * 1.4));
    if (plan === 'airport' || service === 'airport_transfer') return Math.max(profileDuration, 35);
    if (service === 'railway_station_transfer') return Math.max(profileDuration, 25);
    if (plan === 'rental') return Math.max(profileDuration, 120);
    return Math.max(profileDuration, 20);
  }

  function estimatePassengerFare(passengers, vehicleProfile) {
    const count = Math.max(1, Math.min(20, Math.round(toNumber(passengers, 1) || 1)));
    const included = Math.max(1, Math.min(20, Math.round(vehicleProfile.includedPassengers || 2)));
    if (count <= included) return 0;
    return roundMoney((count - included) * vehicleProfile.passengerExtra);
  }

  function estimateLuggageFare(luggage) {
    return LUGGAGE_FARES[normalizeLuggage(luggage)] || 0;
  }

  function estimateSpecialRequestFare(specialRequests) {
    const map = normalizeBooleanMap(specialRequests);
    return roundMoney(
      Object.entries(SPECIAL_REQUEST_FARES).reduce((sum, [key, amount]) => sum + (map[key] ? amount : 0), 0)
    );
  }

  function estimateSafetyFare(safetyAccessibility) {
    const map = normalizeBooleanMap(safetyAccessibility);
    return roundMoney(
      Object.entries(SAFETY_FARES).reduce((sum, [key, amount]) => sum + (map[key] ? amount : 0), 0)
    );
  }

  function estimateExtraDistanceFare({
    distanceKm,
    tripPlan,
    serviceType,
    vehicleProfile
  }) {
    const includedDistanceKm = getIncludedDistanceKm(tripPlan, serviceType, vehicleProfile);
    const extraDistanceKm = Math.max(0, toNumber(distanceKm, 0) - includedDistanceKm);
    const distanceMultiplier = Math.max(1, toNumber(vehicleProfile.extraKmMultiplier || 1.25, 1.25));
    return {
      includedDistanceKm,
      extraDistanceKm: Math.max(0, Math.round(extraDistanceKm)),
      extraDistanceFare: roundMoney(extraDistanceKm * vehicleProfile.perKm * distanceMultiplier)
    };
  }

  function estimateExtraTimeFare({
    estimatedDurationMin,
    tripPlan,
    serviceType,
    distanceKm,
    vehicleProfile,
    routeData
  }) {
    const includedDurationMin = getIncludedDurationMin(tripPlan, serviceType, distanceKm, vehicleProfile, routeData);
    const extraTimeMin = Math.max(0, toNumber(estimatedDurationMin, 0) - includedDurationMin);
    const timeMultiplier = Math.max(1, toNumber(vehicleProfile.extraTimeMultiplier || 1.35, 1.35));
    return {
      includedDurationMin,
      extraTimeMin: Math.max(0, Math.round(extraTimeMin)),
      extraTimeFare: roundMoney(extraTimeMin * vehicleProfile.perMinute * timeMultiplier)
    };
  }

  function estimatePromoDiscount(grossTotal, promoCode, tripPlan, paymentMethod) {
    const code = normalizeKey(promoCode).toUpperCase();
    const rule = PROMO_RULES[code];
    if (!rule) return 0;

    if (rule.tripPlan && rule.tripPlan !== normalizeTripPlan(tripPlan)) {
      return 0;
    }
    if (Array.isArray(rule.paymentMethods) && !rule.paymentMethods.includes(normalizeKey(paymentMethod))) {
      return 0;
    }

    let discount = 0;
    if (rule.type === 'flat') {
      discount = rule.value;
    } else if (rule.type === 'percent') {
      discount = Math.round(grossTotal * (rule.value / 100));
    }

    if (rule.max) {
      discount = Math.min(discount, rule.max);
    }

    return Math.max(0, Math.min(discount, grossTotal));
  }

  function estimateTollCharge({
    distanceKm,
    pickup,
    dropoff,
    routeData,
    pickupState,
    dropState,
    tripPlan,
    serviceType
  }) {
    const combinedText = `${pickup} ${dropoff}`;
    const normalizedTripPlan = normalizeTripPlan(tripPlan);
    const normalizedServiceType = normalizeServiceType(serviceType);
    const routeKnown = Boolean(routeData);
    const distanceBand =
      distanceKm >= 500 ? 220 :
      distanceKm >= 300 ? 160 :
      distanceKm >= 150 ? 110 :
      distanceKm >= 75 ? 70 :
      distanceKm >= 25 ? 35 : 18;

    let toll = distanceBand;

    if (pickupState && dropState && pickupState !== dropState) {
      toll += 60;
    }
    if (routeKnown) {
      toll += 20;
    }
    if (hasAnyKeyword(combinedText, ['highway', 'express', 'nh', 'motorway'])) {
      toll += 35;
    }
    if (normalizedTripPlan === 'outstation') {
      toll += 20;
    }
    if (normalizedTripPlan === 'airport' || normalizedServiceType === 'airport_transfer') {
      toll += 15;
    }

    return roundMoney(toll);
  }

  function estimateParkingCharge({
    pickup,
    dropoff,
    routeData,
    stops,
    tripPlan,
    serviceType
  }) {
    const normalizedTripPlan = normalizeTripPlan(tripPlan);
    const normalizedServiceType = normalizeServiceType(serviceType);
    const routeText = `${pickup} ${dropoff}`;
    const stopCount = Array.isArray(stops) ? stops.filter((item) => sanitizeText(item, 180)).length : 0;
    const hasTourismRoute = Boolean(
      routeData && Array.isArray(routeData.highlights) && routeData.highlights.some((highlight) => {
        const text = `${highlight.type || ''} ${highlight.name || ''} ${highlight.description || ''}`;
        return hasAnyKeyword(text, ROUTE_TOURISM_KEYWORDS);
      })
    );

    let parking = 0;
    if (hasAnyKeyword(routeText, ['airport'])) parking += 60;
    if (hasAnyKeyword(routeText, ['station', 'junction'])) parking += 35;
    if (hasAnyKeyword(routeText, ['fort', 'palace', 'temple', 'museum', 'lake', 'market', 'mall', 'dargah'])) parking += 25;
    if (normalizedTripPlan === 'airport' || normalizedServiceType === 'airport_transfer') parking += 30;
    if (normalizedTripPlan === 'outstation') parking += 20;
    if (normalizedServiceType === 'railway_station_transfer') parking += 15;
    if (hasTourismRoute) parking += 20;
    if (stopCount > 0) parking += stopCount * 15;

    return roundMoney(parking);
  }

  function estimateOtherStateTax({
    pickupState,
    dropState,
    subtotal,
    tollCharge,
    parkingCharge,
    routeCategory,
    interState
  }) {
    if (!pickupState || !dropState || pickupState === dropState) {
      return 0;
    }

    const taxableBase = subtotal + tollCharge + parkingCharge;
    const interstateRate = interState || routeCategory === 'interstate' ? 0.075 : 0.06;
    return Math.max(150, roundMoney(taxableBase * interstateRate));
  }

  function estimateDriverNightBatta({
    rideTime,
    returnTime,
    subtotal,
    tollCharge,
    parkingCharge,
    stateTax,
    routeCategory,
    interState
  }) {
    const nightTrip = Boolean(isNightTime(rideTime) || isNightTime(returnTime));
    if (!nightTrip) return 0;
    const baseAmount = subtotal + tollCharge + parkingCharge + stateTax;
    const rate = interState || routeCategory === 'outstation' ? 0.1 : 0.08;
    return Math.max(80, roundMoney(baseAmount * rate));
  }

  function estimateBookingFare(rawInput = {}) {
    const pickup = sanitizeText(rawInput.pickup || rawInput.pickupLocation || rawInput.from || '', 180);
    const dropoff = sanitizeText(rawInput.drop || rawInput.dropoff || rawInput.dropLocation || rawInput.to || '', 180);
    const routeData = resolveRouteData(pickup, dropoff);
    const distanceSource = normalizeKey(rawInput.distanceSource || (routeData ? 'route_table' : 'manual')) || 'manual';
    const providedDistance = Math.max(0, toNumber(rawInput.distanceKm ?? rawInput.distance ?? 0));
    const routeDistanceKm = routeData ? parseDistanceValue(routeData.distance) : 0;
    const distanceKm = routeDistanceKm > 0 && (distanceSource === 'fallback' || distanceSource === 'route_table' || !providedDistance)
      ? routeDistanceKm
      : providedDistance || routeDistanceKm || 1;
    const vehicleType = normalizeVehicleType(rawInput.vehicleType || rawInput.rideType, rawInput.vehicleModel);
    const vehicleProfile = resolveVehicleProfile(vehicleType);
    const tripPlan = normalizeTripPlan(rawInput.tripPlan);
    const tripServiceType = normalizeServiceType(rawInput.tripServiceType || rawInput.serviceType);
    const passengers = Math.max(1, Math.min(20, Math.round(toNumber(rawInput.passengers, 1) || 1)));
    const luggage = normalizeLuggage(rawInput.luggage);
    const stops = Array.isArray(rawInput.stops)
      ? rawInput.stops.map((item) => sanitizeText(item, 180)).filter(Boolean)
      : [];
    const specialRequests = normalizeBooleanMap(rawInput.specialRequests);
    const safetyAccessibility = normalizeBooleanMap(rawInput.safetyAccessibility);
    const rideTime = sanitizeText(rawInput.rideTime, 40);
    const returnTime = sanitizeText(rawInput.returnTime, 40);
    const isReturnTrip = Boolean(rawInput.isReturnTrip || rawInput.returnTrip?.enabled || rawInput.returnDate || rawInput.returnTime);
    const promoCode = sanitizeText(rawInput.promoCode || rawInput.referralCode || '', 40).toUpperCase();
    const budgetAmount = Math.max(0, roundMoney(rawInput.budgetAmount ?? rawInput.customerBidAmount ?? rawInput.bidAmount ?? 0));
    const pickupState = resolveStateName(pickup);
    const dropState = resolveStateName(dropoff);
    const interState = Boolean(pickupState && dropState && pickupState !== dropState);

    const estimatedDurationMin = estimateDurationMinutes(distanceKm, tripPlan, tripServiceType, routeData);
    const baseFare = roundMoney(vehicleProfile.baseFare);
    const distancePackage = estimateExtraDistanceFare({
      distanceKm,
      tripPlan,
      serviceType: tripServiceType,
      vehicleProfile
    });
    const timePackage = estimateExtraTimeFare({
      estimatedDurationMin,
      tripPlan,
      serviceType: tripServiceType,
      distanceKm,
      vehicleProfile,
      routeData
    });
    const distanceFare = roundMoney(Math.min(distanceKm, distancePackage.includedDistanceKm) * vehicleProfile.perKm);
    const extraDistanceFare = distancePackage.extraDistanceFare;
    const timeFare = roundMoney(Math.min(estimatedDurationMin, timePackage.includedDurationMin) * vehicleProfile.perMinute);
    const extraTimeFare = timePackage.extraTimeFare;
    const passengerFare = estimatePassengerFare(passengers, vehicleProfile);
    const tripPlanFare = estimateTripPlanFare(tripPlan);
    const luggageFare = estimateLuggageFare(luggage);
    const extrasFare = estimateSpecialRequestFare(specialRequests);
    const safetyFare = estimateSafetyFare(safetyAccessibility);
    const stopFare = roundMoney(stops.length * 45);
    const returnTripFare = isReturnTrip
      ? roundMoney((baseFare + distanceFare + extraDistanceFare + timeFare + extraTimeFare + tripPlanFare + passengerFare + luggageFare) * 0.68)
      : 0;

    const routeCategory =
      interState ? 'interstate' :
      routeData ? 'known_route' :
      tripPlan === 'airport' ? 'airport_route' :
      tripPlan === 'outstation' ? 'long_route' :
      tripPlan === 'rental' ? 'rental_route' :
      'local_route';

    const subtotal = roundMoney(
      baseFare +
      distanceFare +
      extraDistanceFare +
      timeFare +
      extraTimeFare +
      passengerFare +
      tripPlanFare +
      luggageFare +
      extrasFare +
      safetyFare +
      stopFare +
      returnTripFare
    );

    const tollCharge = estimateTollCharge({
      distanceKm,
      pickup,
      dropoff,
      routeData,
      pickupState,
      dropState,
      tripPlan,
      serviceType: tripServiceType
    });

    const parkingCharge = estimateParkingCharge({
      pickup,
      dropoff,
      routeData,
      stops,
      tripPlan,
      serviceType: tripServiceType
    });

    const stateTax = estimateOtherStateTax({
      pickupState,
      dropState,
      subtotal,
      tollCharge,
      parkingCharge,
      routeCategory,
      interState
    });

    const nightCharge = estimateDriverNightBatta({
      rideTime,
      returnTime,
      subtotal,
      tollCharge,
      parkingCharge,
      stateTax,
      routeCategory,
      interState
    });

    const paymentMethod = normalizeKey(rawInput.paymentMethod || 'cash');
    const paymentFeeRate = PAYMENT_FEE_RATES[paymentMethod] || 0;
    const paymentFee = roundMoney((subtotal + tollCharge + parkingCharge + stateTax + nightCharge) * paymentFeeRate);
    const gstTotal = roundMoney((subtotal + tollCharge + parkingCharge + stateTax + nightCharge + paymentFee) * 0.05);
    const grossTotal = roundMoney(subtotal + tollCharge + parkingCharge + stateTax + nightCharge + paymentFee + gstTotal);
    const promoDiscount = estimatePromoDiscount(grossTotal, promoCode, tripPlan, paymentMethod);
    const totalFare = Math.max(
      vehicleProfile.minimumFare,
      roundMoney(grossTotal - promoDiscount)
    );
    const budgetGap = budgetAmount > 0 ? Math.round(budgetAmount - totalFare) : 0;
    const routeHighLevel = routeData && Array.isArray(routeData.highlights)
      ? routeData.highlights.filter((item) => item && item.name).slice(0, 4).map((item) => sanitizeText(item.name, 80))
      : [];

    return {
      vehicleType,
      vehicleModel: sanitizeText(rawInput.vehicleModel || '', 80),
      tripPlan,
      tripServiceType,
      distanceSource,
      routeCategory,
      routeHighlights: routeHighLevel,
      pickupState,
      dropState,
      interState,
      distanceKm: roundMoney(distanceKm),
      estimatedDurationMin,
      baseFare,
      distanceFare,
      timeFare,
      passengerFare,
      tripPlanFare,
      luggageFare,
      extrasFare,
      safetyFare,
      stopFare,
      returnTripFare,
      tollCharge,
      parkingCharge,
      stateTax,
      nightCharge,
      paymentFee,
      taxesFare: gstTotal,
      promoDiscount,
      grossTotal,
      totalFare,
      finalFare: totalFare,
      amount: totalFare,
      budgetAmount,
      customerBidAmount: budgetAmount,
      budgetGap,
      budgetStatus: budgetAmount > 0
        ? (budgetGap >= 0 ? 'meets_estimate' : 'below_estimate')
        : 'not_provided',
      includedDistanceKm: distancePackage.includedDistanceKm,
      extraDistanceKm: distancePackage.extraDistanceKm,
      extraDistanceFare,
      includedDurationMin: timePackage.includedDurationMin,
      extraTimeMin: timePackage.extraTimeMin,
      extraTimeFare,
      roundTripCharge: returnTripFare,
      driverNightBatta: nightCharge,
      otherStateTax: stateTax,
      promoCode,
      passengerCount: passengers,
      luggage,
      stops,
      specialRequests,
      safetyAccessibility,
      isReturnTrip,
      rideTime,
      returnTime,
      pickup,
      dropoff,
      calculatedAt: new Date().toISOString()
    };
  }

  return {
    estimateBookingFare,
    parseDistanceValue,
    parseDurationMinutes,
    normalizeVehicleType,
    normalizeTripPlan,
    normalizeServiceType,
    normalizeLuggage
  };
});
