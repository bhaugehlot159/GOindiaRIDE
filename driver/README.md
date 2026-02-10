# Driver Portal - GOindiaRIDE

Complete driver management system with 25+ features for taxi booking platform.

## 🎯 Overview

The Driver Portal is a comprehensive mobile-first web application designed for drivers of the GOindiaRIDE taxi booking platform. It includes all essential features for driver onboarding, trip management, earnings tracking, and safety monitoring.

## 📁 File Structure

```
/driver/
├── index.html              # Main driver dashboard
├── css/
│   └── driver-styles.css  # Complete styling with night mode
└── js/
    ├── driver-portal.js       # Core portal functionality
    ├── kyc-verification.js    # KYC & document management
    ├── wallet-system.js       # Wallet & earnings system
    └── safety-features.js     # Safety & health features
```

## ✨ Features (25+)

### 📋 KYC & Verification (6 Features)

1. **Full KYC System**
   - Driving License upload & verification
   - Aadhaar Card upload & verification
   - Police Verification status tracking
   - PAN Card for tax purposes

2. **Document Upload & Status**
   - Real-time verification status
   - Document expiry alerts
   - Re-upload for rejected documents

3. **Guide Certification System**
   - Tourist guide certification upload
   - Certification verification
   - Certified guide badge display

4. **Language Skills Declaration**
   - Select known languages (12 Indian languages)
   - Proficiency levels (Basic/Fluent/Native)
   - Display on driver profile

5. **Vehicle Documents**
   - RC (Registration Certificate)
   - Insurance document
   - PUC (Pollution) certificate
   - Fitness certificate

6. **Profile Verification Badge**
   - Verification status display
   - Verified driver badge
   - Trust score (0-100)

### 💰 Financial Features (5 Features)

1. **Security Deposit System**
   - ₹5,000 deposit payment interface
   - Deposit status tracking
   - Refund request option
   - Deposit history

2. **Digital Wallet**
   - Wallet balance display
   - Add money (UPI, Card, Net Banking)
   - Transaction history with filters
   - Withdraw to bank account

3. **Digital Receipts Generation**
   - Generate receipt for each trip
   - Download/share receipts
   - Receipt history

4. **Earnings Dashboard**
   - Daily/Weekly/Monthly earnings
   - Trip-wise earnings breakdown
   - Bonus and incentives tracking
   - Deductions summary

5. **Tax Summary**
   - Annual earnings summary (Indian FY: April-March)
   - TDS deductions
   - Downloadable tax statement

### 🚗 Operational Features (7 Features)

1. **Live GPS Tracking Integration**
   - Real-time location sharing
   - Location accuracy indicator
   - GPS status check

2. **No-Cancel Lock Feature**
   - Lock ride after acceptance
   - Penalty for cancellation
   - Emergency cancel option

3. **Route Guidance Integration**
   - Google Maps integration
   - Turn-by-turn navigation
   - Traffic-aware routing

4. **Battery/Network Status Check**
   - Phone battery level display
   - Network connectivity status
   - Low battery/network alerts

5. **Trip Management**
   - Current trip details
   - Trip history with receipts
   - Upcoming scheduled trips

6. **Availability Toggle**
   - Online/Offline status
   - Break mode
   - Schedule availability

7. **Ride Requests**
   - Incoming ride requests
   - Accept/Reject interface
   - 30-second timeout countdown

### 🛡️ Safety & Health Features (7 Features)

1. **AI Speed Monitor**
   - Real-time speed tracking
   - Over-speed alerts with audio
   - Speed violation history
   - Penalty point system

2. **Uniform Check Selfie**
   - Daily selfie requirement
   - AI uniform detection (demo)
   - Compliance tracking

3. **Fatigue Alert System**
   - Track continuous driving hours
   - 8+ hours = Mandatory Rest Mode
   - 30-minute rest timer countdown
   - Cannot go online until rest complete

4. **Telematics Dashboard**
   - Harsh braking detection
   - Sharp turns detection
   - Rapid acceleration alerts
   - Driving score (0-100)

5. **SOS Button**
   - Emergency SOS for drivers
   - Quick police contact (100)
   - Ambulance contact (108)
   - Location sharing with emergency contacts

6. **Health Check Reminders**
   - Periodic health check alerts
   - Health certificate upload
   - Fitness status tracking
   - Expiry reminders

7. **Accident Reporting**
   - Report accident with photos
   - Insurance claim assistance
   - Incident history
   - Severity classification

## 🎨 UI Features

### Mobile-First Design
- Optimized for 375px width (iPhone SE)
- Touch-friendly interface
- Large buttons for easy tap
- Swipe gestures support

### Night Mode
- Driver-friendly dark theme
- Reduces eye strain during night driving
- Toggle available in top navigation

### Dashboard
- Today's earnings prominent display
- Online/Offline toggle
- Quick stats cards (Trips, Rating, Hours)
- System status (Battery, Network, GPS)

### Bottom Navigation
- Home: Main dashboard
- Earnings: Financial reports
- Trips: Trip history
- Profile: Driver profile & settings

