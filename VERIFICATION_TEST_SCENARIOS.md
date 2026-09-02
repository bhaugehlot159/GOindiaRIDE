# Fare Calculator - End-to-End Verification Test Scenarios

**Status:** Complete Testing Plan  
**Date:** 2026-09-02

---

## TEST SCENARIO 1: City Ride (Same State) - No Extra Charges
```
Input:
- Pickup: Jaipur, Rajasthan
- Dropoff: Ajmer, Rajasthan (75 km)
- Vehicle: Economy
- Date: 2026-09-15
- Time: 14:00 (Daytime)
- Passengers: 1
- Return Trip: No

Expected Output:
✅ baseFare: ₹50 (Economy profile)
✅ distanceFare: ₹750 (75 km × ₹10/km)
✅ timeFare: Calculated based on duration
✅ tollCharge: ₹0 (local route < 25km check may vary)
✅ parkingCharge: ₹0 (NOT included in total)
✅ parkingEstimatedAmount: ₹0-25 (estimated for customer info)
✅ stateTax: ₹0 (same state)
✅ nightCharge: ₹0 (daytime)
✅ gstTotal: ₹0 (set to 0%)
✅ totalFare: baseFare + distanceFare + timeFare only
```

---

## TEST SCENARIO 2: Interstate Ride - State Tax Applied
```
Input:
- Pickup: Jaipur, Rajasthan
- Dropoff: Delhi, Delhi (250 km)
- Vehicle: Sedan
- Date: 2026-09-15
- Time: 10:00
- Passengers: 2
- Return Trip: No
- Passengers: 2

Expected Output:
✅ baseFare: ₹70
✅ distanceFare: ₹2,500 (250 × ₹10/km)
✅ interState: true
✅ stateTax: Calculated from OFFICIAL_OTHER_STATE_TAX_RULES[Delhi]
✅ stateTaxBreakdown: Array with Delhi tax details
✅ stateTaxTaxableStates: ['Delhi']
✅ parkingCharge: ₹0
✅ nightCharge: ₹0 (daytime)
✅ totalFare: baseFare + distanceFare + timeFare + stateTax
```

---

## TEST SCENARIO 3: Night Ride - Night Charges Applied
```
Input:
- Pickup: Jaipur, Rajasthan
- Dropoff: Udaipur, Rajasthan (400 km - Outstation)
- Vehicle: Premium
- Date: 2026-09-15
- Time: 23:30 (NIGHT)
- Passengers: 1
- Return Trip: No

Expected Output:
✅ isNightTime(23:30): true ✓
✅ nightCharge: ₹250 (inter-state/outstation rule)
✅ totalFare: baseFare + distanceFare + timeFare + tollCharge + nightCharge
✅ parkingCharge: ₹0
✅ gstTotal: ₹0
```

---

## TEST SCENARIO 4: Return Trip - Double Calculation
```
Input:
- Pickup: Jaipur, Rajasthan
- Dropoff: Delhi, Delhi
- Vehicle: Sedan
- Date: 2026-09-15
- Time: 08:00
- Return Date: 2026-09-18
- Return Time: 18:00
- Passengers: 2
- isReturnTrip: true

Expected Output:
✅ returnTripFare: 68% of single trip fare
✅ roundTripCharge: returnTripFare value
✅ totalFare: subtotal + (subtotal × 0.68) + toll + stateTax + night
✅ stateTaxDays: Calculated (Sep 15-18 = 3+ days)
✅ isReturnTrip: true
✅ rideDate & returnDate: Both populated
```

---

## TEST SCENARIO 5: Airport Transfer - Parking Not Included
```
Input:
- Pickup: Jaipur City
- Dropoff: Jaipur Airport
- Vehicle: Sedan
- Trip Plan: airport
- Date: 2026-09-15
- Time: 05:00
- Passengers: 1

Expected Output:
✅ tripPlan: 'airport'
✅ tripPlanFare: ₹120 (from TRIP_PLAN_FARES)
✅ parkingCharge: ₹0 (NOT in total)
✅ parkingEstimatedAmount: ₹60-90 (airport parking estimated)
✅ parkingReasons: ['airport', 'airport transfer']
✅ parkingCustomerNote: "Parking charges will be collected at destination based on actual usage"
✅ nightCharge: ₹80 (early morning is night: 5 AM < 6 AM cutoff)
```

---

