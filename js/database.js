/**
 * GO India RIDE - Shared Database Layer
 * Shared persistence layer using localStorage for all portals (Customer, Driver, Admin)
 */

// Storage keys
const STORAGE_KEYS = {
    USERS: 'goride_users',
    DRIVERS: 'goride_drivers',
    BOOKINGS: 'goride_bookings',
    ADMIN: 'goride_admin',
    NOTIFICATIONS: 'goride_notifications',
    DONATIONS: 'goride_donations',
    MESSAGES: 'goride_messages',
    CHAT_INITIALIZED: 'goride_chat_initialized'
};

// Initialize persistent storage buckets for production usage
function initializeDatabase() {
    const defaults = {
        [STORAGE_KEYS.USERS]: [],
        [STORAGE_KEYS.DRIVERS]: [],
        [STORAGE_KEYS.BOOKINGS]: [],
        [STORAGE_KEYS.NOTIFICATIONS]: [],
        [STORAGE_KEYS.DONATIONS]: [],
        [STORAGE_KEYS.MESSAGES]: []
    };

    Object.entries(defaults).forEach(([key, value]) => {
        if (!localStorage.getItem(key)) {
            localStorage.setItem(key, JSON.stringify(value));
        }
    });
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

// CRUD Operations for Messages/Chat
const MessageDB = {
    create(message) {
        const messages = this.getAll();
        const newMessage = {
            ...message,
            id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11),
            timestamp: message.timestamp || new Date().toISOString(),
            read: message.read || false
        };
        messages.push(newMessage);
        localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages));
        return newMessage;
    },

    getAll() {
        const messages = localStorage.getItem(STORAGE_KEYS.MESSAGES);
        return messages ? JSON.parse(messages) : [];
    },

    getConversation(userId, driverId) {
        const messages = this.getAll();
        return messages.filter(m => 
            (m.senderId === userId && m.receiverId === driverId) ||
            (m.senderId === driverId && m.receiverId === userId)
        ).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    },

    getByUserId(userId) {
        const messages = this.getAll();
        return messages.filter(m => 
            m.senderId === userId || m.receiverId === userId
        );
    },

    getUnreadCount(userId) {
        const messages = this.getAll();
        return messages.filter(m => 
            m.receiverId === userId && !m.read
        ).length;
    },

    markAsRead(messageId) {
        const messages = this.getAll();
        const index = messages.findIndex(m => m.id === messageId);
        if (index !== -1) {
            messages[index].read = true;
            localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages));
        }
    },

    markConversationAsRead(userId, otherUserId) {
        const messages = this.getAll();
        let updated = false;
        messages.forEach(m => {
            if (m.receiverId === userId && m.senderId === otherUserId && !m.read) {
                m.read = true;
                updated = true;
            }
        });
        if (updated) {
            localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages));
        }
    },

    getUserConversations(userId) {
        const messages = this.getByUserId(userId);
        const conversations = {};
        
        messages.forEach(msg => {
            const otherUserId = msg.senderId === userId ? msg.receiverId : msg.senderId;
            if (!conversations[otherUserId] || new Date(msg.timestamp) > new Date(conversations[otherUserId].timestamp)) {
                conversations[otherUserId] = {
                    userId: otherUserId,
                    lastMessage: msg.content,
                    timestamp: msg.timestamp,
                    unread: msg.receiverId === userId && !msg.read
                };
            }
        });
        
        return Object.values(conversations).sort((a, b) => 
            new Date(b.timestamp) - new Date(a.timestamp)
        );
    }
};

// Initialize database on load
initializeDatabase();

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        BookingDB,
        DriverDB,
        NotificationDB,
        MessageDB,
        autoAssignDriver,
        startAutoStatusUpdates
    };
}

