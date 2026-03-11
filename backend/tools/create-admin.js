/* eslint-disable no-console */
const mongoose = require("mongoose");
const { connectDb } = require("../src/config/db");
const User = require("../src/models/User");
const { hashPassword } = require("../src/utils/auth");

function parseArgs(argv) {
  const output = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      output[key] = true;
      continue;
    }
    output[key] = next;
    i += 1;
  }
  return output;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const name = String(args.name || "Primary Admin").trim();
  const email = String(args.email || "").trim().toLowerCase();
  const phone = String(args.phone || "").trim();
  const password = String(args.password || "").trim();
  const resetPassword = Boolean(args["reset-password"]);

  if (!email || !phone || !password) {
    throw new Error(
      "Missing required values. Use: --email <email> --phone <10-digit phone> --password <password> [--name <name>] [--reset-password]"
    );
  }

  const existingByEmail = await User.findOne({ email });
  const existingByPhone = await User.findOne({ phone });
  const existing = existingByEmail || existingByPhone;

  if (existing) {
    if (existing.role !== "admin" || existing.accountType !== "admin") {
      throw new Error(
        `User exists (${existing.email || "unknown"}) but is not admin. Use a different email/phone.`
      );
    }

    if (!resetPassword) {
      console.log(
        `Admin already exists: ${existing.email}. Use --reset-password to update password.`
      );
      return;
    }

    existing.passwordHash = await hashPassword(password);
    if (name) existing.name = name;
    await existing.save();
    console.log(`Admin password reset completed for: ${existing.email}`);
    return;
  }

  const passwordHash = await hashPassword(password);
  const adminUser = await User.create({
    name,
    email,
    phone,
    passwordHash,
    role: "admin",
    accountType: "admin",
  });

  console.log(`Admin created successfully: ${adminUser.email}`);
}

connectDb()
  .then(main)
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.connection.close();
    } catch {
      // ignore close errors
    }
  });
