const { sendWhatsAppMessage, normalizePhone, maskPhone } = require('./whatsapp');
const logger = require('./logger');

function sanitizeText(value, maxLength = 500) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
}

function pickProvider({ hasOtp = false } = {}) {
  const explicit = sanitizeText(
    process.env.SMS_PROVIDER || (hasOtp ? process.env.OTP_SMS_PROVIDER : ''),
    40
  ).toLowerCase();
  if (explicit) return explicit;
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && (process.env.TWILIO_SMS_FROM || process.env.SMS_TWILIO_FROM)) return 'twilio';
  if (hasOtp && process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID) return 'msg91';
  if (hasOtp && process.env.FAST2SMS_API_KEY) return 'fast2sms';
  if ((process.env.WHATSAPP_META_ACCESS_TOKEN || process.env.META_WHATSAPP_ACCESS_TOKEN)
    && (process.env.WHATSAPP_META_PHONE_NUMBER_ID || process.env.META_WHATSAPP_PHONE_NUMBER_ID)) return 'whatsapp';
  if ((process.env.WHATSAPP_TWILIO_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID)
    && (process.env.WHATSAPP_TWILIO_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN)
    && (process.env.WHATSAPP_TWILIO_FROM || process.env.TWILIO_WHATSAPP_FROM || process.env.WHATSAPP_FROM)) return 'whatsapp';
  if (String(process.env.OTP_SMS_WHATSAPP_FALLBACK || '').toLowerCase() === 'true') return 'whatsapp';
  return '';
}

async function requestJson(url, { method = 'POST', headers = {}, body = '', timeoutMs = 20000 } = {}) {
  if (!global.fetch || typeof global.fetch !== 'function') {
    return { ok: false, status: 0, json: null, text: '', error: 'fetch_unavailable' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 20000));
  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal
    });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch (_error) {
      json = null;
    }
    return { ok: response.ok, status: response.status, json, text };
  } finally {
    clearTimeout(timer);
  }
}

async function sendViaTwilio({ to, text }) {
  const accountSid = sanitizeText(process.env.SMS_TWILIO_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID, 100);
  const authToken = sanitizeText(process.env.SMS_TWILIO_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN, 200);
  const from = sanitizeText(process.env.SMS_TWILIO_FROM || process.env.TWILIO_SMS_FROM || process.env.TWILIO_FROM, 40);
  const normalizedTo = normalizePhone(to);

  if (!accountSid || !authToken || !from) {
    return { sent: false, skipped: true, reason: 'twilio_sms_not_configured' };
  }
  if (!normalizedTo) {
    return { sent: false, skipped: true, reason: 'invalid_recipient_phone' };
  }

  const form = new URLSearchParams({
    To: normalizedTo,
    From: from,
    Body: sanitizeText(text, 1500)
  });
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  const response = await requestJson(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
    method: 'POST',
    timeoutMs: Number(process.env.SMS_HTTP_TIMEOUT_MS || 20000),
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form.toString()
  });

  if (!response.ok) {
    return {
      sent: false,
      skipped: false,
      reason: 'twilio_sms_send_failed',
      status: response.status,
      message: sanitizeText(response?.json?.message || response.text || response.error || 'twilio_sms_send_failed', 180)
    };
  }

  return {
    sent: true,
    skipped: false,
    provider: 'twilio',
    messageId: sanitizeText(response?.json?.sid || response?.json?.message_sid || '', 120),
    recipientMasked: maskPhone(normalizedTo)
  };
}

