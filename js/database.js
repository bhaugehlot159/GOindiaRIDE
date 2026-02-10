/**
 * GO India RIDE - Shared Database Layer
 * Simulates a database using localStorage for all portals (Customer, Driver, Admin)
 */

// Storage keys
const STORAGE_KEYS = {
    USERS: 'goride_users',
    DRIVERS: 'goride_drivers',
    BOOKINGS: 'goride_bookings',
    ADMIN: 'goride_admin',
    NOTIFICATIONS: 'goride_notifications',
    DONATIONS: 'goride_donations'
};

// Initialize demo data if not exists
function initializeDatabase() {
    // Initialize demo drivers if not exists
    if (!localStorage.getItem(STORAGE_KEYS.DRIVERS)) {
        const demoDrivers = [
            {
                id: 'driver_1',
                name: 'Rajesh Kumar',
                phone: '+91-9876543210',
                vehicle: { type: 'Economy', model: 'Maruti Swift', number: 'RJ14AB1234' },
                rating: 4.8,
                photo: '👨',
                status: 'available',
                location: { district: 'Jaipur', lat: 26.9124, lng: 75.7873 }
            },
            {
                id: 'driver_2',
                name: 'Suresh Singh',
                phone: '+91-9876543211',
                vehicle: { type: 'Premium', model: 'Honda City', number: 'RJ14CD5678' },
                rating: 4.9,
                photo: '👨‍🦱',
                status: 'available',
                location: { district: 'Jaipur', lat: 26.9024, lng: 75.7973 }
            },
            {
                id: 'driver_3',
                name: 'Amit Sharma',
                phone: '+91-9876543212',
                vehicle: { type: 'Economy', model: 'Hyundai i20', number: 'RJ14EF9012' },
                rating: 4.7,
                photo: '👨‍🦰',
                status: 'available',
                location: { district: 'Jodhpur', lat: 26.2389, lng: 73.0243 }
            },
            {
                id: 'driver_4',
                name: 'Vijay Patel',
                phone: '+91-9876543213',
                vehicle: { type: 'SUV', model: 'Mahindra XUV', number: 'RJ14GH3456' },
                rating: 4.6,
                photo: '🧔',
                status: 'available',
                location: { district: 'Udaipur', lat: 24.5854, lng: 73.7125 }
            }
        ];
        localStorage.setItem(STORAGE_KEYS.DRIVERS, JSON.stringify(demoDrivers));
    }
}

// CRUD Operations for Bookings
const BookingDB = {
    create(booking) {
        const bookings = this.getAll();
        const newBooking = {
            ...booking,
            id: booking.id || 'booking_' + Date.now(),
            createdAt: booking.createdAt || new Date().toISOString(),
            status: booking.status || 'pending'
        };
        bookings.push(newBooking);
        localStorage.setItem(STORAGE_KEYS.BOOKINGS, JSON.stringify(bookings));
        
        // Notify admin
        NotificationDB.create({
            type: 'new_booking',
            title: 'New Booking',
            message: `New booking from ${newBooking.pickup} to ${newBooking.dropoff}`,
            bookingId: newBooking.id
        });
        
        return newBooking;
    },

    getAll() {
        const bookings = localStorage.getItem(STORAGE_KEYS.BOOKINGS);
        return bookings ? JSON.parse(bookings) : [];
    },

    getById(id) {
        const bookings = this.getAll();
        return bookings.find(b => b.id === id);
    },

    getByUserId(userId) {
        const bookings = this.getAll();
        return bookings.filter(b => b.userId === userId);
    },

    getByDriverId(driverId) {
        const bookings = this.getAll();
        return bookings.filter(b => b.driverId === driverId);
    },

    getPending() {
        const bookings = this.getAll();
        return bookings.filter(b => b.status === 'pending');
    },

    update(id, updates) {
        const bookings = this.getAll();
        const index = bookings.findIndex(b => b.id === id);
        if (index !== -1) {
            bookings[index] = { ...bookings[index], ...updates };
            localStorage.setItem(STORAGE_KEYS.BOOKINGS, JSON.stringify(bookings));
            return bookings[index];
        }
        return null;
    },

    updateStatus(id, status) {
        return this.update(id, { status, lastUpdated: new Date().toISOString() });
    },

    delete(id) {
        const bookings = this.getAll();
        const filtered = bookings.filter(b => b.id !== id);
        localStorage.setItem(STORAGE_KEYS.BOOKINGS, JSON.stringify(filtered));
    }
};

