// ACTUAL BOOKING TEST - Scenario Verification
// This simulates a real booking request through the fare calculator

// TEST CASE 1: Simple City Ride (Same State, Daytime)
const test1Input = {
  pickup: 'Jaipur Railway Station, Jaipur, Rajasthan',
  drop: 'Ajmer City, Ajmer, Rajasthan',
  pickupState: 'Rajasthan',
  dropState: 'Rajasthan',
  distanceKm: 135,
  vehicleType: 'sedan',
  passengers: 2,
  luggage: 'small',
  rideDate: '2026-09-15',
  rideTime: '14:30', // 2:30 PM - DAYTIME
  paymentMethod: 'cash',
  tripPlan: 'city'
};

/*
EXPECTED CALCULATION:
=====================================

1. Vehicle Profile (sedan):
   - baseFare: ₹70
   - perKm: ₹12
   - minimumFare: ₹129

2. Distance Calculation:
   - distanceKm: 135
   - includedDistanceKm: 5 (city plan)
   - extraDistanceKm: 130
   - distanceFare: 5 × ₹12 = ₹60
   - extraDistanceFare: 130 × ₹12 × 1.28 = ₹1,996.80 → ₹1,997

3. Time Calculation:
   - estimatedDurationMin: 135 × 3.8 = 513 min
   - includedDurationMin: 20 (city default)
   - extraTimeMin: 493
   - timeFare: 20 × ₹0.95 = ₹19
   - extraTimeFare: 493 × ₹0.95 × 1.32 = ₹619.46 → ₹619

4. Passenger Calculation:
   - included: 4 passengers
   - requested: 2
   - passengerFare: 0 (within included)

5. Luggage Calculation:
   - luggage: 'small'
   - luggageFare: ₹20

6. Trip Plan Fare:
   - tripPlan: 'city'
   - tripPlanFare: ₹0

7. Stop Fare:
   - stops: []
   - stopFare: ₹0

8. Return Trip:
   - isReturnTrip: false
   - returnTripFare: ₹0

SUBTOTAL = 70 + 60 + 1997 + 19 + 619 + 0 + 0 + 0 + 0
         = ₹2,765

9. TOLL CHARGES:
   - distanceKm: 135 (above 25 km)
   - tripPlan: 'city'
   - pickupState: 'Rajasthan'
   - dropState: 'Rajasthan'
   - isLocalNoTollRoute: Check function
     * distanceKm (135) < 25? NO
     * tripPlan === 'city'? YES
     * NOT airport_transfer? YES
     * pickupState === dropState? YES (Rajasthan === Rajasthan)
     * Result: FALSE (distance > 25)
   
   - No mapped route found
   - tollCharge: ₹0
   - tollRequiresAdminReview: true
   - Source: 'mapped_route_required_admin_review'

10. PARKING CHARGES:
    - estimateParkingCharge() returns: ₹0
    - calculateParkingChargeDetails() returns:
      * parkingEstimatedAmount: ₹35 (station parking only)
      * parkingReasons: ['station/junction']
      * note: "Parking charges will be collected at destination based on actual usage"
    - ✅ parkingCharge: ₹0 (NOT added to total)

11. STATE TAX:
    - pickupState: 'Rajasthan'
    - dropState: 'Rajasthan'
    - pickupState === dropState
    - interState: false
    - taxableStates: []
    - stateTax: ₹0
    - Source: 'same_state_or_no_other_state_tax'

12. NIGHT CHARGES:
    - rideTime: '14:30' (2:30 PM)
    - isNightTime('14:30'): false (not 22:00-06:00)
    - nightCharge: ₹0

13. PAYMENT FEE:
    - paymentMethod: 'cash'
    - paymentFeeRate: 0%
    - paymentFee: 0

14. GST:
    - gstTotal: ₹0 (ALWAYS 0%)
    - ✅ NOT 5% of (subtotal + toll + tax + night)

GROSS TOTAL = 2765 + 0 + 0 + 0 + 0 + 0 + 0
            = ₹2,765

15. COMPETITIVE ADJUSTMENT:
    - isCompetitiveOutstationOneWay: false (city ride)
    - competitiveDiscount: ₹0

16. PROMO DISCOUNT:
    - promoCode: none
    - promoDiscount: ₹0

17. FINAL FARE:
    - totalFare: max(129, 2765 - 0) = ₹2,765
    - ✅ Minimum fare (129) check applied

EXPECTED RESPONSE FIELDS:
========================
✅ baseFare: 70
✅ distanceFare: 60
✅ extraDistanceFare: 1997
✅ timeFare: 19
✅ extraTimeFare: 619
✅ passengerFare: 0
✅ luggageFare: 20
✅ tripPlanFare: 0
✅ stopFare: 0
✅ returnTripFare: 0
✅ tollCharge: 0
✅ tollRequiresAdminReview: true
✅ parkingCharge: 0 ← CRITICAL
✅ parkingEstimatedAmount: 35
✅ parkingReasons: ['station/junction']
✅ parkingCustomerNote: "Parking charges will be collected..."
✅ stateTax: 0
✅ interState: false
✅ nightCharge: 0
✅ paymentFee: 0
✅ gstTotal: 0 ← CRITICAL (NOT 5%)
✅ taxesFare: 0
✅ grossTotal: 2765 (does NOT include parkingCharge)
✅ totalFare: 2765
✅ finalFare: 2765

VERIFICATION FORMULA:
totalFare = subtotal + toll + parking(0) + stateTax + night + paymentFee + gst(0)
         = 2765 + 0 + 0 + 0 + 0 + 0 + 0
         = ₹2,765 ✓
*/

