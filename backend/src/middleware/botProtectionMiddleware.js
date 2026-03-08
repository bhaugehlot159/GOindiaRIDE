function honeypotCheck(req, res, next) {
  if (req.body && req.body.website) {
    return res.status(400).json({ message: 'Bot detected' });
  }
  return next();
}

function submissionTimingCheck(req, res, next) {
  const submittedAt = Number(req.body?.submittedAt || 0);
  if (submittedAt && Date.now() - submittedAt < 800) {
    return res.status(429).json({ message: 'Submission too fast, suspected automation' });
  }
  return next();
}

function recaptchaPresenceCheck(req, res, next) {

  // ✅ Development mode में reCAPTCHA skip
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }

  const token = req.body?.recaptchaToken || req.headers['x-recaptcha-token'];

  if (!token) {
    return res.status(400).json({ message: 'reCAPTCHA token required' });
  }

  return next();
}

module.exports = {
  honeypotCheck,
  submissionTimingCheck,
  recaptchaPresenceCheck
};