## TEST SCENARIO 6: Toll Route - Multiple Plazas
```
Input:
- Pickup: Jaipur
- Dropoff: Jodhpur (260 km - mapped route)
- Vehicle: Sedan
- Date: 2026-09-15
- Time: 10:00
- Passengers: 1

Expected Output:
✅ tollCharge: > 0 (multiple toll plazas)
✅ tollPlazas: Array of plaza objects
  - Includes: name, amount, state, source
✅ tollPlazaCount: > 1
✅ tollSource: 'mapped_route_toll_table' or 'official_rajmarg_yatra_route_planner'
✅ tollUsedReturnRate: false (single trip)
✅ parkingCharge: ₹0
✅ gstTotal: ₹0
```

---

## TEST SCENARIO 7: Return Trip with Toll - Return Rate Applied
```
Input:
- Pickup: Jaipur
- Dropoff: Jodhpur
- Vehicle: Sedan
- Date: 2026-09-15
- Time: 10:00
- Return Date: 2026-09-17
- Return Time: 15:00
- isReturnTrip: true

Expected Output:
✅ tollCharge: Higher (return rate used)
✅ tollUsedReturnRate: true
✅ Each toll plaza: singleCar rate for outbound, returnCar rate for return
✅ returnTripFare: 68% of single trip
✅ Total: Single trip + Return trip + toll (return adjusted)
```

---

## TEST SCENARIO 8: GST Always Zero
```
Multiple scenarios test:

Scenario A - City Ride:
  ✅ gstTotal: ₹0
  ✅ taxesFare: ₹0

Scenario B - Interstate + Toll + Night:
  ✅ gstTotal: ₹0
  ✅ Applied to: (subtotal + toll + stateTax + night + payment) × 0%

Scenario C - Return Trip:
  ✅ gstTotal: ₹0
  ✅ No hidden 5% applied anywhere
```

---

## TEST SCENARIO 9: Parking Not in Total But Info Provided
```
Input:
- Pickup: Jaipur
- Dropoff: Jaipur Station
- Vehicle: Sedan
- Date: 2026-09-15
- Time: 10:00

Expected Output:
✅ parkingCharge: ₹0 (NOT added to total)
✅ parkingEstimatedAmount: ₹35-50 (station parking)
✅ parkingReasons: ['station/junction']
✅ parkingCustomerNote: Present and informative
✅ totalFare Calculation:
   Does NOT include: + parkingCharge
   Only includes: baseFare + distanceFare + timeFare + toll + stateTax + night

Verify in response object:
✅ parkingCharge: 0
✅ grossTotal: Does NOT include parkingCharge
✅ finalFare: Does NOT include parkingCharge
✅ But parkingEstimatedAmount: Available for UI display
```

---

## TEST SCENARIO 10: Location Auto-Fill Disabled
```
Manual Test:
1. Open booking page
2. Click "Use Current Location" for pickup
3. Expected: GPS permission requested, location searched
4. After selection: Pickup field filled with address
5. Click "Use Current Location" for dropoff
6. Expected: GPS triggered, coordinates captured
7. Expected: Dropoff field NOT auto-filled with same/similar location
8. If location refinement happens:
   - Only improve accuracy if location already set
   - Do NOT populate empty fields
```

---

## INTEGRATION TEST: Full Booking Flow

### Step 1: Initialize Booking
```javascript
const bookingInput = {
  pickup: 'Jaipur, Rajasthan',
  drop: 'Delhi, Delhi',
  pickupState: 'Rajasthan',
  dropState: 'Delhi',
  distanceKm: 250,
  vehicleType: 'sedan',
  passengers: 2,
  rideDate: '2026-09-15',
  rideTime: '22:30', // NIGHT
  isReturnTrip: true,
  returnDate: '2026-09-18',
  returnTime: '16:00',
  tripPlan: 'outstation',
  paymentMethod: 'card'
};
```

### Step 2: Call Fare Calculator
```javascript
const estimate = window.GoIndiaRideFareCalculator.estimateBookingFare(bookingInput);
```

### Step 3: Verify All Fields in Response
```javascript
✅ estimate.baseFare > 0
✅ estimate.distanceFare > 0
✅ estimate.timeFare > 0
✅ estimate.nightCharge > 0 (22:30 is night)
✅ estimate.stateTax > 0 (interstate)
✅ estimate.parkingCharge === 0 (must be 0)
✅ estimate.parkingEstimatedAmount > 0 (but not in total)
✅ estimate.gstTotal === 0 (must be 0)
✅ estimate.tollCharge > 0 (outstation route)
✅ estimate.paymentFee > 0 (card payment = 2%)
✅ estimate.returnTripFare > 0 (return trip)
✅ estimate.totalFare = estimate.grossTotal - estimate.promoDiscount
✅ estimate.totalFare > estimate.baseFare (minimum fare check)
```

