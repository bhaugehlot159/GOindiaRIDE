const logger = require('../utils/logger');

async function sendSecurityAlert({ type, email = 'security@goindiaride.in', payload = {} }) {
  logger.warn('security_alert', { type, email, payload });
}

module.exports = { sendSecurityAlert };
