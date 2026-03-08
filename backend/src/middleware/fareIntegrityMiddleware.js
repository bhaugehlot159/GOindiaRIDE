const crypto = require('crypto');
const env = require('../config/env');

function computeFareHash({ distanceKm, amount }) {
  return crypto.createHmac('sha256', env.apiSignatureSecret).update(`${distanceKm}:${amount}`).digest('hex');
}

function verifyFareIntegrity(req, res, next) {
  const { distanceKm = 0, amount = 0, fareHash } = req.body || {};
  if (!fareHash) {
    return res.status(400).json({ message: 'fareHash required for tamper detection' });
  }

  const expected = computeFareHash({ distanceKm, amount });
  if (expected !== fareHash) {
    return res.status(422).json({ message: 'Fare data tampering detected' });
  }

  req.recalculatedFare = Number(distanceKm) * 12;
  return next();
}

module.exports = { verifyFareIntegrity, computeFareHash };
