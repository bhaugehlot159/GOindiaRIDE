const crypto = require('crypto');
const env = require('../config/env');
const { estimateBookingFare } = require('../../../js/booking-fare-calculator');

function computeFareHash({ distanceKm, amount }) {
  return crypto.createHmac('sha256', env.apiSignatureSecret).update(`${distanceKm}:${amount}`).digest('hex');
}

function verifyFareIntegrity(req, res, next) {
  const fareEstimate = estimateBookingFare(req.body || {});
  const { fareHash } = req.body || {};
  if (!fareHash) {
    return res.status(400).json({ message: 'fareHash required for tamper detection' });
  }

  const clientAmount = Number(req.body?.amount ?? req.body?.totalFare ?? fareEstimate.totalFare ?? 0);
  if (Number.isFinite(clientAmount) && Math.abs(clientAmount - fareEstimate.totalFare) > 0.01) {
    return res.status(422).json({ message: 'Fare data tampering detected' });
  }

  const expected = computeFareHash({ distanceKm: fareEstimate.distanceKm, amount: fareEstimate.totalFare });
  if (expected !== fareHash) {
    return res.status(422).json({ message: 'Fare data tampering detected' });
  }

  req.recalculatedFare = fareEstimate.totalFare;
  req.fareEstimate = fareEstimate;
  return next();
}

module.exports = { verifyFareIntegrity, computeFareHash };
