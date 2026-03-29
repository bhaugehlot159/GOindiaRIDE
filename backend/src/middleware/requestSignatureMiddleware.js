const crypto = require('crypto');
const RequestReplay = require('../models/RequestReplay');
const env = require('../config/env');

const MAX_SKEW_MS = 5 * 60 * 1000;
const HEX_SHA256_REGEX = /^[a-f0-9]{64}$/i;

function isTimingSafeEqual(expected, provided) {
  const expectedBuffer = Buffer.from(String(expected || ''), 'utf8');
  const providedBuffer = Buffer.from(String(provided || ''), 'utf8');
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

async function verifyApiSignature(req, res, next) {
  const timestamp = Number(req.headers['x-timestamp']);
  const signature = (req.headers['x-signature'] || '').toString();

  if (!Number.isFinite(timestamp) || !signature) {
    return res.status(401).json({ message: 'Missing API signature headers' });
  }

  if (!HEX_SHA256_REGEX.test(signature)) {
    return res.status(401).json({ message: 'Invalid API signature format' });
  }

  if (Math.abs(Date.now() - timestamp) > MAX_SKEW_MS) {
    return res.status(401).json({ message: 'Expired request timestamp' });
  }

  const exists = await RequestReplay.exists({ signature });
  if (exists) {
    return res.status(409).json({ message: 'Replay attack detected' });
  }

  const payload = `${timestamp}:${req.method}:${req.originalUrl}:${JSON.stringify(req.body || {})}`;
  const expected = crypto.createHmac('sha256', env.apiSignatureSecret).update(payload).digest('hex');
  if (!isTimingSafeEqual(expected, signature)) {
    return res.status(401).json({ message: 'Invalid API signature' });
  }

  try {
    await RequestReplay.create({ signature, timestamp, ip: req.ip });
  } catch (error) {
    // Unique-key collision during concurrent requests is treated as replay.
    if (error && error.code === 11000) {
      return res.status(409).json({ message: 'Replay attack detected' });
    }
    throw error;
  }

  return next();
}

module.exports = { verifyApiSignature };