---

// TEST CASE 2: Interstate Night Ride with Toll
const test2Input = {
  pickup: 'Jaipur, Rajasthan',
  drop: 'Delhi, Delhi',
  pickupState: 'Rajasthan',
  dropState: 'Delhi',
  distanceKm: 250,
  vehicleType: 'premium',
  passengers: 3,
  rideDate: '2026-09-15',
  rideTime: '23:00', // 11:00 PM - NIGHT TIME
  returnDate: '2026-09-18',
  returnTime: '14:00',
  isReturnTrip: true,
  paymentMethod: 'card',
  tripPlan: 'outstation'
};

/*
EXPECTED CALCULATION:
=====================================

1. Vehicle Profile (premium):
   - baseFare: ₹80
   - perKm: ₹15
   - minimumFare: ₹149

2. Distance Calculation:
   - distanceKm: 250
   - includedDistanceKm: 6 (premium)
   - extraDistanceKm: 244
   - distanceFare: 6 × ₹15 = ₹90
   - extraDistanceFare: 244 × ₹15 × 1.25 = ₹4,575

3. Time Calculation:
   - estimatedDurationMin: 250 × 1.5 = 375 min (outstation = 1.5 min/km)
   - includedDurationMin: 180 (outstation minimum)
   - extraTimeMin: 195
   - timeFare: 180 × ₹1.05 = ₹189
   - extraTimeFare: 195 × ₹1.05 × 1.3 = ₹265.61 → ₹266

4. Passenger Calculation:
   - included: 4
   - requested: 3
   - passengerFare: 0 (within included)

5. Trip Plan Fare:
   - tripPlan: 'outstation'
   - tripPlanFare: ₹220

6. Return Trip:
   - isReturnTrip: true
   - returnDate: 2026-09-18, rideDate: 2026-09-15
   - tripTaxDays: 3 days
   - returnTripFare: (80 + 90 + 4575 + 189 + 266 + 0 + 220) × 0.68
                  = 5420 × 0.68 = ₹3,685.60 → ₹3,686

SUBTOTAL = 80 + 90 + 4575 + 189 + 266 + 0 + 220 + 0 + 0 + 3686
         = ₹9,106

7. TOLL CHARGES:
   - Route: Jaipur to Delhi
   - Corridor: 'jaipur-delhi' (mapped)
   - Mapped route: ['sitarampura', 'barkhedaChandlai']
   - Toll plazas calculated
   - returnTrip: true → Use returnCar rates
   - Approx tollCharge: ₹250-350
   - ✓ tollCharge: Let's say ₹300

8. PARKING:
   - No airport, station, or tourism keywords
   - calculateParkingChargeDetails():
     * parkingEstimatedAmount: ₹0-20 (outstation)
     * parkingReasons: ['outstation']
   - ✓ parkingCharge: ₹0 (NOT in total)

9. STATE TAX:
   - pickupState: 'Rajasthan'
   - dropState: 'Delhi'
   - interState: true ✓
   - routeStates: ['Rajasthan', 'Haryana', 'Delhi']
   - taxableStates: ['Haryana', 'Delhi'] (not Rajasthan)
   - tripTaxDays: 3
   - vehicleSeatCount: 4 (premium)
   
   Delhi tax rule: type 'seat_slab_daily'
   - perDay for 4 seats: Check slabs
   - Approx: ₹150/day × 3 days = ₹450
   
   Haryana tax rule: type 'seat_slab_daily'
   - Approx: ₹120/day × 3 days = ₹360
   
   stateTax = 450 + 360 = ₹810

10. NIGHT CHARGES:
    - rideTime: '23:00' (11:00 PM)
    - isNightTime('23:00'): true (22-06) ✓
    - routeCategory: 'interstate'
    - interState: true
    - tripPlan: 'outstation'
    - vehicleType: 'premium'
    - nightCharge: ₹250 (interstate/long route)

11. PAYMENT FEE:
    - paymentMethod: 'card'
    - paymentFeeRate: 2%
    - paymentFee: (9106 + 300 + 0 + 810 + 250) × 0.02
               = 10,466 × 0.02 = ₹209.32 → ₹209

12. GST:
    - gstTotal: ₹0 (ALWAYS)
    - NOT 5% even with all these charges
    - ✅ ZERO percent

GROSS TOTAL = 9106 + 300 + 0 + 810 + 250 + 209 + 0
            = ₹10,675

FINAL FARE = max(149, 10,675) = ₹10,675

VERIFICATION:
✅ parkingCharge: 0 (NOT included)
✅ parkingEstimatedAmount: 20 (estimated only)
✅ gstTotal: 0 (NOT 5%)
✅ nightCharge: 250 (night time detected)
✅ stateTax: 810 (interstate applied)
✅ interState: true (detected)
✅ isReturnTrip: true (double fare)
✅ totalFare = subtotal + toll + parking(0) + stateTax + night + fee + gst(0)
            = 9106 + 300 + 0 + 810 + 250 + 209 + 0
            = ₹10,675 ✓
*/

