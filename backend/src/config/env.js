const dotenv = require('dotenv');

dotenv.config();

const requiredEnv = ['MONGO_URI', 'JWT_SECRET', 'FIREBASE_KEY'];
requiredEnv.forEach((name) => {
  if (!process.env[name]) {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error(`Missing required environment variable: ${name}`);
    }
  }
});

module.exports = {
  port: Number(process.env.PORT || 5000),
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
  firebaseKey: process.env.FIREBASE_KEY,
  recaptchaSecret: process.env.RECAPTCHA_SECRET,
  corsOrigin: process.env.CORS_ORIGIN || 'https://goindiaride.in',
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL || '15m',
  refreshTokenTtl: process.env.REFRESH_TOKEN_TTL || '30d',
  adminAllowedIps: (process.env.ADMIN_ALLOWED_IPS || '').split(',').map((ip) => ip.trim()).filter(Boolean)
};
