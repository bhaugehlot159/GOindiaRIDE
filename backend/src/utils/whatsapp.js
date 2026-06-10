const logger = require('./logger');

function sanitizeText(value, maxLength = 500) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
}

function normalizePhone(value, defaultCountryCode = '91') {
  const raw = sanitizeText(value, 40);
  if (!raw) return '';

  const normalizedDefaultCountry = sanitizeText(defaultCountryCode, 6).replace(/\D/g, '') || '91';

  if (raw.startsWith('00')) {
    const digits = raw.slice(2).replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : '';
  }

  if (raw.startsWith('+')) {
    const digits = raw.slice(1).replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : '';
  }

  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
    return `+${normalizedDefaultCountry}${digits}`;
  }
  if (digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }
  return '';
}

function maskPhone(value) {
  const normalized = normalizePhone(value);
  if (!normalized) return '';
  const digits = normalized.replace(/\D/g, '');
  if (digits.length <= 4) return `+${digits}`;
  const visibleTail = digits.slice(-4);
  const hidden = '*'.repeat(Math.max(2, digits.length - 4));
  return `+${hidden}${visibleTail}`;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}

async function requestJson(url, { method = 'POST', headers = {}, body = '', timeoutMs = 20000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 20000));
  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal
    });
    const rawText = await response.text();
    const json = safeJsonParse(rawText);
    return {
      ok: response.ok,
      status: Number(response.status || 0),
      json,
      text: rawText
    };
  } finally {
    clearTimeout(timer);
  }
}

async function sendViaMeta({ to, text, defaultCountryCode = '91' }) {
  const accessToken = sanitizeText(process.env.WHATSAPP_META_ACCESS_TOKEN || process.env.META_WHATSAPP_ACCESS_TOKEN, 500);
  const phoneNumberId = sanitizeText(process.env.WHATSAPP_META_PHONE_NUMBER_ID || process.env.META_WHATSAPP_PHONE_NUMBER_ID, 80);
  const apiVersion = sanitizeText(process.env.WHATSAPP_META_API_VERSION || 'v20.0', 20) || 'v20.0';

  if (!accessToken || !phoneNumberId) {
    return { sent: false, skipped: true, reason: 'meta_not_configured' };
  }

  const normalizedTo = normalizePhone(to, defaultCountryCode);
  if (!normalizedTo) {
    return { sent: false, skipped: true, reason: 'invalid_recipient_phone' };
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizedTo.replace('+', ''),
    type: 'text',
    text: {
      preview_url: false,
      body: sanitizeText(text, 4096)
    }
  };

  try {
    const response = await requestJson(`https://graph.facebook.com/${apiVersion}/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: 'POST',
      timeoutMs: Number(process.env.WHATSAPP_HTTP_TIMEOUT_MS || 20000),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const reason = sanitizeText(response?.json?.error?.message || response.text || `meta_http_${response.status}`, 160);
      return {
        sent: false,
        skipped: false,
        reason: 'meta_send_failed',
        status: response.status,
        message: reason
      };
    }

    return {
      sent: true,
      skipped: false,
      provider: 'meta',
      messageId: sanitizeText(response?.json?.messages?.[0]?.id || '', 120),
      recipientMasked: maskPhone(normalizedTo)
    };
  } catch (error) {
    return {
      sent: false,
      skipped: false,
      reason: 'meta_request_failed',
      message: sanitizeText(error.message || 'meta_request_failed', 160)
    };
  }
}

function toTwilioWhatsAppAddress(phone, defaultCountryCode = '91') {
  const normalized = normalizePhone(phone, defaultCountryCode);
  if (!normalized) return '';
  return `whatsapp:${normalized}`;
}

async function sendViaTwilio({ to, text, defaultCountryCode = '91' }) {
  const accountSid = sanitizeText(process.env.WHATSAPP_TWILIO_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID, 80);
  const authToken = sanitizeText(process.env.WHATSAPP_TWILIO_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN, 200);
  const fromAddressRaw = sanitizeText(
    process.env.WHATSAPP_TWILIO_FROM
    || process.env.TWILIO_WHATSAPP_FROM
    || process.env.WHATSAPP_FROM,
    40
  );

  if (!accountSid || !authToken || !fromAddressRaw) {
    return { sent: false, skipped: true, reason: 'twilio_not_configured' };
  }

  const fromAddress = fromAddressRaw.startsWith('whatsapp:')
    ? fromAddressRaw
    : toTwilioWhatsAppAddress(fromAddressRaw, defaultCountryCode);
  const toAddress = toTwilioWhatsAppAddress(to, defaultCountryCode);
  if (!fromAddress || !toAddress) {
    return { sent: false, skipped: true, reason: 'invalid_twilio_address' };
  }

  const form = new URLSearchParams({
    To: toAddress,
    From: fromAddress,
    Body: sanitizeText(text, 1500)
  });
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  try {
    const response = await requestJson(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
      method: 'POST',
      timeoutMs: Number(process.env.WHATSAPP_HTTP_TIMEOUT_MS || 20000),
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: form.toString()
    });

    if (!response.ok) {
      const reason = sanitizeText(response?.json?.message || response.text || `twilio_http_${response.status}`, 160);
      return {
        sent: false,
        skipped: false,
        reason: 'twilio_send_failed',
        status: response.status,
        message: reason
      };
    }

    const sid = sanitizeText(response?.json?.sid || response?.json?.message_sid || '', 120);
    return {
      sent: true,
      skipped: false,
      provider: 'twilio',
      messageId: sid,
      recipientMasked: maskPhone(to)
    };
  } catch (error) {
    return {
      sent: false,
      skipped: false,
      reason: 'twilio_request_failed',
      message: sanitizeText(error.message || 'twilio_request_failed', 160)
    };
  }
}

async function sendWhatsAppMessage({ to, text, provider = '', defaultCountryCode = '91' }) {
  const resolvedProvider = sanitizeText(
    provider
    || process.env.BOOKING_WHATSAPP_PROVIDER
    || process.env.WHATSAPP_PROVIDER
    || 'meta',
    40
  ).toLowerCase();

  if (!to || !text) {
    return { sent: false, skipped: true, reason: 'missing_payload' };
  }

  if (!global.fetch || typeof global.fetch !== 'function') {
    logger.warn('whatsapp_send_skipped', { reason: 'fetch_unavailable' });
    return { sent: false, skipped: true, reason: 'fetch_unavailable' };
  }

  if (resolvedProvider === 'meta') {
    return sendViaMeta({ to, text, defaultCountryCode });
  }
  if (resolvedProvider === 'twilio') {
    return sendViaTwilio({ to, text, defaultCountryCode });
  }

  return { sent: false, skipped: true, reason: 'unsupported_provider' };
}

module.exports = {
  normalizePhone,
  maskPhone,
  sendWhatsAppMessage
};
