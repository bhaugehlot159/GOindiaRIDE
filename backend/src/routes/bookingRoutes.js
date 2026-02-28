const express = require('express');
const crypto = require('crypto');
const { authenticate } = require('../middleware/authMiddleware');
const { getClientIp } = require('../utils/device');
const Booking = require('../models/Booking');
const User = require('../models/User');
const { detectBookingFraud } = require('../services/riskService');

const router = express.Router();

router.post('/', authenticate, async (req, res) => {
  const { cardToken } = req.body;
  if (!cardToken) {
    return res.status(400).json({ message: 'cardToken is required' });
  }

  const ip = getClientIp(req);
  const cardHash = crypto.createHash('sha256').update(cardToken).digest('hex');

  const fraud = await detectBookingFraud({ userId: req.user.id, ip, cardHash });
  if (fraud.isFraud) {
    await User.findByIdAndUpdate(req.user.id, {
      isTemporarilyBannedUntil: new Date(Date.now() + 60 * 60 * 1000)
    });
    return res.status(403).json({ message: 'Fraud pattern detected, temporary ban applied', fraud });
  }

  const booking = await Booking.create({ userId: req.user.id, cardHash, ip, status: 'created' });
  return res.status(201).json({ bookingId: booking._id, status: booking.status });
});

router.post('/:id/cancel', authenticate, async (req, res) => {
  const booking = await Booking.findOneAndUpdate(
    { _id: req.params.id, userId: req.user.id },
    { status: 'cancelled' },
    { new: true }
  );
  if (!booking) return res.status(404).json({ message: 'Booking not found' });
  return res.json({ bookingId: booking._id, status: booking.status });
});

module.exports = router;
