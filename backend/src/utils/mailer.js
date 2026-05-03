const logger = require('./logger');

function toBool(value) {
  return String(value || '').toLowerCase() === 'true';
}

function toTimeoutMs(value, fallbackMs) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallbackMs;
  return Math.floor(parsed);
}

let cachedTransporter = null;

function loadNodemailer() {
  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch (error) {
    return null;
  }
  return nodemailer;
}

function getBaseTransportSettings() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = toBool(process.env.SMTP_SECURE);
  const requireTLS = toBool(process.env.SMTP_REQUIRE_TLS);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const connectionTimeout = toTimeoutMs(process.env.SMTP_CONNECTION_TIMEOUT_MS, 12000);
  const greetingTimeout = toTimeoutMs(process.env.SMTP_GREETING_TIMEOUT_MS, 12000);
  const socketTimeout = toTimeoutMs(process.env.SMTP_SOCKET_TIMEOUT_MS, 20000);
  const dnsTimeout = toTimeoutMs(process.env.SMTP_DNS_TIMEOUT_MS, 12000);

  if (!host || !user || !pass) {
    return null;
  }

  return {
    host,
    port,
    secure,
    requireTLS,
    auth: { user, pass },
    connectionTimeout,
    greetingTimeout,
    socketTimeout,
    dnsTimeout
  };
}

function getTransportConfigs() {
  const base = getBaseTransportSettings();
  if (!base) return [];

  const fallbackPorts = String(process.env.SMTP_FALLBACK_PORTS || '2525,587,465')
    .split(',')
    .map((value) => Number(String(value || '').trim()))
    .filter((value) => Number.isFinite(value) && value > 0);

  const configs = [base];
  const seen = new Set([`${base.port}:${base.secure}`]);
  for (const fallbackPort of fallbackPorts) {
    const fallbackSecure = fallbackPort === 465;
    const key = `${fallbackPort}:${fallbackSecure}`;
    if (seen.has(key)) continue;
    seen.add(key);
    configs.push({
      ...base,
      port: fallbackPort,
      secure: fallbackSecure
    });
  }

  return configs;
}

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const nodemailer = loadNodemailer();
  if (!nodemailer) return null;

  const primaryConfig = getBaseTransportSettings();
  if (!primaryConfig) return null;

  cachedTransporter = nodemailer.createTransport(primaryConfig);

  return cachedTransporter;
}

async function sendEmail({ to, subject, text, html, disablePortFallback = false }) {
  const nodemailer = loadNodemailer();
  const transportConfigs = disablePortFallback
    ? (getBaseTransportSettings() ? [getBaseTransportSettings()] : [])
    : getTransportConfigs();

  if (!nodemailer || !transportConfigs.length) {
    logger.warn('otp_email_skipped', {
      reason: 'smtp_not_configured_or_nodemailer_missing',
      to,
      subject
    });
    return { skipped: true };
  }

  const fromName = process.env.SMTP_FROM_NAME || 'GOIndiaRIDE';
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
  let lastError = null;

  for (const transportConfig of transportConfigs) {
    const transporter = nodemailer.createTransport(transportConfig);
    try {
      return await transporter.sendMail({
        from: `${fromName} <${fromEmail}>`,
        to,
        subject,
        text,
        html
      });
    } catch (error) {
      lastError = error;
      logger.warn('smtp_send_attempt_failed', {
        host: transportConfig.host,
        port: transportConfig.port,
        secure: transportConfig.secure,
        disablePortFallback: Boolean(disablePortFallback),
        message: error.message
      });
    } finally {
      if (typeof transporter.close === 'function') {
        transporter.close();
      }
    }
  }

  throw lastError || new Error('smtp_send_failed');
}

module.exports = {
  getTransporter,
  sendEmail
};
