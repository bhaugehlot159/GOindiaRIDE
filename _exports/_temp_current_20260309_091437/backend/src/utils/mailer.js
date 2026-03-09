const logger = require('./logger');

function toBool(value) {
  return String(value || '').toLowerCase() === 'true';
}

let cachedTransporter = null;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch (error) {
    return null;
  }

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = toBool(process.env.SMTP_SECURE);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
  });

  return cachedTransporter;
}

async function sendEmail({ to, subject, text, html }) {
  const transporter = getTransporter();

  if (!transporter) {
    logger.warn('otp_email_skipped', {
      reason: 'smtp_not_configured_or_nodemailer_missing',
      to,
      subject
    });
    return { skipped: true };
  }

  const fromName = process.env.SMTP_FROM_NAME || 'GOIndiaRIDE';
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;

  return transporter.sendMail({
    from: `${fromName} <${fromEmail}>`,
    to,
    subject,
    text,
    html
  });
}

module.exports = {
  getTransporter,
  sendEmail
};