### Step 4: Verify Breakdown in UI
```javascript
Display should show:
- Base Fare: ₹70
- Distance Fare: ₹2,500 (250 km × ₹10)
- Time Fare: Calculated
- Passenger Fare: ₹25 (1 extra passenger)
- Trip Plan: ₹220 (outstation)
- Return Trip: 68% of subtotal
- Toll Charges: ₹XXX (multiple plazas listed)
- State Tax: ₹XXX (Delhi tax details)
- Night Charges: ₹250 (late night ride)
- Payment Fee: ₹XXX (2% for card)
- Parking: ₹0 (with note: "Estimated ₹50, payable at destination")
- GST: ₹0
---
= TOTAL FARE: ₹XXXX
```

---

## EDGE CASES

### Edge Case 1: Local Route (No Toll)
```
✅ distanceKm < 25
✅ tripPlan = 'city'
✅ pickupState === dropState
→ tollCharge: ₹0
→ source: 'local_no_mapped_toll'
→ requiresAdminReview: false
```

### Edge Case 2: Unmapped Route (Requires Admin Review)
```
✅ No toll mapping found
✅ Not a local route
→ tollCharge: ₹0
→ source: 'mapped_route_required_admin_review'
→ requiresAdminReview: true
→ Display: "Toll requires admin review"
```

### Edge Case 3: Missing State Tax Rule
```
✅ Inter-state but no rule for destination state
→ taxableStates: [state]
→ breakdown: [{ requiresAdminReview: true }]
→ stateTaxRequiresAdminReview: true
→ Display: "State tax requires admin review"
```

### Edge Case 4: Boundary Night Time
```
21:59 (before 22:00):
✅ isNightTime(): false
✅ nightCharge: ₹0

22:00 (exactly):
✅ isNightTime(): true
✅ nightCharge: ₹XX

05:59 (before 06:00):
✅ isNightTime(): true
✅ nightCharge: ₹XX

06:00 (exactly):
✅ isNightTime(): false
✅ nightCharge: ₹0
```

---

## CRITICAL VERIFICATION CHECKLIST

### Calculation Logic
- [ ] `parkingCharge` is always 0 in final total
- [ ] `gstTotal` is always 0, not 5%
- [ ] `nightCharge` only applied when `isNightTime()` true
- [ ] `stateTax` only applied when `interState` true
- [ ] `tollCharge` correctly mapped or admin review
- [ ] `parkingEstimatedAmount` calculated but not in total
- [ ] `parkingReasons` array contains reasons
- [ ] `parkingCustomerNote` present in response

### Output Fields
- [ ] `parkingCharge: 0` present in response
- [ ] `parkingEstimatedAmount: XXX` present
- [ ] `parkingReasons: [...]` present
- [ ] `parkingCustomerNote: "..."` present
- [ ] `gstTotal: 0` present
- [ ] `taxesFare: 0` present
- [ ] All original fields still present (no breaking changes)

### Feature Integration
- [ ] All features work in `estimateBookingFare()`
- [ ] All features work in UI display (`estimate.js`)
- [ ] No features lost in response object
- [ ] Location not auto-filled in GPS functions
- [ ] Night time boundary cases handled correctly

### Booking Form
- [ ] Fare display shows all components
- [ ] Parking note visible to customer
- [ ] Night charges highlighted if applicable
- [ ] State tax breakdown shown if applicable
- [ ] Toll plazas listed if mapped
- [ ] Total clearly separated from estimates

---

## REGRESSION TEST: Existing Features Still Work

- [ ] Promo codes still apply discount
- [ ] Competitive market adjustment still works
- [ ] Luggage fare calculation working
- [ ] Passenger extra fare working
- [ ] Special requests fare working
- [ ] Safety features fare working
- [ ] Multiple stops fare working
- [ ] Vehicle type profiles working
- [ ] Payment fee rates working (no GST applied after)
- [ ] Minimum fare enforcement working

---

## DEPLOYMENT VERIFICATION

Before pushing to production:

1. [ ] All tests pass locally
2. [ ] No console errors in browser
3. [ ] No breaking changes in API responses
4. [ ] Backward compatibility maintained
5. [ ] Documentation updated (FARE_CALCULATOR_FIXES_SUMMARY.md)
6. [ ] Git commit has proper message
7. [ ] Branch properly named: `bhaugehlot159-fare-calculator-fixes`
8. [ ] Ready for PR creation

---

**Next Step:** Run these test scenarios and verify each one passes completely.
