const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const bcrypt = require('bcrypt');

process.env.NODE_ENV = 'test';
process.env.TEST_MODE = 'true';
process.env.OTP_DEV_RESPONSE_ENABLED = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';
process.env.SMTP_HOST = '';
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';
process.env.WHATSAPP_META_ACCESS_TOKEN = '';
process.env.META_WHATSAPP_ACCESS_TOKEN = '';
process.env.WHATSAPP_META_PHONE_NUMBER_ID = '';
process.env.META_WHATSAPP_PHONE_NUMBER_ID = '';
process.env.TWILIO_ACCOUNT_SID = '';
process.env.TWILIO_AUTH_TOKEN = '';
process.env.TWILIO_SMS_FROM = '';
process.env.MSG91_AUTH_KEY = '';
process.env.MSG91_TEMPLATE_ID = '';
process.env.FAST2SMS_API_KEY = '';

const Otp = require('../src/models/Otp');
const User = require('../src/models/User');
const authRoutes = require('../src/routes/authRoutes');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  return app;
}

function createOtpStore() {
  const docs = new Map();

  function keyFrom({ identifier, channel, accountType, purpose = 'login' }) {
    return `${identifier}|${channel}|${accountType}|${purpose}`;
  }

  function attachDocMethods(doc) {
    doc.save = async () => {
      docs.set(keyFrom(doc), doc);
      return doc;
    };
    return doc;
  }

  return {
    docs,
    async findOne(query) {
      return docs.get(keyFrom(query)) || null;
    },
    async findOneAndUpdate(query, update) {
      const current = docs.get(keyFrom(query)) || {
        identifier: query.identifier,
        channel: query.channel,
        accountType: query.accountType,
        purpose: query.purpose || 'login',
        sendCount: 0,
        attempts: 0,
        verifiedAt: null,
      };
      Object.assign(current, update.$set || {});
      Object.entries(update.$setOnInsert || {}).forEach(([field, value]) => {
        if (current[field] === undefined) current[field] = value;
      });
      if (update.$inc?.sendCount) {
        current.sendCount = (current.sendCount || 0) + update.$inc.sendCount;
      }
      if (update.$currentDate?.lastSentAt) {
        current.lastSentAt = new Date();
      }
      docs.set(keyFrom(current), attachDocMethods(current));
      return current;
    },
    async deleteOne(query) {
      docs.delete(keyFrom(query));
      return { deletedCount: 1 };
    },
  };
}

