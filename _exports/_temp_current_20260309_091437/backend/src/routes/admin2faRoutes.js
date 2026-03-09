console.log("ADMIN 2FA ROUTES LOADED");
const express = require("express");
const speakeasy = require("speakeasy");
const qrcode = require("qrcode");
const router = express.Router();

const User = require("../models/User"); // Admin model (same user model)
const auth = require("../middleware/authMiddleware");

// fallback for both export styles
const authenticate = auth.authenticate || auth;

router.post("/setup-2fa", authenticate, async (req, res) => {
  try {
    // check admin
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Only admin can enable 2FA" });
    }

    // 1) Generate secret
    const secret = speakeasy.generateSecret({
      name: "GoindiaRide Admin"
    });

    // 2) Save secret in DB (base32)
    await User.findByIdAndUpdate(req.user.id, {
      twoFactorSecret: secret.base32,
      isTwoFactorEnabled: true,
      twoFactorEnabled: true
    });

    // 3) Generate QR Code (data URL)
    const qrCodeImageUrl = await qrcode.toDataURL(secret.otpauth_url);

    return res.json({
      message: "2FA setup successful",
      qrCode: qrCodeImageUrl,
      secret: secret.base32
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error enabling admin 2FA" });
  }
});

module.exports = router;
