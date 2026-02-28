const { getClientIp } = require('../utils/device');

let lockdownUntil = 0;
const reqCounter = new Map();

function databaseQueryRateMonitor(req, res, next) {
  const ip = getClientIp(req);
  const now = Date.now();
  const bucket = reqCounter.get(ip) || { count: 0, start: now };

  if (now - bucket.start > 60 * 1000) {
    bucket.count = 0;
    bucket.start = now;
  }

  bucket.count += 1;
  reqCounter.set(ip, bucket);

  if (bucket.count > 120) {
    lockdownUntil = Math.max(lockdownUntil, now + 10 * 60 * 1000);
  }

  req.queryRate = bucket.count;
  return next();
}

function smartLockdown(req, res, next) {
  if (Date.now() < lockdownUntil) {
    return res.status(503).json({ message: 'Smart lockdown active. Try later with CAPTCHA.' });
  }
  return next();
}

module.exports = {
  databaseQueryRateMonitor,
  smartLockdown
};
