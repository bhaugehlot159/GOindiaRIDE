/**
 * Portal Connector
 * Connects Customer, Driver and Admin portals using localStorage + in-tab custom events.
 */
(function initPortalConnector(global) {
    "use strict";

    const STORAGE_KEY = "goindiaride_portal_notifications";
    const PORTAL_KEY = "goindiaride_active_portal";
    const LOCAL_EVENT = "goindiaride:portal-notification-update";
    const MAX_NOTIFICATIONS = 300;

    function readNotifications() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            const parsed = data ? JSON.parse(data) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            return [];
        }
    }

    function writeNotifications(items) {
        const normalized = Array.isArray(items) ? items.slice(-MAX_NOTIFICATIONS) : [];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        global.dispatchEvent(
            new CustomEvent(LOCAL_EVENT, {
                detail: { items: normalized },
            })
        );
    }

    function normalizeTargets(targetPortals) {
        if (!Array.isArray(targetPortals) || !targetPortals.length) {
            return ["customer", "driver", "admin"];
        }

        return targetPortals
            .map((item) => String(item || "").toLowerCase().trim())
            .filter(Boolean);
    }

    function createNotification(payload) {
        const notifications = readNotifications();
        const targetPortals = normalizeTargets(payload && payload.targetPortals);

        const notification = {
            id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            createdAt: new Date().toISOString(),
            readBy: [],
            type: (payload && payload.type) || "info",
            title: (payload && payload.title) || "Platform Notification",
            message: (payload && payload.message) || "",
            sourcePortal: (payload && payload.sourcePortal) || "system",
            targetPortals,
            booking: payload && payload.booking ? payload.booking : null,
            metadata: payload && payload.metadata ? payload.metadata : {},
        };

        notifications.push(notification);
        writeNotifications(notifications);

        // Keep unified alert feed in sync if available
        if (global.PortalAlerts && typeof global.PortalAlerts.pushAlert === "function") {
            try {
                global.PortalAlerts.pushAlert({
                    title: notification.title,
                    message: notification.message,
                    type: notification.type === "error" ? "danger" : notification.type,
                    roles: targetPortals,
                    rideId: notification.booking && notification.booking.id ? notification.booking.id : null,
                });
            } catch (error) {
                // ignore
            }
        }

        return notification;
    }

    function markRead(notificationId, portalType) {
        const notifications = readNotifications();
        const idx = notifications.findIndex((item) => item.id === notificationId);
        if (idx === -1) return;

        if (!Array.isArray(notifications[idx].readBy)) {
            notifications[idx].readBy = [];
        }

        if (!notifications[idx].readBy.includes(portalType)) {
            notifications[idx].readBy.push(portalType);
            writeNotifications(notifications);
        }
    }

    function shouldDeliver(item, portalType) {
        if (!item || !portalType) return false;
        const targets = normalizeTargets(item.targetPortals);
        if (!targets.includes(portalType)) return false;
        return !(Array.isArray(item.readBy) && item.readBy.includes(portalType));
    }

    function listen(portalType, callback) {
        const safePortal = String(portalType || "").toLowerCase();
        if (!safePortal || typeof callback !== "function") return () => {};

        const processNotifications = (items) => {
            const list = Array.isArray(items) ? items : [];
            list.forEach((item) => {
                if (!shouldDeliver(item, safePortal)) return;

                const result = callback(item);
                if (result !== false) {
                    markRead(item.id, safePortal);
                }
            });
        };

        // Initial load
        processNotifications(readNotifications());

        const storageHandler = (event) => {
            if (event.key !== STORAGE_KEY || !event.newValue) return;
            try {
                const updated = JSON.parse(event.newValue);
                processNotifications(updated);
            } catch (error) {
                // ignore
            }
        };

        const localHandler = (event) => {
            const updated = event && event.detail && Array.isArray(event.detail.items) ? event.detail.items : [];
            processNotifications(updated);
        };

        global.addEventListener("storage", storageHandler);
        global.addEventListener(LOCAL_EVENT, localHandler);

        // Polling fallback for browsers/contexts that miss events
        const pollTimer = setInterval(() => {
            processNotifications(readNotifications());
        }, 4000);

        return () => {
            global.removeEventListener("storage", storageHandler);
            global.removeEventListener(LOCAL_EVENT, localHandler);
            clearInterval(pollTimer);
        };
    }

    function setActivePortal(portalType) {
        localStorage.setItem(PORTAL_KEY, String(portalType || "").toLowerCase());
    }

    function getUnreadCount(portalType) {
        const safePortal = String(portalType || "").toLowerCase();
        return readNotifications().filter((item) => shouldDeliver(item, safePortal)).length;
    }

    function broadcastToAll(payload) {
        return createNotification({
            ...(payload || {}),
            targetPortals: ["customer", "driver", "admin"],
        });
    }

    global.PortalConnector = {
        createNotification,
        listen,
        markRead,
        setActivePortal,
        getUnreadCount,
        getNotifications: readNotifications,
        broadcastToAll,
        keys: {
            STORAGE_KEY,
            PORTAL_KEY,
        },
    };
})(window);
