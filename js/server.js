require("dotenv").config();

const express = require("express");
const app = express();

app.use(express.static("."));

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});

const mongoose = require("mongoose");

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB connected"))
.catch(err => console.log(err));

const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail", // या SMTP provider
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

const jwt = require("jsonwebtoken");

const token = jwt.sign({ userId: 123 }, process.env.JWT_SECRET);