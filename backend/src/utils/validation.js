/**
 * GOindiaRIDE - Centralized Input Validation Utilities
 * Safe, reusable validators for auth, booking, and profile routes.
 */

/**
 * Validate email format (RFC 5322 simplified).
 * Also rejects known disposable-mail domains.
 * @param {string} email
 * @returns {boolean}
 */
function validateEmail(email) {
  if (typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!emailRegex.test(email.trim())) return false;

  const disposableDomains = [
    'tempmail.com', 'guerrillamail.com', 'mailinator.com',
    'trashmail.com', 'yopmail.com', 'sharklasers.com'
  ];
  const domain = email.split('@')[1].toLowerCase();
  if (disposableDomains.includes(domain)) return false;

  return true;
}

/**
 * Validate Indian mobile number.
 * Accepts 10-digit numbers starting with 6-9, with optional +91 or 0 prefix.
 * @param {string} phone
 * @returns {boolean}
 */
function validateIndianPhone(phone) {
  if (typeof phone !== 'string') return false;
  // Strip country code prefix if present
  const stripped = phone.trim().replace(/^(\+91|91|0)/, '');
  return /^[6-9]\d{9}$/.test(stripped);
}

/**
 * Sanitize a plain-text user input field.
 * Trims whitespace, removes angle-bracket HTML tags, and enforces max length.
 * @param {*} input
 * @param {number} [maxLen=500]
 * @returns {string}
 */
function sanitizeInput(input, maxLen = 500) {
  return String(input == null ? '' : input)
    .trim()
    .replace(/<[^>]*>/g, '')   // strip HTML tags
    .substring(0, maxLen);
}

/**
 * Validate a non-empty string up to maxLen characters.
 * @param {*} value
 * @param {number} [maxLen=500]
 * @returns {boolean}
 */
function validateNonEmptyString(value, maxLen = 500) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLen;
}

module.exports = { validateEmail, validateIndianPhone, sanitizeInput, validateNonEmptyString };