function makeSelectChain(value) {
  return {
    select() {
      return {
        lean: async () => clone(value),
        then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
      };
    },
    lean: async () => clone(value),
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
}

function installAuthMocks({ accountType = 'admin', existingTrustedDevices = [] } = {}) {
  const otpStore = createOtpStore();
  const password = 'AdminPass123!';
  const passwordHash = bcrypt.hashSync(password, 4);
  const userDoc = {
    _id: 'admin-user-1',
    id: 'admin-user-1',
    name: 'Admin User',
    email: 'admin@example.com',
    phone: '+918426891471',
    passwordHash,
    role: accountType === 'admin' ? 'admin' : 'user',
    accountType,
    isPhoneVerified: false,
    trustedDevices: clone(existingTrustedDevices),
    refreshTokens: [],
    async save() {
      return this;
    },
  };

  const originals = {
    otpFindOne: Otp.findOne,
    otpFindOneAndUpdate: Otp.findOneAndUpdate,
    otpDeleteOne: Otp.deleteOne,
    userFindOne: User.findOne,
  };

  Otp.findOne = otpStore.findOne;
  Otp.findOneAndUpdate = otpStore.findOneAndUpdate;
  Otp.deleteOne = otpStore.deleteOne;
  User.findOne = (query = {}) => {
    if (query.email === userDoc.email || query.phone) return makeSelectChain(userDoc);
    if (query.$or) return makeSelectChain(userDoc);
    return makeSelectChain(null);
  };

  return {
    password,
    userDoc,
    otpStore,
    restore() {
      Otp.findOne = originals.otpFindOne;
      Otp.findOneAndUpdate = originals.otpFindOneAndUpdate;
      Otp.deleteOne = originals.otpDeleteOne;
      User.findOne = originals.userFindOne;
    },
  };
}

async function requestAdminOtp(app, channel, password) {
  const payload = channel === 'email'
    ? { channel, accountType: 'admin', email: 'admin@example.com', password }
    : { channel, accountType: 'admin', phone: '+918426891471', password };

  return request(app)
    .post('/api/auth/request-otp')
    .send(payload)
    .expect(200);
}

async function verifyAdminOtp(app, channel, otp, deviceFingerprint) {
  const payload = channel === 'email'
    ? { channel, accountType: 'admin', email: 'admin@example.com', otp, deviceFingerprint }
    : { channel, accountType: 'admin', phone: '+918426891471', otp, deviceFingerprint };

  return request(app)
    .post('/api/auth/otp/verify')
    .send(payload)
    .expect(200);
}

test('admin email OTP requests and verifies without device approval dead-end', async () => {
  const mocks = installAuthMocks({
    existingTrustedDevices: [{ fingerprint: 'old-device', approvalStatus: 'approved', approvalRequired: false }],
  });
  try {
    const app = createApp();
    const otpResponse = await requestAdminOtp(app, 'email', mocks.password);
    assert.match(otpResponse.body.devOtp, /^\d{6}$/);

    const verifyResponse = await verifyAdminOtp(app, 'email', otpResponse.body.devOtp, 'new-admin-email-device');
    assert.equal(verifyResponse.body.message, 'OTP verified successfully');
    assert.equal(verifyResponse.body.accountType, 'admin');
    assert.ok(verifyResponse.body.accessToken);

    const trusted = mocks.userDoc.trustedDevices.find((item) => item.fingerprint === 'new-admin-email-device');
    assert.equal(trusted.approvalStatus, 'approved');
    assert.equal(trusted.approvalRequired, false);
    assert.equal(trusted.approvalMethod, 'admin');

    const otpDoc = await mocks.otpStore.findOne({
      identifier: 'admin@example.com',
      channel: 'email',
      accountType: 'admin',
      purpose: 'login',
    });
    assert.ok(otpDoc.verifiedAt);
  } finally {
    mocks.restore();
  }
});

test('admin mobile OTP requests and verifies through the same backend flow', async () => {
  const mocks = installAuthMocks({
    existingTrustedDevices: [{ fingerprint: 'old-device', approvalStatus: 'approved', approvalRequired: false }],
  });
  try {
    const app = createApp();
    const otpResponse = await requestAdminOtp(app, 'sms', mocks.password);
    assert.match(otpResponse.body.devOtp, /^\d{6}$/);

    const verifyResponse = await verifyAdminOtp(app, 'sms', otpResponse.body.devOtp, 'new-admin-sms-device');
    assert.equal(verifyResponse.body.message, 'OTP verified successfully');
    assert.equal(verifyResponse.body.accountType, 'admin');
    assert.equal(verifyResponse.body.isPhoneVerified, true);
    assert.ok(verifyResponse.body.accessToken);

    const trusted = mocks.userDoc.trustedDevices.find((item) => item.fingerprint === 'new-admin-sms-device');
    assert.equal(trusted.approvalStatus, 'approved');
    assert.equal(trusted.approvalRequired, false);

    const otpDoc = await mocks.otpStore.findOne({
      identifier: '+918426891471',
      channel: 'sms',
      accountType: 'admin',
      purpose: 'login',
    });
    assert.ok(otpDoc.verifiedAt);
  } finally {
    mocks.restore();
  }
});

test('non-admin device approval denial does not consume a correct OTP', async () => {
  const mocks = installAuthMocks({
    accountType: 'customer',
    existingTrustedDevices: [{ fingerprint: 'known-customer-device', approvalStatus: 'approved', approvalRequired: false }],
  });
  try {
    const app = createApp();
    const otpResponse = await request(app)
      .post('/api/auth/request-otp')
      .send({ channel: 'email', accountType: 'customer', email: 'admin@example.com' })
      .expect(200);

    await request(app)
      .post('/api/auth/otp/verify')
      .send({
        channel: 'email',
        accountType: 'customer',
        email: 'admin@example.com',
        otp: otpResponse.body.devOtp,
        deviceFingerprint: 'unknown-customer-device',
      })
      .expect(403);

    const otpDoc = await mocks.otpStore.findOne({
      identifier: 'admin@example.com',
      channel: 'email',
      accountType: 'customer',
      purpose: 'login',
    });
    assert.equal(otpDoc.verifiedAt, null);
  } finally {
    mocks.restore();
  }
});
