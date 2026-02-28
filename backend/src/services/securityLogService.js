const SecurityLog = require('../models/SecurityLog');

async function logSecurityEvent({ userId, action, ip, riskScore = 0, result, metadata = {} }) {
  await SecurityLog.create({ userId, action, ip, riskScore, result, metadata });
}

async function getSecurityDashboardStats() {
  const blockedUsers = await SecurityLog.countDocuments({ action: 'user_blocked', createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } });
  const highRiskEvents = await SecurityLog.countDocuments({ riskScore: { $gte: 70 }, createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } });
  const suspiciousActivity = await SecurityLog.find({ result: { $in: ['blocked', 'flagged'] } }).sort({ createdAt: -1 }).limit(20).lean();

  return { blockedUsers, highRiskEvents, suspiciousActivity };
}

module.exports = {
  logSecurityEvent,
  getSecurityDashboardStats
};
