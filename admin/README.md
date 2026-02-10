# GOindiaRIDE Admin Portal

## Overview

A comprehensive Admin Portal with **32 features** for managing the GOindiaRIDE taxi booking platform. This includes AI automation, financial management, safety monitoring, and operational management features.

## Features

### 🤖 AI & Automation (8 Features)
1. **AI Auto-Block System** - Automatically detect and block suspicious users/drivers with configurable sensitivity levels
2. **Smart Fare Control** - Dynamic pricing based on demand with surge pricing management and area-wise fare configuration
3. **Demand Prediction Algorithm** - Predict high-demand areas and times with 87% accuracy using historical data analysis
4. **Auto-Offer System** - Automatically send ride offers to nearby drivers with priority-based selection
5. **AI Speed Monitor Dashboard** - Track driver speeds in real-time with over-speeding alerts and violation reports
6. **Smart Driver Matching** - Match drivers based on ratings, distance, vehicle type with configurable weights
7. **Fraud Detection System** - Detect fake bookings, identify unusual patterns, and auto-flag suspicious activities
8. **Predictive Maintenance Alerts** - Vehicle maintenance reminders based on distance traveled

### 💰 Financial Features (8 Features)
1. **Affiliate Commission Tracking** - Track affiliate referrals, commission calculation, and payout management
2. **Donation Reports Dashboard** - Track all donations, generate receipts, category-wise reports
3. **Cancellation Earnings Tracking** - Track cancellation fees collected, refund management, analytics
4. **Tax/GST Reports** - Generate GST-compliant reports, tax calculation summaries, export to Excel/PDF
5. **Family Insurance Fund Management** - Track insurance fund contributions, claim management, fund balance
6. **Revenue Analytics Dashboard** - Daily/Weekly/Monthly revenue with comparison charts and growth metrics
7. **Driver Payout Management** - Calculate driver earnings, track deductions, maintain payout history
8. **Expense Tracking** - Track operational expenses with category-wise breakdown and budget vs actual

### 🛡️ Safety & Monitoring Features (8 Features)
1. **Driver Health Monitor** - Track driver working hours with fatigue alerts (8+ hours) and health check reminders
2. **Live Map Tracking** - Real-time location of all active drivers, trip progress monitoring, geofencing alerts
3. **SOS Alerts Dashboard** - Receive and manage SOS alerts with quick response system and resolution tracking
4. **Document Verification System** - Verify driver documents (DL, Aadhaar, RC) with expiry tracking and approval workflow
5. **Heat Map for Demand** - Visual heat map of ride demand with time-based patterns and area-wise analysis
6. **Virtual Escort Feature Control** - Enable/disable virtual escort, monitor active escorts, trip reports
7. **Background Check Status** - Police verification tracking, criminal record checks, verification status
8. **Accident/Incident Reports** - Log accidents and incidents with investigation tracking and resolution status

### 📊 Management Features (8 Features)
1. **Driver Leaderboard** - Top performing drivers with rating-based ranking and monthly/weekly leaderboards
2. **Vendor Management** - Manage vehicle vendors, contract tracking, performance metrics
3. **Service Alerts System** - Send alerts to drivers/customers, scheduled announcements, push notifications
4. **Customer Support Dashboard** - Ticket management, query resolution tracking, response time metrics
5. **Driver Approval Workflow** - New driver registration queue, document review, approval/rejection with reasons
6. **Promotional Offers Management** - Create discount codes, campaign management, usage tracking
7. **System Configuration** - App settings management, feature toggles, maintenance mode
8. **Audit Logs** - Track all admin actions, user activity logs, security audit trail

## UI Features

- ✅ **Modern Dashboard Design** - Card-based layout with professional color scheme
- ✅ **Charts and Graphs** - Integrated Chart.js for data visualizations
- ✅ **Responsive Design** - Works on desktop, tablet, and mobile devices
- ✅ **Dark/Light Mode** - Theme toggle with localStorage persistence
- ✅ **Sidebar Navigation** - Organized menu with search functionality
- ✅ **Quick Access Shortcuts** - Easy navigation to all features
- ✅ **GOindiaRIDE Branding** - Consistent brand identity throughout

## Technical Stack

- **Frontend**: Vanilla JavaScript (ES6+)
- **Styling**: CSS3 with CSS Variables, Grid, and Flexbox
- **Data Storage**: localStorage (for demo/testing)
- **Charts**: Chart.js v4.4.0
- **Icons**: Font Awesome 6.4.0
- **No Dependencies**: Pure JavaScript, no frameworks required

## File Structure

```
/admin/
├── index.html                 # Main admin dashboard HTML
├── README.md                  # This file
├── css/
│   └── admin-styles.css      # All styling including dark mode
└── js/
    ├── admin-portal.js       # Core functionality and navigation
    ├── ai-features.js        # AI & Automation features
    ├── financial-reports.js  # Financial features
    └── safety-monitoring.js  # Safety & Management features
```

## Getting Started

### Access the Portal

1. Open `/admin/index.html` in a web browser
2. The portal loads in demo mode (no authentication required)
3. All features are accessible via the sidebar menu

### Demo Data

The portal comes pre-loaded with demo data including:
- 5 demo users
- 5 demo drivers
- 5 demo bookings
- Sample statistics and metrics

Demo data is stored in localStorage and persists between sessions.

## Features Guide

### Navigation

- **Sidebar Menu**: Click on any feature to view its details
- **Search**: Use the search bar to filter features by name
- **Theme Toggle**: Click the moon/sun icon in the top-right to switch themes
- **Mobile Menu**: On mobile devices, use the hamburger menu to access the sidebar

### Dashboard

The main dashboard displays:
- Total Users
- Active Drivers
- Total Bookings
- Total Revenue
- Revenue Trends Chart
- Booking Status Chart
- Recent Activity Feed

### Feature Sections

Each feature section includes:
- Statistics cards with key metrics
- Interactive tables with data
- Action buttons for management tasks
- Charts and visualizations where applicable

### Settings & Configuration

Access system settings via:
- **System Configuration** - Feature toggles and app settings
- **Audit Logs** - View all admin actions

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Responsive Breakpoints

- Desktop: 1024px and above
- Tablet: 768px to 1023px
- Mobile: Below 768px

## Development

### Adding New Features

1. Add HTML structure in the appropriate section of `index.html`
2. Create content generation function in the relevant JS file
3. Add menu item to the sidebar navigation
4. Add section initialization logic if needed

### Styling

- Main theme colors are defined as CSS variables in `admin-styles.css`
- Dark mode colors are defined in `[data-theme="dark"]` selector
- Follow the existing card-based layout pattern

### Data Management

All data is stored in localStorage with these keys:
- `adminDemoUsers` - User data
- `adminDemoDrivers` - Driver data
- `adminDemoBookings` - Booking data
- `adminAuditLogs` - Audit log entries
- `adminTheme` - Current theme preference

## Screenshots

### Dashboard (Light Mode)
![Dashboard](https://github.com/user-attachments/assets/78fd34a0-e1cc-4405-893d-3567dd01e8c1)

### AI Auto-Block System
![AI Auto-Block](https://github.com/user-attachments/assets/f6e6a281-5ebe-424e-a88b-e73fe2bff97b)

### Dark Mode
![Dark Mode](https://github.com/user-attachments/assets/006177f7-1a17-4bf9-8279-bf0c99c59f55)

### Mobile View
![Mobile View](https://github.com/user-attachments/assets/905a61c0-6bfa-41cf-a556-045d19281fc6)

## License

Part of the GOindiaRIDE platform - Phase 3A implementation.

## Support

For issues or questions, please contact the development team.
