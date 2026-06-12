# GOindiaRIDE Production Deployment Guide

## 📋 Table of Contents
1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Environment Setup](#environment-setup)
3. [Database Preparation](#database-preparation)
4. [Security Configuration](#security-configuration)
5. [Deployment Steps](#deployment-steps)
6. [Post-Deployment Verification](#post-deployment-verification)
7. [Rollback Procedure](#rollback-procedure)
8. [Monitoring & Maintenance](#monitoring--maintenance)

---

## ✅ Pre-Deployment Checklist

### Security Review
- [ ] All hardcoded credentials removed from source code
- [ ] Firebase API key loaded from environment variables
- [ ] OTP dev mode bypass disabled
- [ ] Environment variables validation enabled
- [ ] HTTPS/SSL certificates configured
- [ ] CORS properly configured for production domain only
- [ ] Rate limiting enabled
- [ ] Security headers (Helmet.js) enabled
- [ ] CSRF protection enabled
- [ ] XSS protection headers set
- [ ] Password hashing enabled (bcrypt)

### Code Quality
- [ ] All console.log statements reviewed/removed
- [ ] Error handling properly implemented
- [ ] Input validation on all endpoints
- [ ] Demo content removed
- [ ] Development dependencies not installed in production
- [ ] All tests passing (npm test = 100% pass rate)

### Infrastructure
- [ ] Production database (MongoDB Atlas) set up
- [ ] Database backups configured and tested
- [ ] Redis cache (if used) configured
- [ ] CDN configured for static assets
- [ ] Load balancer configured (if needed)
- [ ] SSL/TLS certificates valid and not expired
- [ ] DNS records configured
- [ ] Server firewall rules configured

### Third-Party Services
- [ ] Firebase project created and configured
- [ ] WhatsApp Business Account approved by Meta
- [ ] Google Maps API key generated and rate limits set
- [ ] Email service (SMTP/SendGrid) configured
- [ ] Payment gateway (Stripe) configured (if applicable)
- [ ] SMS provider (Twilio) configured (if applicable)

### Monitoring & Logging
- [ ] Sentry (or similar) configured for error tracking
- [ ] Log aggregation service configured
- [ ] Uptime monitoring configured
- [ ] Performance monitoring configured
- [ ] Database monitoring enabled

---

## 🔧 Environment Setup

### 1. Create Production Environment File

```bash
# Copy the example file
cp .env.production.example .env.production

# Edit with your production values
nano .env.production
```

### 2. Generate Secure Secrets

```bash
# Generate JWT_SECRET (32+ characters)
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"

# Generate JWT_REFRESH_SECRET
node -e "console.log('JWT_REFRESH_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"

# Generate SESSION_SECRET
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"

# Generate REQUEST_SIGNATURE_SECRET
node -e "console.log('REQUEST_SIGNATURE_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Verify Environment Variables

```bash
# Source the env file and verify critical variables
source .env.production
echo "Checking critical variables..."
test -n "$JWT_SECRET" && echo "✓ JWT_SECRET set" || echo "✗ JWT_SECRET missing"
test -n "$JWT_REFRESH_SECRET" && echo "✓ JWT_REFRESH_SECRET set" || echo "✗ JWT_REFRESH_SECRET missing"
test -n "$MONGO_URI" && echo "✓ MONGO_URI set" || echo "✗ MONGO_URI missing"
test -n "$FIREBASE_API_KEY" && echo "✓ FIREBASE_API_KEY set" || echo "✗ FIREBASE_API_KEY missing"
test -n "$FIREBASE_REALTIME_DATABASE_URL" && echo "✓ FIREBASE_REALTIME_DATABASE_URL set" || echo "⚠ FIREBASE_REALTIME_DATABASE_URL missing (live RTDB mirror disabled)"
test -n "$GOOGLE_APPLICATION_CREDENTIALS$FIREBASE_SERVICE_ACCOUNT_BASE64$FIREBASE_SERVICE_ACCOUNT_JSON$FIREBASE_REALTIME_DATABASE_ACCESS_TOKEN" && echo "✓ Firebase RTDB server credential set" || echo "⚠ Firebase RTDB server credential missing (backend cannot write live RTDB)"
test -n "$WHATSAPP_WEBHOOK_VERIFY_TOKEN" && echo "✓ WHATSAPP_WEBHOOK_VERIFY_TOKEN set" || echo "✗ WHATSAPP_WEBHOOK_VERIFY_TOKEN missing"
```

---

## 💾 Database Preparation

### 1. MongoDB Atlas Setup

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a new cluster (M5 or higher for production)
3. Configure IP whitelist with production server IP
4. Create a database user with strong password
5. Get connection string
6. Update `MONGO_URI` in `.env.production`

### 2. Database Initialization

```bash
# Connect to production database
NODE_ENV=production npm run db:init

# Create necessary indexes
NODE_ENV=production npm run db:migrate
```

### 3. Backup Configuration

```bash
# Enable automatic backups in MongoDB Atlas
# - Visit Backup tab in Atlas Console
# - Set backup frequency: Daily or Continuous
# - Set retention: 30 days minimum
```

---

## 🔐 Security Configuration

### 1. SSL/TLS Certificates

```bash
# Using Let's Encrypt (recommended)
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com

# Update certificate paths in production config
# Certificates typically at: /etc/letsencrypt/live/yourdomain.com/
```

### 2. Firewall Rules

```bash
# Allow only necessary ports
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (redirect to HTTPS)
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 5000/tcp  # API (if not behind load balancer)
sudo ufw enable
```

### 3. Environment Variable Security

**Option A: Using `.env.production` (file-based)**
```bash
# Restrict file permissions
chmod 600 .env.production

# Only accessible by the app user
chown appuser:appuser .env.production
```

**Option B: Using System Environment Variables (recommended)**
```bash
# In your deployment platform (Render, Heroku, AWS, etc.)
# Add environment variables through the platform dashboard
# This keeps secrets out of version control entirely
```

**Option C: Using Secrets Manager (enterprise)**
```bash
# AWS Secrets Manager, Azure Key Vault, etc.
# Load secrets at runtime from secure service
```

### 4. Enable Security Middleware

The application already includes:
- ✅ Helmet.js for security headers
- ✅ Rate limiting
- ✅ CORS protection
- ✅ CSRF protection
- ✅ XSS protection headers

Verify in `backend/src/app.js`:
```javascript
// Confirm these are active:
app.use(helmet());                    // Security headers
app.use(rateLimiter);                 // Rate limiting
app.use(cors(corsOptions));           // CORS
app.use(csrfProtection);              // CSRF
```

---

## 🚀 Deployment Steps

### Option 1: Deploy to Render.com (Recommended for beginners)

1. **Connect Repository**
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Click "New +" → "Web Service"
   - Connect your GitHub repository

2. **Configure Build & Deployment**
   ```
   Environment: Node
   Build Command: npm run build (if needed)
   Start Command: npm start
   ```

3. **Set Environment Variables**
   - Add all variables from `.env.production` in Render dashboard
   - Do NOT upload `.env.production` file

4. **Deploy**
   - Click "Deploy"
   - Monitor logs for errors

### Option 2: Deploy to AWS EC2

```bash
# 1. Connect to your EC2 instance
ssh -i your-key.pem ec2-user@your-instance-ip

# 2. Install dependencies
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs git

# 3. Clone repository
cd /opt
sudo git clone https://github.com/yourusername/GOindiaRIDE.git
cd GOindiaRIDE

# 4. Install npm dependencies
npm ci --only=production

# 5. Create .env.production with production values
sudo nano backend/.env.production

# 6. Install PM2 for process management
sudo npm install -g pm2

# 7. Start application
pm2 start backend/ecosystem.config.js
pm2 save
pm2 startup

# 8. Setup reverse proxy with Nginx
sudo amazon-linux-extras install nginx1.12
sudo systemctl start nginx
```

### Option 3: Deploy with Docker

```bash
# Build Docker image
docker build -t goindiaride:latest .

# Run container with environment variables
docker run -d \
  --name goindiaride \
  -p 5000:5000 \
  --env-file .env.production \
  goindiaride:latest

# Or use Docker Compose
docker-compose -f docker-compose.prod.yml up -d
```

### Option 4: Deploy to Heroku

```bash
# Install Heroku CLI
curl https://cli-assets.heroku.com/install.sh | sh

# Login
heroku login

# Create app
heroku create your-app-name

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=your_value
heroku config:set JWT_REFRESH_SECRET=your_value
heroku config:set MONGO_URI=your_mongodb_uri
# ... set all other variables

# Deploy
git push heroku main

# View logs
heroku logs --tail
```

---

## ✔️ Post-Deployment Verification

### 1. Health Check

```bash
# Test if API is responding
curl https://yourdomain.com/

# Expected response:
# {"service":"GO India RIDE API","status":"ok","auth":"/api/auth"}
```

### 2. Test Critical Endpoints

```bash
# Test authentication
curl -X POST https://yourdomain.com/api/auth/phone \
  -H "Content-Type: application/json" \
  -d '{"phone":"+919876543210"}'

# Test WhatsApp webhook verification
curl "https://yourdomain.com/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test123"

# Expected: Returns the challenge value
```

### 3. Database Connection

```bash
# Check database connectivity
NODE_ENV=production node -e "
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_URI).then(() => {
  console.log('✓ Database connected');
  process.exit(0);
}).catch(err => {
  console.error('✗ Database connection failed:', err.message);
  process.exit(1);
});
"
```

### 4. Environment Variables Validation

```bash
# Server logs should show:
# "startup_configuration_valid" with all critical vars set
# Example:
# {"time":"2026-06-11T08:25:31.249Z","level":"info","message":"startup_configuration_valid","environment":"production","mongoUri":"mongodb+srv://...","jwtSecretSet":true,"firebaseKeySet":true}
```

### 5. Monitor Logs

```bash
# Check application logs for errors
NODE_ENV=production npm start 2>&1 | head -50

# Should see successful startup messages, no errors
```

### 6. Run Integration Tests

```bash
# Run production-like tests
NODE_ENV=production npm test

# Verify all tests pass
```

---

## 🔄 Rollback Procedure

### If deployment fails:

```bash
# 1. Stop the application
pm2 stop ecosystem.config.js
# or
docker-compose -f docker-compose.prod.yml down
# or
heroku ps:scale web=0

# 2. Revert to previous version
git revert HEAD
git push

# 3. Restart with previous version
pm2 start ecosystem.config.js
# or
docker-compose -f docker-compose.prod.yml up -d
# or
git push heroku previous-version:main

# 4. Verify rollback
curl https://yourdomain.com/
```

### Database Rollback (if migration failed):

```bash
# MongoDB - restore from backup
mongorestore --uri="your_production_uri" --archive=backup.archive

# Or in MongoDB Atlas:
# 1. Go to Backup tab
# 2. Click "Restore" for a previous backup point
# 3. Create new cluster or overwrite current
```

---

## 📊 Monitoring & Maintenance

### Daily Checks

- [ ] Application running without errors
- [ ] No spike in error rates
- [ ] Database responding normally
- [ ] API response times acceptable
- [ ] Third-party service connections active

### Weekly Checks

- [ ] Review application logs
- [ ] Check database size and growth
- [ ] Verify backup completion
- [ ] Check SSL certificate expiration (should be >30 days)
- [ ] Review security logs

### Monthly Tasks

- [ ] Rotate JWT secrets (if using long-lived tokens)
- [ ] Update npm dependencies for security patches
- [ ] Test database restore procedure
- [ ] Review and optimize slow queries
- [ ] Audit access logs for suspicious activity
- [ ] Check SSL certificate renewal

### Quarterly Tasks

- [ ] Full security audit
- [ ] Load testing to verify capacity
- [ ] Disaster recovery drill
- [ ] Update documentation
- [ ] Review and update security policies

### Useful Monitoring Commands

```bash
# Monitor application performance
pm2 monit

# View application logs
pm2 logs

# Check database size
mongo --eval "db.stats()" --uri=$MONGO_URI

# Check API response times
curl -w "@curl-format.txt" https://yourdomain.com/

# Monitor disk space
df -h

# Monitor memory usage
free -h

# Check certificate expiration
openssl s_client -connect yourdomain.com:443 -servername yourdomain.com 2>/dev/null | \
  openssl x509 -noout -enddate
```

### Alert Configuration

Set up alerts for:
- Application crashes or restarts
- Database connection failures
- High error rates (>5% of requests)
- High response times (>2 seconds average)
- Disk space running low (<10% remaining)
- Certificate expiring soon (<30 days)
- Unusual request patterns

---

## 🆘 Troubleshooting

### Issue: "JWT_SECRET is missing"
**Solution**: Ensure `.env.production` is loaded before app starts
```bash
source .env.production
NODE_ENV=production npm start
```

### Issue: Database connection timeout
**Solution**: 
- Check MongoDB Atlas IP whitelist includes your server
- Verify MONGO_URI is correct
- Check network connectivity from server to MongoDB

### Issue: WhatsApp webhook failures
**Solution**:
- Verify `WHATSAPP_WEBHOOK_VERIFY_TOKEN` matches Meta configuration
- Check firewall allows incoming WebHook calls
- Verify endpoint is accessible from public internet

### Issue: High error rates after deployment
**Solution**:
- Check logs: `pm2 logs`
- Verify all environment variables are set
- Confirm database is accessible
- Ensure third-party services are available

### Issue: SSL/TLS certificate errors
**Solution**:
- Verify certificate is installed in correct location
- Check certificate hasn't expired
- Ensure domain name matches certificate
- Renew if within 30 days of expiration

---

## 📞 Support & Contacts

- **Emergency Escalation**: On-call team contact
- **Database Issues**: MongoDB Support
- **Firebase Issues**: Firebase Support Console
- **WhatsApp Integration**: Meta Business Help
- **Hosting Issues**: Your hosting provider support

---

## Version History

- **v1.0** - Initial production deployment guide
- **Production Deployment Date**: [Add date when deployed]
- **Last Updated**: 2026-06-11
- **Deployed By**: [Your name]
