const parser = require('ua-parser-js');
const crypto = require('crypto');

function getClientIp(req) {
  return (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
}

function getCountry(req) {
  return (req.headers['cf-ipcountry'] || req.headers['x-country-code'] || 'unknown').toString();
}

function getDeviceMeta(req) {
  const uaRaw = req.headers['user-agent'] || '';
  const ua = parser(uaRaw);
  const browser = ua.browser.name || 'unknown';
  const os = ua.os.name || 'unknown';
  const fingerprint = crypto.createHash('sha256').update(`${uaRaw}|${os}|${browser}`).digest('hex');

  return {
    userAgent: uaRaw,
    browser,
    os,
    fingerprint
  };
}

module.exports = {
  getClientIp,
  getCountry,
  getDeviceMeta
};
