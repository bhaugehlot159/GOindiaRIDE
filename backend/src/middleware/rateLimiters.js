const rateLimit = require('express-rate-limit');

function buildLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message }
  });
}

const isTest = String(process.env.TEST_MODE || '').toLowerCase() === 'true';

const globalLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 2000 : 300,
  message: 'Too many API requests, please try later'
});

const loginLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 500 : 6,
  message: 'Too many login attempts, try again after 15 minutes'
});

const otpLimiter = buildLimiter({
  windowMs: isTest ? 60 * 1000 : 15 * 60 * 1000,
  max: isTest ? 500 : 4,
  message: 'OTP rate limit reached. Try later.'
});

const authBurstLimiter = buildLimiter({
  windowMs: 10 * 60 * 1000,
  max: isTest ? 800 : 25,
  message: 'Too many auth-sensitive requests. Please wait before retrying.'
});

const bookingWriteLimiter = buildLimiter({
  windowMs: 5 * 60 * 1000,
  max: isTest ? 1000 : 30,
  message: 'Too many booking actions from this session. Please slow down.'
});

const adminCriticalLimiter = buildLimiter({
  windowMs: 10 * 60 * 1000,
  max: isTest ? 500 : 15,
  message: 'Admin critical operation limit reached. Retry later.'
});

module.exports = {
  globalLimiter,
  loginLimiter,
  otpLimiter,
  authBurstLimiter,
  bookingWriteLimiter,
  adminCriticalLimiter
};
