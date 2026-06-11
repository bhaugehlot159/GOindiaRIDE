# GOindiaRIDE Environment Setup Guide

## 📖 Table of Contents
1. [Critical Variables](#critical-variables)
2. [Security Variables](#security-variables)
3. [Third-Party Service Variables](#third-party-service-variables)
4. [Optional Variables](#optional-variables)
5. [Configuration Methods](#configuration-methods)
6. [Validation & Testing](#validation--testing)
7. [Troubleshooting](#troubleshooting)

---

## 🔴 Critical Variables

These variables MUST be set for the application to start in production.

### NODE_ENV

**Description**: Defines the application runtime environment  
**Type**: String  
**Values**: `production`, `development`, `test`  
**Default**: `development`  
**Required**: ✅ YES

**Example**:
```bash
NODE_ENV=production
```

**Behavior by Value**:
- `production`: All security validations enabled, startup config validation required
- `development`: Relaxed security, verbose logging, allows some dev endpoints
- `test`: Test configuration, uses test database

---

### MONGO_URI

**Description**: MongoDB connection string for database  
**Type**: String  
**Format**: `mongodb+srv://username:password@cluster.mongodb.net/database-name`  
**Required**: ✅ YES

**How to Get**:
1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a cluster (M5 or larger for production)
3. Click "Connect" button
4. Select "Connect your application"
5. Copy the connection string
6. Replace `<username>` and `<password>` with database user credentials
7. Replace `<database-name>` with your database name

**Example**:
```bash
MONGO_URI=mongodb+srv://goindiaride_prod:aBcD1234eFgh5678@cluster0.mongodb.net/goindiaride-prod
```

**Validation**:
```bash
# Test connection
NODE_ENV=production node -e "
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_URI).then(() => {
  console.log('✓ MongoDB connected');
  process.exit(0);
}).catch(err => console.error('✗ Error:', err.message));
"
```

---

### JWT_SECRET

**Description**: Secret key for signing JSON Web Tokens (authentication)  
**Type**: String  
**Min Length**: 32 characters  
**Required**: ✅ YES  
**Rotation**: Every 90 days recommended

**How to Generate**:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Example** (don't use this exact value):
```bash
JWT_SECRET=f4c7d8a9e2b1f3c6d9a4e7b2f5c8d1a4e7b0f3c6d9a2e5b8f1c4d7a0e3
```

**Purpose**: Signs access tokens for user authentication  
**Lifespan**: Access tokens typically valid for 15 minutes

**Security Notes**:
- Use cryptographically random values only
- Never hardcode in application code
- Store in secure secrets manager
- Rotate periodically
- Keep different values for prod/staging

**Validation**:
```bash
# Check if set
test -n "$JWT_SECRET" && echo "✓ JWT_SECRET is set" || echo "✗ JWT_SECRET is missing"

# Check length
if [ ${#JWT_SECRET} -ge 32 ]; then
  echo "✓ JWT_SECRET is long enough (${#JWT_SECRET} chars)"
else
  echo "✗ JWT_SECRET too short (${#JWT_SECRET} chars, minimum 32)"
fi
```

---

### JWT_REFRESH_SECRET

**Description**: Secret key for signing refresh tokens  
**Type**: String  
**Min Length**: 32 characters  
**Required**: ✅ YES  
**Rotation**: Every 90 days recommended

**How to Generate**:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Example** (don't use this exact value):
```bash
JWT_REFRESH_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
```

**Purpose**: Signs refresh tokens (long-lived tokens for refreshing access tokens)  
**Lifespan**: Refresh tokens typically valid for 7-30 days

**Difference from JWT_SECRET**:
- JWT_SECRET: Short-lived (15 min), used for every API request
- JWT_REFRESH_SECRET: Long-lived (7+ days), used only when token expires

**Security Notes**:
- Must be different from JWT_SECRET
- Even stronger randomness recommended (use separate generation)
- Store separately if possible
- Different rotation schedule than JWT_SECRET

---

### FIREBASE_API_KEY

**Description**: Firebase Web API key for authentication  
**Type**: String  
**Required**: ✅ YES

**How to Get**:
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Click "Project Settings" (gear icon)
4. Go to "Your apps" section
5. Find your web app
6. Copy the "apiKey" value from config

**Example** (don't use this exact value):
```bash
FIREBASE_API_KEY=AIzaSyDALwUMYGGhDuqKRYDQICF1QwnDsJwalik
```

**Purpose**: Enables Firebase authentication (phone OTP, email/password)  
**Note**: This is NOT a secret key - it's a public identifier for your Firebase project

**Security Notes**:
- Can be known publicly (Firebase by design)
- But still move to environment variable to avoid repository exposure
- Don't hardcode in source files
- Helps prevent accidental credential leaks

**Validation**:
```bash
# Test Firebase connection
NODE_ENV=production node -e "
const admin = require('firebase-admin');
console.log('✓ Firebase API Key is set: ' + (process.env.FIREBASE_API_KEY ? 'YES' : 'NO'));
"
```

---

## 🟡 Security Variables

### WHATSAPP_WEBHOOK_VERIFY_TOKEN

**Description**: Token for verifying WhatsApp webhook callbacks from Meta  
**Type**: String  
**Min Length**: 16 characters  
**Required**: ✅ YES (if using WhatsApp integration)

**How to Get**:
1. Go to [Meta for Developers](https://developers.facebook.com)
2. Select your app
3. Go to "Webhooks" section
4. Look for "Verify Token" field
5. Set any random strong string (you define this)
6. Save and copy the value

**Example**:
```bash
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your-super-secret-webhook-token-12345
```

**How to Generate**:
```bash
node -e "console.log('whatsapp_token_' + require('crypto').randomBytes(16).toString('hex'))"
```

**Purpose**: Validates that webhook callbacks are from Meta (not spoofed)  
**Security**: Critical for webhook security

**Validation**:
```bash
# Test webhook endpoint
curl "http://localhost:5000/webhook?hub.mode=subscribe&hub.verify_token=$WHATSAPP_WEBHOOK_VERIFY_TOKEN&hub.challenge=test123"

# Should return: test123
```

---

### CORS_ORIGIN

**Description**: Allowed domains for Cross-Origin Resource Sharing  
**Type**: String or Array of Strings  
**Default**: `http://localhost:3000` (development)  
**Required**: ✅ YES (production)

**Example**:
```bash
# Single domain
CORS_ORIGIN=https://yourdomain.com

# Or multiple (if supported)
CORS_ORIGIN=https://yourdomain.com,https://www.yourdomain.com,https://app.yourdomain.com
```

**Purpose**: Prevents unauthorized websites from making requests to your API

**Security**:
- Set to your exact domain only
- Never use `*` (wildcard) in production
- Different for staging vs production
- Include both www and non-www if needed

**Common Mistakes**:
```bash
# ❌ WRONG - Too permissive
CORS_ORIGIN=*

# ❌ WRONG - Missing protocol
CORS_ORIGIN=yourdomain.com

# ❌ WRONG - Trailing slash
CORS_ORIGIN=https://yourdomain.com/

# ✅ CORRECT
CORS_ORIGIN=https://yourdomain.com
```

---

### SESSION_SECRET

**Description**: Secret for signing session cookies  
**Type**: String  
**Min Length**: 32 characters  
**Required**: 🟡 Recommended

**How to Generate**:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Example**:
```bash
SESSION_SECRET=f8a3e1b9c7d2f4a6e9b1c3d5e7f9a1b3c5d7e9f1a3b5c7d9e1f3a5b7c9d1
```

**Purpose**: Protects session cookies from tampering

---

### REQUEST_SIGNATURE_SECRET

**Description**: Secret for signing inter-service API requests  
**Type**: String  
**Min Length**: 32 characters  
**Required**: 🟡 Recommended

**Purpose**: Authenticates requests between backend services

---

## 🔵 Third-Party Service Variables

### Firebase Configuration

**FIREBASE_AUTH_DOMAIN**
- Value: `your-project.firebaseapp.com`
- Location: Firebase Console > Project Settings

**FIREBASE_PROJECT_ID**
- Value: Your Firebase project ID
- Location: Firebase Console > Project Settings

**FIREBASE_STORAGE_BUCKET**
- Value: `your-project.appspot.com`
- Location: Firebase Console > Project Settings

**FIREBASE_MESSAGING_SENDER_ID**
- Value: Your Firebase messaging sender ID
- Location: Firebase Console > Project Settings

**FIREBASE_APP_ID**
- Value: Your Firebase app ID
- Location: Firebase Console > Project Settings

---

### WhatsApp Business Configuration

**WHATSAPP_BUSINESS_PHONE_NUMBER_ID**
- Description: Your WhatsApp Business Phone Number ID
- Location: Meta Business Manager > WhatsApp > Settings
- Format: Numeric ID

**WHATSAPP_BUSINESS_ACCOUNT_ID**
- Description: Your WhatsApp Business Account ID
- Location: Meta Business Manager
- Format: Numeric ID

**WHATSAPP_API_ACCESS_TOKEN**
- Description: Long-lived access token for WhatsApp API
- Location: Meta for Developers > Your App > Tokens
- Rotation: Recommended every 60 days

---

### Email Configuration (SMTP)

**SMTP_HOST**
- Description: SMTP server hostname
- Example: `smtp.gmail.com` or `mail.yourdomain.com`

**SMTP_PORT**
- Description: SMTP server port
- Example: `587` (TLS) or `465` (SSL)
- Default: 587

**SMTP_USER**
- Description: Email account username
- Example: `notifications@yourdomain.com`

**SMTP_PASSWORD**
- Description: Email account password
- Note: Use app-specific password if available

**SMTP_FROM**
- Description: "From" email address for notifications
- Example: `noreply@yourdomain.com`

---

### Google Maps Configuration

**GOOGLE_MAPS_API_KEY**
- Description: Google Maps API key for routing and distance calculation
- Location: [Google Cloud Console](https://console.cloud.google.com)
- Steps:
  1. Create/select project
  2. Enable "Maps JavaScript API"
  3. Create API key
  4. Set restrictions to your domain
  5. Copy the key

---

### Stripe Configuration (if using payments)

**STRIPE_PUBLIC_KEY**
- Description: Publishable Stripe key (use in frontend)
- Format: `pk_live_...` or `pk_test_...`
- Location: [Stripe Dashboard](https://dashboard.stripe.com)

**STRIPE_SECRET_KEY**
- Description: Secret Stripe key (use in backend only)
- Format: `sk_live_...` or `sk_test_...`
- Location: [Stripe Dashboard](https://dashboard.stripe.com)
- ⚠️ KEEP SECRET - Never expose in frontend

**STRIPE_WEBHOOK_SECRET**
- Description: Webhook signing secret for Stripe events
- Location: [Stripe Dashboard > Webhooks](https://dashboard.stripe.com/webhooks)

---

## 🟢 Optional Variables

### Monitoring & Logging

**LOG_LEVEL**
- Values: `error`, `warn`, `info`, `debug`, `trace`
- Default: `info`
- Example: `LOG_LEVEL=debug`

**LOG_FILE_PATH**
- Description: Path where logs are written
- Example: `/var/log/goindiaride/app.log`

**SENTRY_DSN**
- Description: Sentry error tracking URL
- Example: `https://key@sentry.io/project-id`
- Purpose: Send errors to Sentry for monitoring

---

### Database Backup

**DB_BACKUP_ENABLED**
- Values: `true` or `false`
- Default: `true`

**DB_BACKUP_SCHEDULE**
- Description: Cron schedule for automatic backups
- Default: `0 2 * * *` (2 AM daily)

**DB_BACKUP_RETENTION_DAYS**
- Description: How many days to keep backups
- Default: `30`

---

## ⚙️ Configuration Methods

### Method 1: Environment File (.env.production)

**File Location**: Root directory or `backend/` directory

```bash
# Copy template
cp .env.production.example .env.production

# Edit file
nano .env.production

# Set permissions
chmod 600 .env.production
```

**Load Variables**:
```bash
source .env.production
NODE_ENV=production npm start
```

**Advantages**:
- Simple for local development
- Easy to version control template

**Disadvantages**:
- File must be kept secure
- Easy to accidentally commit
- Not ideal for production

---

### Method 2: Platform Environment Variables (Recommended for Production)

**Render.com**:
1. Dashboard > Your Service > Environment
2. Add each variable one by one
3. Click Deploy

**Heroku**:
```bash
heroku config:set JWT_SECRET=your_value
heroku config:set MONGO_URI=your_value
```

**AWS**:
- Option A: Elastic Beanstalk > Configuration > Environment Properties
- Option B: ECS Task Definition environment variables
- Option C: AWS Secrets Manager (recommended)

**Railway/Fly.io**: Similar to Render - web interface

**Advantages**:
- Secure - stored encrypted by platform
- Audit trail of changes
- Easy to rotate secrets
- No file management

**Disadvantages**:
- Platform-specific
- Requires learning platform documentation

---

### Method 3: Secrets Manager (Enterprise)

**AWS Secrets Manager**:
```bash
aws secretsmanager create-secret \
  --name goindiaride/prod/jwt-secret \
  --secret-string $(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
```

**Load in Application**:
```javascript
const AWS = require('aws-sdk');
const secretsManager = new AWS.SecretsManager();

const secret = await secretsManager.getSecretValue({
  SecretId: 'goindiaride/prod/jwt-secret'
}).promise();

process.env.JWT_SECRET = secret.SecretString;
```

**Advantages**:
- Maximum security
- Automatic rotation support
- Full audit trail
- Enterprise-grade

---

## ✅ Validation & Testing

### Quick Validation Script

```bash
#!/bin/bash
# validate-env.sh

echo "Validating GOindiaRIDE environment variables..."
echo ""

# Critical variables
CRITICAL_VARS=(
  "NODE_ENV"
  "MONGO_URI"
  "JWT_SECRET"
  "JWT_REFRESH_SECRET"
  "FIREBASE_API_KEY"
)

# Check critical variables
for var in "${CRITICAL_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    echo "✗ CRITICAL: $var is missing"
    exit 1
  else
    echo "✓ $var is set (${#!var} chars)"
  fi
done

# Check JWT secret length
if [ ${#JWT_SECRET} -lt 32 ]; then
  echo "✗ JWT_SECRET too short (${#JWT_SECRET} chars, minimum 32)"
  exit 1
fi

if [ ${#JWT_REFRESH_SECRET} -lt 32 ]; then
  echo "✗ JWT_REFRESH_SECRET too short (${#JWT_REFRESH_SECRET} chars, minimum 32)"
  exit 1
fi

echo ""
echo "✓ All critical variables validated successfully"
```

**Run Validation**:
```bash
source .env.production
bash validate-env.sh
```

---

### Test Database Connection

```bash
NODE_ENV=production node << 'EOF'
const mongoose = require('mongoose');

console.log('Connecting to database...');
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✓ Database connected successfully');
    console.log('✓ Testing query...');
    
    return mongoose.connection.db.admin().ping();
  })
  .then(() => {
    console.log('✓ Database responding to ping');
    process.exit(0);
  })
  .catch(err => {
    console.error('✗ Database connection failed:', err.message);
    process.exit(1);
  });
EOF
```

---

### Test Firebase Connection

```bash
NODE_ENV=production npm test -- --grep "Firebase"
```

---

## 🆘 Troubleshooting

### "JWT_SECRET is missing" Error

**Problem**: Server won't start  
**Solution**:
```bash
# Check if set
echo $JWT_SECRET

# If empty, set it
export JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Verify
echo $JWT_SECRET
```

---

### "MongoDB connection timeout" Error

**Problem**: Can't connect to database  
**Solutions**:
1. Check connection string format (should start with `mongodb+srv://`)
2. Verify IP whitelist in MongoDB Atlas includes your server
3. Test network connectivity: `ping cluster.mongodb.net`
4. Check database user password is correct

---

### "FIREBASE_API_KEY is not valid" Error

**Problem**: Firebase authentication failing  
**Solution**:
1. Go to Firebase Console
2. Verify API key is from correct project
3. Check project settings for correct values
4. Regenerate API key if needed

---

### "CORS policy blocked" Error

**Problem**: Frontend can't call API  
**Solution**:
```bash
# Check CORS_ORIGIN matches your frontend domain exactly
echo $CORS_ORIGIN

# Must be exact match (including https:// and no trailing slash)
# Correct: https://yourdomain.com
# Wrong: yourdomain.com, https://yourdomain.com/, *
```

---

## 📋 Environment Variable Checklist

### For Development
- [ ] NODE_ENV=development
- [ ] MONGO_URI (local MongoDB)
- [ ] JWT_SECRET (can be simple for dev)
- [ ] FIREBASE_API_KEY

### For Staging
- [ ] NODE_ENV=production
- [ ] MONGO_URI (staging MongoDB Atlas)
- [ ] JWT_SECRET (random 32+ chars)
- [ ] JWT_REFRESH_SECRET (random 32+ chars)
- [ ] FIREBASE_API_KEY
- [ ] CORS_ORIGIN (staging domain)
- [ ] WHATSAPP_WEBHOOK_VERIFY_TOKEN

### For Production
- [ ] NODE_ENV=production
- [ ] MONGO_URI (production MongoDB Atlas)
- [ ] JWT_SECRET (random 32+ chars)
- [ ] JWT_REFRESH_SECRET (random 32+ chars)
- [ ] FIREBASE_API_KEY
- [ ] CORS_ORIGIN (production domain)
- [ ] WHATSAPP_WEBHOOK_VERIFY_TOKEN
- [ ] WHATSAPP_BUSINESS_PHONE_NUMBER_ID
- [ ] WHATSAPP_API_ACCESS_TOKEN
- [ ] GOOGLE_MAPS_API_KEY
- [ ] SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD
- [ ] LOG_LEVEL=info
- [ ] SENTRY_DSN (for error tracking)

---

## 📞 Getting Help

- **Firebase**: https://firebase.google.com/docs
- **MongoDB Atlas**: https://docs.atlas.mongodb.com
- **WhatsApp API**: https://developers.facebook.com/docs/whatsapp
- **Node.js Security**: https://nodejs.org/en/docs/guides/nodejs-security/

---

**Last Updated**: June 11, 2026  
**Version**: 1.0  
**Status**: Ready for Production