async function sendViaMsg91({ to, otp }) {
  const authKey = sanitizeText(process.env.MSG91_AUTH_KEY, 300);
  const templateId = sanitizeText(process.env.MSG91_TEMPLATE_ID || process.env.MSG91_OTP_TEMPLATE_ID, 120);
  const normalizedTo = normalizePhone(to);
  if (!authKey || !templateId) {
    return { sent: false, skipped: true, reason: 'msg91_not_configured' };
  }
  if (!normalizedTo || !otp) {
    return { sent: false, skipped: true, reason: 'invalid_msg91_payload' };
  }

  const mobile = normalizedTo.replace(/\D/g, '');
  const query = new URLSearchParams({
    template_id: templateId,
    mobile,
    authkey: authKey,
    otp: String(otp)
  });

  const response = await requestJson(`https://control.msg91.com/api/v5/otp?${query.toString()}`, {
    method: 'GET',
    timeoutMs: Number(process.env.SMS_HTTP_TIMEOUT_MS || 20000)
  });

  if (!response.ok || response?.json?.type === 'error') {
    return {
      sent: false,
      skipped: false,
      reason: 'msg91_send_failed',
      status: response.status,
      message: sanitizeText(response?.json?.message || response.text || response.error || 'msg91_send_failed', 180)
    };
  }

  return {
    sent: true,
    skipped: false,
    provider: 'msg91',
    messageId: sanitizeText(response?.json?.request_id || '', 120),
    recipientMasked: maskPhone(normalizedTo)
  };
}

async function sendViaFast2Sms({ to, otp }) {
  const apiKey = sanitizeText(process.env.FAST2SMS_API_KEY, 300);
  const normalizedTo = normalizePhone(to);
  if (!apiKey) {
    return { sent: false, skipped: true, reason: 'fast2sms_not_configured' };
  }
  if (!normalizedTo || !otp) {
    return { sent: false, skipped: true, reason: 'invalid_fast2sms_payload' };
  }

  const numbers = normalizedTo.replace(/^\+91/, '').replace(/\D/g, '');
  const body = new URLSearchParams({
    route: 'otp',
    variables_values: String(otp),
    numbers
  });

  const response = await requestJson('https://www.fast2sms.com/dev/bulkV2', {
    method: 'POST',
    timeoutMs: Number(process.env.SMS_HTTP_TIMEOUT_MS || 20000),
    headers: {
      authorization: apiKey,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });

  if (!response.ok || response?.json?.return === false) {
    return {
      sent: false,
      skipped: false,
      reason: 'fast2sms_send_failed',
      status: response.status,
      message: sanitizeText(response?.json?.message || response.text || response.error || 'fast2sms_send_failed', 180)
    };
  }

  return {
    sent: true,
    skipped: false,
    provider: 'fast2sms',
    messageId: sanitizeText(response?.json?.request_id || '', 120),
    recipientMasked: maskPhone(normalizedTo)
  };
}

async function sendSms({ to, text, otp, provider = '' }) {
  const resolvedProvider = sanitizeText(provider || pickProvider({ hasOtp: Boolean(otp) }), 40).toLowerCase();
  if (!to || !text) {
    return { sent: false, skipped: true, reason: 'missing_sms_payload' };
  }

  try {
    if (resolvedProvider === 'twilio') return await sendViaTwilio({ to, text });
    if (!otp && (resolvedProvider === 'msg91' || resolvedProvider === 'fast2sms')) {
      return { sent: false, skipped: true, reason: 'sms_provider_requires_otp_template' };
    }
    if (resolvedProvider === 'msg91') return await sendViaMsg91({ to, otp });
    if (resolvedProvider === 'fast2sms') return await sendViaFast2Sms({ to, otp });
    if (resolvedProvider === 'whatsapp') {
      const result = await sendWhatsAppMessage({
        to,
        text,
        provider: process.env.OTP_WHATSAPP_PROVIDER || process.env.WHATSAPP_PROVIDER || ''
      });
      return result.sent
        ? { ...result, provider: `whatsapp:${result.provider || 'configured'}` }
        : { ...result, reason: result.reason || 'whatsapp_send_failed' };
    }
    return { sent: false, skipped: true, reason: 'sms_provider_not_configured' };
  } catch (error) {
    logger.warn('otp_sms_send_failed', {
      provider: resolvedProvider || 'none',
      to: maskPhone(to),
      message: error.message
    });
    return {
      sent: false,
      skipped: false,
      reason: 'sms_send_failed',
      message: sanitizeText(error.message || 'sms_send_failed', 180)
    };
  }
}

module.exports = {
  maskPhone,
  normalizePhone,
  sendSms
};