### Theme
- Primary: Purple gradient (#667eea to #764ba2)
- Success: Green (#10b981)
- Danger: Red (#ef4444)
- Warning: Orange (#f59e0b)

## 🔧 Technical Implementation

### Browser APIs Used
- **Geolocation API**: GPS tracking
- **Battery Status API**: Battery monitoring
- **Network Information API**: Connection status
- **MediaDevices API**: Camera for selfies
- **Web Audio API**: Alert sounds
- **LocalStorage API**: Data persistence

### Technology Stack
- **Pure JavaScript**: No frameworks or libraries
- **CSS Grid & Flexbox**: Responsive layouts
- **CSS Custom Properties**: Dynamic theming
- **HTML5 Semantic**: Accessible markup

### Data Storage
All data is stored in browser's localStorage:
- `driver_data`: Driver state and statistics
- `kyc_data`: KYC documents and verification status
- `wallet_data`: Wallet balance and transactions
- `safety_data`: Safety features data
- `telematics_data`: Driving behavior data
- `trips_data`: Trip history
- `sos_history`: Emergency SOS records
- `accident_reports`: Accident reports
- `deposit_data`: Security deposit information

## 🚀 Getting Started

### Access the Portal

```bash
# Option 1: Direct file access
open driver/index.html

# Option 2: Local server
cd /path/to/GOindiaRIDE
python3 -m http.server 8080
# Visit http://localhost:8080/driver/

# Option 3: Live server (VS Code extension)
# Right-click on driver/index.html and select "Open with Live Server"
```

### Demo Data

The portal includes demo data for testing:
- Today's Earnings: ₹850.50
- Trips Today: 12
- Driver Rating: 4.8
- Online Hours: 6h

### First-Time Setup

1. **Complete KYC**: Upload all required documents
2. **Add Languages**: Select known languages with proficiency
3. **Pay Security Deposit**: ₹5,000 refundable deposit
4. **Go Online**: Toggle the online switch to start receiving rides

## 📱 Features Demo

### KYC Verification Flow
1. Click "KYC Verification" card
2. Upload documents (DL, Aadhaar, PAN, etc.)
3. Wait 2 seconds for auto-verification (demo)
4. View verification status
5. Once all verified, can go online

### Taking a Ride
1. Toggle "Online" switch
2. Wait for ride request (10-40 seconds in demo)
3. Accept or reject within 30 seconds
4. Navigate using Google Maps
5. Complete the ride
6. View earnings updated

### Fatigue Management
1. Drive for 8+ hours (simulated)
2. Automatic mandatory rest triggered
3. Cannot go online during rest
4. 30-minute timer countdown
5. Rest complete notification

### Emergency SOS
1. Click red "SOS" button (bottom right)
2. Confirm emergency situation
3. Location shared automatically
4. Quick access to Police (100) & Ambulance (108)
5. SOS recorded in history

## 🔒 Security & Privacy

### Data Security
- All data stored locally in browser
- No server communication (demo mode)
- No sensitive data in code
- Clean code - passed security scan

### Privacy
- GPS location only when online
- Camera only when taking selfie
- No data shared with third parties
- User can clear all data anytime

## 📊 Browser Compatibility

### Supported Browsers
- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

### Required Browser Features
- LocalStorage
- Geolocation API
- MediaDevices API (for camera)
- Battery Status API (optional)
- Network Information API (optional)

## 🔮 Future Enhancements

### Planned Features
- [ ] Backend integration with REST APIs
- [ ] Real-time WebSocket for ride requests
- [ ] Push notifications
- [ ] Offline mode with sync
- [ ] Multi-language UI (i18n)
- [ ] Voice commands
- [ ] Analytics dashboard
- [ ] Driver leaderboard
- [ ] Referral system

### Production Considerations
- Replace localStorage with API calls
- Implement actual AI for uniform verification
- Connect to real payment gateway
- Integrate with actual mapping service API
- Add proper authentication/authorization
- Implement rate limiting
- Add error tracking (Sentry)
- Add analytics (Google Analytics)

## 📖 Code Documentation

### Main Functions

#### driver-portal.js
- `initializeDriver()`: Load saved data and initialize
- `handleOnlineToggle()`: Manage online/offline status
- `checkSystemStatus()`: Monitor battery, network, GPS
- `showRideRequest()`: Display incoming ride request
- `acceptRequest()`: Accept and start ride
- `completeRide()`: Complete ride and update earnings
- `checkFatigue()`: Monitor driving hours

#### kyc-verification.js
- `openKYC()`: Open KYC verification modal
- `uploadDocument()`: Upload and verify documents
- `openLanguagesModal()`: Manage language skills
- `updateDocumentStatus()`: Update verification status

#### wallet-system.js
- `openWallet()`: Open digital wallet
- `openAddMoney()`: Add money to wallet
- `openWithdraw()`: Withdraw to bank
- `openEarnings()`: View earnings dashboard
- `calculateEarnings()`: Calculate period earnings

#### safety-features.js
- `openSafety()`: Open safety dashboard
- `openSpeedMonitor()`: Monitor speed
- `openUniformCheck()`: Daily uniform selfie
- `openFatigueMonitor()`: Check fatigue status
- `triggerSOS()`: Emergency SOS
- `openHealthCheck()`: Health certificate
- `openAccidentReport()`: Report accident
- `openTelematics()`: Driving behavior

## 🤝 Contributing

This is Phase 3B of the GOindiaRIDE platform upgrade. Focus on Driver Portal features only.

### Code Style
- Use camelCase for variables and functions
- Use UPPER_SNAKE_CASE for constants
- Add comments for complex logic
- Follow existing patterns

### Testing
- Test all features manually
- Check mobile responsiveness
- Verify browser compatibility
- Test with demo data

## 📄 License

Copyright © 2024 GOindiaRIDE. All rights reserved.

## 📞 Support

For issues or questions about the Driver Portal:
- Create an issue in the repository
- Contact the development team
- Check the documentation

---

**Built with ❤️ for GOindiaRIDE Drivers**
