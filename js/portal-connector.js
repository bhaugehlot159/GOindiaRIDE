/**
 * Portal Connector
 * Connects Customer, Driver and Admin portals using localStorage events.
 */
(function () {
    const STORAGE_KEY = 'goindiaride_portal_notifications';
    const PORTAL_KEY = 'goindiaride_active_portal';

    function readNotifications() {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    }

    function writeNotifications(items) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    }

    function createNotification(payload) {
        const notifications = readNotifications();
        const notification = {
            id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            createdAt: new Date().toISOString(),
            readBy: [],
            ...payload
        };
        notifications.push(notification);
        writeNotifications(notifications);
        return notification;
    }

    function markRead(notificationId, portalType) {
        const notifications = readNotifications();
        const idx = notifications.findIndex(item => item.id === notificationId);
        if (idx === -1) return;

        if (!notifications[idx].readBy.includes(portalType)) {
            notifications[idx].readBy.push(portalType);
            writeNotifications(notifications);
        }
    }

    function listen(portalType, callback) {
        const handleIncoming = (items) => {
            items.forEach(item => {
                if (!item.targetPortals || !item.targetPortals.includes(portalType)) return;
                if ((item.readBy || []).includes(portalType)) return;

                callback(item);
                markRead(item.id, portalType);
            });
        };

        // First load for missed notifications in same tab
        handleIncoming(readNotifications());

        // Cross-tab/portal updates
        window.addEventListener('storage', (event) => {
            if (event.key !== STORAGE_KEY || !event.newValue) return;
            const updated = JSON.parse(event.newValue);
            handleIncoming(updated);
        });
    }

    function setActivePortal(portalType) {
        localStorage.setItem(PORTAL_KEY, portalType);
    }

    window.PortalConnector = {
        createNotification,
        listen,
        setActivePortal,
        keys: {
            STORAGE_KEY,
            PORTAL_KEY
        }
    };
})();
