const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const User = require("./src/models/User");

mongoose.connect("mongodb://127.0.0.1:27017/goindiaride");

async function createAdmin() {
  try {
    const hashedPassword = await bcrypt.hash("admin123", 12);

    const admin = new User({
      name: "Admin User",
      email: "admin@test.com",
      phone: "9999999999",   // 👈 IMPORTANT ADD
      passwordHash: hashedPassword,
      role: "admin"
    });

    await admin.save();
    console.log("Admin created properly");
    process.exit();
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
}

createAdmin();