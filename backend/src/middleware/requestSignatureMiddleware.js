const crypto = require('crypto');
const RequestReplay = require('../models/RequestReplay');
const env = require('../config/env');

const MAX_SKEW_MS = 5 * 60 * 1000;

async function verifyApiSignature(req, res, next) {
  const timestamp = Number(req.headers['x-timestamp']);
  const signature = (req.headers['x-signature'] || '').toString();

  if (!timestamp || !signature) {
    return res.status(401).json({ message: 'Missing API signature headers' });
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
  if (expected !== signature) {
    return res.status(401).json({ message: 'Invalid API signature' });
  }

  await RequestReplay.create({ signature, timestamp, ip: req.ip });
  return next();
}

module.exports = { verifyApiSignature };
