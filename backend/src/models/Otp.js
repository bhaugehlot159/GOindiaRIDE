const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema(
  {
    // customer / driver / admin
    accountType: {
      type: String,
      enum: ["customer", "driver", "admin"],
      required: true,
      index: true,
    },

    purpose: {
      type: String,
      enum: ["login"],
      default: "login",
      index: true,
    },

    // OTP भेजने का तरीका: अभी email (workspace) use करेंगे, sms बाद में
    channel: {
      type: String,
      enum: ["email", "sms"],
      required: true,
      index: true,
    },

    // Email OTP के लिए
    email: {
      type: String,
      trim: true,
      lowercase: true,
      index: true,
      default: null,
    },

    // Mobile OTP के लिए
    phone: {
      type: String,
      trim: true,
      index: true,
      match: [/^[6-9]\d{9}$/, "Invalid Indian phone number format"],
      default: null,
    },

    // Unique tracking (email या phone में से जो apply हो)
    identifier: {
      type: String,
      required: true,
      index: true,
    },

    // हम plain OTP store नहीं करेंगे — सिर्फ hash
    otpHash: {
      type: String,
      required: true,
    },

    // OTP expiry (TTL cleanup)
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },

    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },

    // resend control
    lastSentAt: {
      type: Date,
      default: null,
    },

    sendCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // basic security signals (optional)
    ip: { type: String, default: null },
    deviceFingerprint: { type: String, default: null },

    verifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Validate + identifier set
otpSchema.pre("validate", function (next) {
  if (this.channel === "email") {
    if (!this.email) return next(new Error("Email is required for email OTP"));
    this.identifier = this.email.toLowerCase().trim();
    this.phone = null;
  }

  if (this.channel === "sms") {
    if (!this.phone) return next(new Error("Phone is required for sms OTP"));
    this.identifier = String(this.phone).trim();
    this.email = null;
  }

  next();
});

// एक identifier + channel + accountType के लिए एक ही active OTP record (हम update करेंगे)
otpSchema.index(
  { identifier: 1, channel: 1, accountType: 1, purpose: 1 },
  { unique: true }
);

// TTL index: expiresAt के बाद doc अपने आप delete हो जाएगा
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Otp", otpSchema);