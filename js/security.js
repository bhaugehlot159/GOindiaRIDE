// ============================================
// SECURITY & SANITIZATION UTILITIES
// ============================================

/**
 * Sanitize input by stripping HTML tags and trimming whitespace
 * Prevents XSS attacks by removing potentially dangerous HTML
 * @param {string} input - The input string to sanitize
 * @returns {string} - The sanitized string
 */
function sanitizeInput(input) {
    if (!input) return '';
    
    // Convert to string if not already
    input = String(input);
    
    // Remove HTML tags (including script tags)
    input = input.replace(/<[^>]*>/g, '');
    
    // Trim whitespace
    input = input.trim();
    
    return input;
}

/**
 * Sanitize and validate email address
 * @param {string} email - The email address to sanitize and validate
 * @returns {string} - The sanitized email or empty string if invalid
 */
function sanitizeEmail(email) {
    if (!email) return '';
    
    // Sanitize input first
    email = sanitizeInput(email);
    
    // Convert to lowercase
    email = email.toLowerCase();
    
    // Basic email regex validation
    const emailRegex = /^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
    
    if (!emailRegex.test(email)) {
        return '';
    }
    
    return email;
}

/**
 * Sanitize and validate Indian phone number
 * Accepts 10-digit numbers with optional +91 or 0 prefix
 * @param {string} phone - The phone number to sanitize and validate
 * @returns {string} - The sanitized 10-digit phone number or empty string if invalid
 */
function sanitizePhone(phone) {
    if (!phone) return '';
    
    // Remove all non-digit characters
    phone = String(phone).replace(/\D/g, '');
    
    // Remove country code prefix if present (91)
    if (phone.startsWith('91') && phone.length === 12) {
        phone = phone.substring(2);
    }
    
    // Remove leading 0 if present
    if (phone.startsWith('0') && phone.length === 11) {
        phone = phone.substring(1);
    }
    
    // Validate it's exactly 10 digits starting with 6-9
    if (!/^[6-9]\d{9}$/.test(phone)) {
        return '';
    }
    
    return phone;
}

/**
 * Validate password strength
 * Requirements: minimum 6 characters, at least 1 number, 1 uppercase letter
 * @param {string} password - The password to validate
 * @returns {object} - Object with isValid boolean and message string
 */
function validatePassword(password) {
    if (!password) {
        return {
            isValid: false,
            message: 'Password is required'
        };
    }
    
    if (password.length < 6) {
        return {
            isValid: false,
            message: 'Password must be at least 6 characters long'
        };
    }
    
    if (!/\d/.test(password)) {
        return {
            isValid: false,
            message: 'Password must contain at least one number'
        };
    }
    
    if (!/[A-Z]/.test(password)) {
        return {
            isValid: false,
            message: 'Password must contain at least one uppercase letter'
        };
    }
    
    return {
        isValid: true,
        message: 'Password is strong'
    };
}

/**
 * Escape HTML special characters to prevent XSS injection
 * @param {string} str - The string to escape
 * @returns {string} - The escaped string
 */
function escapeHTML(str) {
    if (!str) return '';
    
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * SHA-256 password hashing using Web Crypto API
 * @param {string} password - The password to hash
 * @returns {Promise<string>} - The hashed password as a hex string
 */
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

console.log('✅ Security utilities loaded');
