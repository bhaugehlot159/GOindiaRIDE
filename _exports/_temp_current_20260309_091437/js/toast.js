/**
 * GO India RIDE - Toast Notification System
 * Replace alert() with styled toast notifications
 */

// Toast container styles
const toastContainerStyle = `
.toast-container {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 400px;
}

.toast {
    background: white;
    border-radius: 12px;
    padding: 1rem 1.5rem;
    box-shadow: 0 5px 20px rgba(0,0,0,0.2);
    display: flex;
    align-items: center;
    gap: 1rem;
    min-width: 300px;
    animation: slideIn 0.3s ease-out;
    position: relative;
    overflow: hidden;
}

.toast::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
}

.toast.success::before {
    background: #4caf50;
}

.toast.error::before {
    background: #f44336;
}

.toast.info::before {
    background: #2196F3;
}

.toast.warning::before {
    background: #ff9800;
}

.toast-icon {
    font-size: 1.5rem;
    flex-shrink: 0;
}

.toast.success .toast-icon {
    color: #4caf50;
}

.toast.error .toast-icon {
    color: #f44336;
}

.toast.info .toast-icon {
    color: #2196F3;
}

.toast.warning .toast-icon {
    color: #ff9800;
}

.toast-content {
    flex: 1;
}

.toast-title {
    font-weight: bold;
    color: #333;
    margin-bottom: 0.2rem;
}

.toast-message {
    color: #666;
    font-size: 0.9rem;
}

.toast-close {
    background: none;
    border: none;
    font-size: 1.2rem;
    color: #999;
    cursor: pointer;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: all 0.2s;
}

.toast-close:hover {
    background: #f0f0f0;
    color: #333;
}

@keyframes slideIn {
    from {
        transform: translateX(400px);
        opacity: 0;
    }
    to {
        transform: translateX(0);
        opacity: 1;
    }
}

@keyframes slideOut {
    from {
        transform: translateX(0);
        opacity: 1;
    }
    to {
        transform: translateX(400px);
        opacity: 0;
    }
}

.toast.hiding {
    animation: slideOut 0.3s ease-out forwards;
}

@media (max-width: 768px) {
    .toast-container {
        left: 20px;
        right: 20px;
        max-width: none;
    }
    
    .toast {
        min-width: auto;
        width: 100%;
    }
}
`;

// Initialize toast system
function initToastSystem() {
    // Add styles if not already added
    if (!document.getElementById('toast-styles')) {
        const styleElement = document.createElement('style');
        styleElement.id = 'toast-styles';
        styleElement.textContent = toastContainerStyle;
        document.head.appendChild(styleElement);
    }
    
    // Create toast container if not exists
    if (!document.getElementById('toast-container')) {
        const container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
}

// Icon map
const toastIcons = {
    success: '✅',
    error: '❌',
    info: 'ℹ️',
    warning: '⚠️'
};

// Show toast notification
function showToast(message, type = 'info', duration = 5000, title = '') {
    initToastSystem();
    
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // Determine title based on type if not provided
    if (!title) {
        title = type.charAt(0).toUpperCase() + type.slice(1);
    }
    
    toast.innerHTML = `
        <div class="toast-icon">${toastIcons[type] || 'ℹ️'}</div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    container.appendChild(toast);
    
    // Auto remove after duration
    if (duration > 0) {
        setTimeout(() => {
            toast.classList.add('hiding');
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, duration);
    }
    
    return toast;
}

// Helper functions for specific toast types
function showSuccessToast(message, title = 'Success') {
    return showToast(message, 'success', 5000, title);
}

function showErrorToast(message, title = 'Error') {
    return showToast(message, 'error', 6000, title);
}

function showInfoToast(message, title = 'Info') {
    return showToast(message, 'info', 5000, title);
}

function showWarningToast(message, title = 'Warning') {
    return showToast(message, 'warning', 5000, title);
}

// Booking-specific notifications
function notifyBookingConfirmed(bookingId) {
    showSuccessToast(
        `Your ride has been confirmed! Booking ID: ${bookingId}`,
        'Booking Confirmed!'
    );
}

function notifyDriverAssigned(driverName, eta = '5 minutes') {
    showSuccessToast(
        `${driverName} will be your driver. ETA: ${eta}`,
        'Driver Assigned'
    );
}

function notifyRideStarted() {
    showInfoToast(
        'Your ride has started. Have a safe journey!',
        'Ride Started'
    );
}

function notifyRideCompleted() {
    showSuccessToast(
        'Your ride has been completed! Please rate your driver.',
        'Ride Completed'
    );
}

function notifyDriverNotFound() {
    showWarningToast(
        'No drivers available at the moment. Please try again in a few minutes.',
        'No Drivers Available'
    );
}

function notifyPaymentSuccess(amount) {
    showSuccessToast(
        `Payment of ${amount} received successfully. Thank you!`,
        'Payment Successful'
    );
}

// Initialize on page load
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initToastSystem);
    } else {
        initToastSystem();
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        showToast,
        showSuccessToast,
        showErrorToast,
        showInfoToast,
        showWarningToast,
        notifyBookingConfirmed,
        notifyDriverAssigned,
        notifyRideStarted,
        notifyRideCompleted,
        notifyDriverNotFound,
        notifyPaymentSuccess
    };
}
