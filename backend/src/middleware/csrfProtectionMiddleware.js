const { csrfShieldMiddleware } = require('./csrfShieldMiddleware');

const csrfProtection = csrfShieldMiddleware({
  strict: true
});

module.exports = { csrfProtection };