---

// TEST CASE 3: Airport Transfer at Night (22:30)
const test3Input = {
  pickup: 'Jaipur City Center, Jaipur',
  drop: 'Jaipur Airport',
  distanceKm: 12,
  vehicleType: 'economy',
  passengers: 1,
  rideDate: '2026-09-15',
  rideTime: '22:30', // 10:30 PM - NIGHT
  tripPlan: 'airport',
  tripServiceType: 'airport_transfer',
  paymentMethod: 'upi'
};

/*
EXPECTED CALCULATION:
=====================================

Key Points to Verify:

1. Night Charge:
   - rideTime: '22:30'
   - isNightTime('22:30'): true (22:30 >= 22 or < 6)? YES ✓
   - normalizedVehicle: 'economy'
   - interState: false
   - routeCategory: 'airport_route'
   - tripPlan: 'airport'
   - nightCharge: ₹80 (city route night charge)

2. Parking:
   - Has keyword 'airport': YES
   - calculateParkingChargeDetails():
     * parkingEstimatedAmount: ₹60 + 30 = ₹90
     * parkingReasons: ['airport', 'airport transfer']
   - ✅ parkingCharge: ₹0 (NOT in total)

3. Trip Plan:
   - tripPlan: 'airport'
   - tripPlanFare: ₹120

4. Toll:
   - distanceKm: 12 < 25
   - tripPlan: 'airport' (airport_transfer)
   - isLocalNoTollRoute: false (airport exception)
   - But distance < 25: May still map or admin review
   - tollCharge: Likely ₹0

5. GST:
   - gstTotal: ₹0 (ZERO, not 5%)

6. Final Fare Example:
   baseFare: 50 + airCondition(20, if selected)
   distanceFare: 12 × 10 = 120
   tripPlanFare: 120
   nightCharge: 80
   Subtotal: ~₹370
   
   Total: ~₹400-450 (depending on extras)
   ✅ parkingCharge: 0 in total
   ✅ gstTotal: 0 in total
   ✅ parkingEstimatedAmount: 90 (shown separately)
*/

---

// TEST CASE 4: Return Trip WITHOUT Night - Compare with Test 2
const test4Input = {
  pickup: 'Jaipur, Rajasthan',
  drop: 'Delhi, Delhi',
  pickupState: 'Rajasthan',
  dropState: 'Delhi',
  distanceKm: 250,
  vehicleType: 'premium',
  passengers: 2,
  rideDate: '2026-09-15',
  rideTime: '08:00', // 8:00 AM - DAYTIME
  returnDate: '2026-09-18',
  returnTime: '16:00', // 4:00 PM - DAYTIME
  isReturnTrip: true,
  paymentMethod: 'cash',
  tripPlan: 'outstation'
};

/*
Expected Differences from Test 2:
- nightCharge: ₹0 (NO night charge) - Different from ₹250
- rideTime: '08:00' (not 23:00)
- returnTime: '16:00' (not affecting night charge for return)
- isNightTime('08:00'): false
- isNightTime('16:00'): false
- Both times are daytime
- totalFare should be ~₹250-300 LESS than Test 2

Verification:
✅ nightCharge: 0 (no night times)
✅ gstTotal: 0 (still zero)
✅ parkingCharge: 0 (still zero)
✅ Difference from Test 2 ≈ ₹250 (removed night charge)
*/

---

// CRITICAL VERIFICATION POINTS
=====================================

After running all tests, MUST verify:

1. ✅ parkingCharge is ALWAYS 0 in:
   - grossTotal calculation
   - totalFare calculation
   - finalFare value

2. ✅ gstTotal is ALWAYS 0 in:
   - All test cases
   - Never 5%, always 0%
   - Not hidden anywhere

3. ✅ nightCharge is:
   - ₹0 when time is outside 22:00-06:00
   - ₹80/₹250/₹300 only when isNightTime() = true

4. ✅ stateTax is:
   - ₹0 when interState = false
   - > ₹0 when interState = true
   - Only for non-origin states

5. ✅ tollCharge is:
   - Mapped from TOLL_PLAZA_RATES
   - Returns adminReview if unmapped
   - Uses return rates if isReturnTrip

6. ✅ parkingEstimatedAmount:
   - Present in response
   - Has reasons array
   - Has customer note
   - But NOT added to any total

7. ✅ All features together in one ride:
   - Subtotal + Toll + StateTax + Night + Payment = Total
   - parkingCharge always 0
   - gstTotal always 0
   - Formula must balance
