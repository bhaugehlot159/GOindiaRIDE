const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.verifyExtraOtp = async (req, res) => {
  try {
    const { userId, otp } = req.body;

    if (!userId || !otp) {
      return res.status(400).json({ message: "UserId and OTP required" });
    }

    // Temporary OTP validation
    if (otp !== "123456") {
      return res.status(401).json({ message: "Invalid OTP" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const refreshToken = jwt.sign(
      { sub: user._id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: "7d" }
    );

    user.refreshToken = refreshToken;
    user.riskScore = 0;
    await user.save();

    res.json({
      message: "OTP verified successfully",
      refreshToken
    });

  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};