// CRUD Operations for Drivers
const DriverDB = {
    getAll() {
        const drivers = localStorage.getItem(STORAGE_KEYS.DRIVERS);
        return drivers ? JSON.parse(drivers) : [];
    },

    getById(id) {
        const drivers = this.getAll();
        return drivers.find(d => d.id === id);
    },

    getAvailable() {
        const drivers = this.getAll();
        return drivers.filter(d => d.status === 'available');
    },

    getByDistrict(district) {
        const drivers = this.getAll();
        return drivers.filter(d => d.location && d.location.district === district);
    },

    findNearest(pickupDistrict, rideType) {
        const drivers = this.getByDistrict(pickupDistrict);
        const available = drivers.filter(d => 
            d.status === 'available' && 
            (!rideType || d.vehicle.type.toLowerCase() === rideType.toLowerCase() || rideType === 'economy')
        );
        
        // Return random available driver (simulating nearest)
        if (available.length > 0) {
            return available[Math.floor(Math.random() * available.length)];
        }
        return null;
    },

    update(id, updates) {
        const drivers = this.getAll();
        const index = drivers.findIndex(d => d.id === id);
        if (index !== -1) {
            drivers[index] = { ...drivers[index], ...updates };
            localStorage.setItem(STORAGE_KEYS.DRIVERS, JSON.stringify(drivers));
            return drivers[index];
        }
        return null;
    },

    updateStatus(id, status) {
        return this.update(id, { status });
    },

    assignToBooking(driverId, bookingId) {
        this.update(driverId, { 
            status: 'assigned', 
            currentBooking: bookingId 
        });
    }
};

// CRUD Operations for Notifications
const NotificationDB = {
    create(notification) {
        const notifications = this.getAll();
        const newNotification = {
            ...notification,
            id: 'notif_' + Date.now(),
            timestamp: new Date().toISOString(),
            read: false
        };
        notifications.push(newNotification);
        localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifications));
        return newNotification;
    },

    getAll() {
        const notifications = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
        return notifications ? JSON.parse(notifications) : [];
    },

    getUnread() {
        const notifications = this.getAll();
        return notifications.filter(n => !n.read);
    },

    markAsRead(id) {
        const notifications = this.getAll();
        const index = notifications.findIndex(n => n.id === id);
        if (index !== -1) {
            notifications[index].read = true;
            localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifications));
        }
    },

    clear() {
        localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify([]));
    }
};

// Auto-assign driver to booking
function autoAssignDriver(bookingId) {
    const booking = BookingDB.getById(bookingId);
    if (!booking) return null;

    // Extract district from pickup location (assuming format: "District Name, Location")
    const pickupDistrict = booking.pickup.split(',')[0].trim();
    
    // Find nearest available driver
    const driver = DriverDB.findNearest(pickupDistrict, booking.rideType);
    
    if (driver) {
        // Assign driver to booking
        BookingDB.update(bookingId, {
            driverId: driver.id,
            driverName: driver.name,
            driverPhone: driver.phone,
            driverVehicle: driver.vehicle,
            driverRating: driver.rating,
            status: 'driver_assigned',
            assignedAt: new Date().toISOString()
        });

        // Update driver status
        DriverDB.assignToBooking(driver.id, bookingId);

        // Notify customer
        NotificationDB.create({
            type: 'driver_assigned',
            title: 'Driver Assigned',
            message: `${driver.name} will be your driver. ETA: 5 minutes`,
            bookingId: bookingId,
            userId: booking.userId
        });

        return driver;
    }
    
    return null;
}

// Auto status update system
function startAutoStatusUpdates(bookingId) {
    const statusFlow = [
        { status: 'driver_assigned', delay: 30000, message: 'Driver assigned' },
        { status: 'driver_en_route', delay: 60000, message: 'Driver is on the way' },
        { status: 'ride_started', delay: 120000, message: 'Ride has started' },
        { status: 'ride_completed', delay: 300000, message: 'Ride completed' }
    ];

    let currentStep = 0;

    function updateNextStatus() {
        if (currentStep < statusFlow.length) {
            const step = statusFlow[currentStep];
            
            setTimeout(() => {
                const booking = BookingDB.getById(bookingId);
                if (booking && booking.status !== 'cancelled') {
                    BookingDB.updateStatus(bookingId, step.status);
                    
                    NotificationDB.create({
                        type: 'status_update',
                        title: 'Ride Update',
                        message: step.message,
                        bookingId: bookingId,
                        userId: booking.userId
                    });

                    currentStep++;
                    updateNextStatus();
                }
            }, step.delay);
        }
    }

    updateNextStatus();
}

// Initialize database on load
initializeDatabase();

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        BookingDB,
        DriverDB,
        NotificationDB,
        autoAssignDriver,
        startAutoStatusUpdates
    };
}
