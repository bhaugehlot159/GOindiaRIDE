const { getClientIp } = require('../utils/device');

const blockedIpPrefixes = ['185.220.', '45.95.', '198.18.'];
const blockedAsnHints = ['digitalocean', 'm247', 'ovh'];

function proxyVpnRiskCheck(req, res, next) {
  const ip = getClientIp(req);
  const asn = (req.headers['x-asn-name'] || '').toString().toLowerCase();
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').trim().toLowerCase();
  const host = String(req.headers.host || '').trim().toLowerCase();
  const hasHostMismatch = Boolean(forwardedHost && host && forwardedHost !== host);
  const hasHeaderInjectionProbe = /[\r\n]/.test(forwardedHost) || /[\r\n]/.test(host);

  const prefixBlocked = blockedIpPrefixes.some((prefix) => ip.startsWith(prefix));
  const asnBlocked = blockedAsnHints.some((hint) => asn.includes(hint));

  if (prefixBlocked || asnBlocked || hasHostMismatch || hasHeaderInjectionProbe) {
    return res.status(403).json({ message: 'Request blocked due to suspicious network source' });
  }
  return next();
}

module.exports = { proxyVpnRiskCheck };
