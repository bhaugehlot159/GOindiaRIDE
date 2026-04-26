const functions = require("firebase-functions/v1");
const logger = require("firebase-functions/logger");
const nodemailer = require("nodemailer");

const DEFAULT_ADMIN_ALERT_EMAIL = String(
  process.env.DEFAULT_ADMIN_ALERT_EMAIL || "bhaugehlot159@gmail.com",
).trim().toLowerCase();
const BOOKING_BROWSER_CLIENT_HEADER = String(
  process.env.BOOKING_BROWSER_CLIENT_HEADER || "goindiaride-web",
).trim().toLowerCase();
const BOOKING_FALLBACK_ALERT_REQUIRE_CLIENT_HEADER =
  String(process.env.BOOKING_FALLBACK_ALERT_REQUIRE_CLIENT_HEADER || "true").toLowerCase() === "true";

const FALLBACK_ALLOWED_ORIGINS = [
  "https://goindiaride.in",
  "https://www.goindiaride.in",
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5500",
];

const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = String(process.env.SMTP_SECURE || "true").toLowerCase() === "true";

let cachedTransporter = null;

function splitCsvValues(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isLikelyEmail(value) {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value)));
}

function uniqueEmails(list = []) {
  return [...new Set(list.map(normalizeEmail).filter(isLikelyEmail))];
}

function sanitizeText(value, maxLength = 300) {
  return String(value == null ? "" : value).trim().slice(0, maxLength);
}

function sanitizeStringArray(value, maxItems = 8, maxLength = 160) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => sanitizeText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function sanitizeBooleanMap(value, maxKeys = 40) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries = Object.entries(value).slice(0, maxKeys);
  return entries.reduce((acc, [key, raw]) => {
    const safeKey = sanitizeText(key, 60).replace(/\s+/g, "_");
    if (!safeKey) return acc;
    acc[safeKey] = Boolean(raw);
    return acc;
  }, {});
}

function normalizeInteger(value, fallback = 1, min = 1, max = 20) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function toAmount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return NaN;
  return Number(parsed.toFixed(2));
}

function toOrigin(rawValue) {
  try {
    return new URL(String(rawValue || "").trim()).origin.toLowerCase();
  } catch (_error) {
    return "";
  }
}

function resolveRequestOrigin(req) {
  const directOrigin = toOrigin(req.headers.origin);
  if (directOrigin) return directOrigin;
  return toOrigin(req.headers.referer);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function humanizeKey(key) {
  return String(key || "")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function listEnabledFlags(map = {}) {
  const enabled = Object.entries(map || {})
    .filter(([, value]) => Boolean(value))
    .map(([key]) => humanizeKey(key));
  return enabled.length ? enabled.join(", ") : "None";
}

function resolveAdminAlertRecipients() {
  const recipientVars = ["BOOKING_ADMIN_ALERT_EMAILS", "ADMIN_ALERT_EMAILS", "ADMIN_EMAILS"];
  const envEmails = recipientVars.flatMap((key) => splitCsvValues(process.env[key]));
  const defaultEmails = splitCsvValues(DEFAULT_ADMIN_ALERT_EMAIL);
  return uniqueEmails([...envEmails, ...defaultEmails]);
}

function resolveAllowedOrigins() {
  const csv = splitCsvValues(process.env.BOOKING_FALLBACK_ALERT_ALLOWED_ORIGINS);
  const raw = [...csv, ...FALLBACK_ALLOWED_ORIGINS];
  return [...new Set(raw.map((origin) => toOrigin(origin)).filter(Boolean))];
}

function isAllowedOrigin(origin) {
  if (!origin) return false;
  return resolveAllowedOrigins().includes(origin);
}

function setCorsHeaders(req, res) {
  const requestOrigin = resolveRequestOrigin(req);
  if (requestOrigin && isAllowedOrigin(requestOrigin)) {
    res.set("Access-Control-Allow-Origin", requestOrigin);
  } else {
    res.set("Access-Control-Allow-Origin", "https://goindiaride.in");
  }
  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.set(
    "Access-Control-Allow-Headers",
    "Content-Type,Authorization,X-Booking-Client,X-Request-Id,X-Timestamp,X-Idempotency-Key",
  );
}

function handlePreflight(req, res) {
  if (String(req.method || "").toUpperCase() !== "OPTIONS") return false;
  setCorsHeaders(req, res);
  return res.status(204).send("");
}

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const host = sanitizeText(process.env.SMTP_HOST || "", 120);
  const user = sanitizeText(process.env.SMTP_USER || "", 180);
  const pass = sanitizeText(process.env.SMTP_PASS || "", 300);

  if (!host || !user || !pass) {
    return null;
  }

  cachedTransporter = nodemailer.createTransport({
    host,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user, pass },
  });

  return cachedTransporter;
}

async function sendEmail({ to, subject, text, html }) {
  const transporter = getTransporter();
  if (!transporter) {
    return { skipped: true, reason: "smtp_not_configured" };
  }

  const fromName = sanitizeText(process.env.SMTP_FROM_NAME || "GOIndiaRIDE", 120);
  const fromEmail = sanitizeText(
    process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || "",
    180,
  );
  if (!fromEmail || !isLikelyEmail(fromEmail)) {
    return { skipped: true, reason: "smtp_from_email_missing" };
  }

  const info = await transporter.sendMail({
    from: `${fromName} <${fromEmail}>`,
    to,
    subject,
    text,
    html,
  });

  return { skipped: false, info };
}

function buildBookingContext(body = {}) {
  return {
    pickupLocation: sanitizeText(body.pickup || body.pickupLocation, 180),
    dropLocation: sanitizeText(body.drop || body.dropLocation, 180),
    rideDate: sanitizeText(body.rideDate, 40),
    rideTime: sanitizeText(body.rideTime, 40),
    returnDate: sanitizeText(body.returnDate, 40),
    returnTime: sanitizeText(body.returnTime, 40),
    tripPlan: sanitizeText(body.tripPlan, 80),
    paymentMethod: sanitizeText(body.paymentMethod, 80),
    vehicleType: sanitizeText(body.vehicleType || body.rideType, 80),
    passengers: normalizeInteger(body.passengers, 1, 1, 20),
    luggage: sanitizeText(body.luggage, 80),
    notes: sanitizeText(body.notes, 600),
    stops: sanitizeStringArray(body.stops, 8, 160),
    specialRequests: sanitizeBooleanMap(body.specialRequests, 60),
    safetyAccessibility: sanitizeBooleanMap(body.safetyAccessibility, 60),
  };
}

function buildBookingAdminEmailText({ booking, context, customer }) {
  const stopsText = context.stops.length ? context.stops.join(" | ") : "None";
  return [
    "New booking pending admin review",
    `Booking ID: ${booking.bookingId}`,
    `Status: ${booking.status}`,
    `Admin Review: ${booking.adminReviewStatus || "pending"}`,
    `Amount: INR ${Number(booking.amount || 0).toFixed(2)}`,
    `Distance: ${Number(booking.distanceKm || 0).toFixed(2)} km`,
    `Pickup: ${context.pickupLocation || "N/A"}`,
    `Drop: ${context.dropLocation || "N/A"}`,
    `Stops: ${stopsText}`,
    `Ride Date/Time: ${(context.rideDate || "N/A")} ${(context.rideTime || "")}`.trim(),
    `Trip Plan: ${context.tripPlan || "N/A"}`,
    `Vehicle Type: ${context.vehicleType || "N/A"}`,
    `Payment Method: ${context.paymentMethod || "N/A"}`,
    `Passengers: ${context.passengers || 1}`,
    `Special Requests: ${listEnabledFlags(context.specialRequests)}`,
    `Safety & Accessibility: ${listEnabledFlags(context.safetyAccessibility)}`,
    `Notes: ${context.notes || "None"}`,
    `Customer Name: ${customer.name || "N/A"}`,
    `Customer Email: ${customer.email || "N/A"}`,
    `Customer Phone: ${customer.phone || "N/A"}`,
    `Created At: ${booking.createdAt ? new Date(booking.createdAt).toISOString() : new Date().toISOString()}`,
  ].join("\n");
}

function buildBookingAdminEmailHtml({ booking, context, customer }) {
  const stopsText = context.stops.length ? context.stops.join(", ") : "None";
  const dataRows = [
    ["Booking ID", booking.bookingId],
    ["Status", booking.status],
    ["Admin Review", booking.adminReviewStatus || "pending"],
    ["Amount", `INR ${Number(booking.amount || 0).toFixed(2)}`],
    ["Distance", `${Number(booking.distanceKm || 0).toFixed(2)} km`],
    ["Pickup", context.pickupLocation || "N/A"],
    ["Drop", context.dropLocation || "N/A"],
    ["Stops", stopsText],
    ["Ride Date/Time", `${context.rideDate || "N/A"} ${context.rideTime || ""}`.trim()],
    ["Trip Plan", context.tripPlan || "N/A"],
    ["Vehicle Type", context.vehicleType || "N/A"],
    ["Payment Method", context.paymentMethod || "N/A"],
    ["Passengers", String(context.passengers || 1)],
    ["Special Requests", listEnabledFlags(context.specialRequests)],
    ["Safety & Accessibility", listEnabledFlags(context.safetyAccessibility)],
    ["Notes", context.notes || "None"],
    ["Customer Name", customer.name || "N/A"],
    ["Customer Email", customer.email || "N/A"],
    ["Customer Phone", customer.phone || "N/A"],
  ];

  const rows = dataRows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 10px;border:1px solid #e3eaf8;font-weight:600;">${escapeHtml(label)}</td><td style="padding:8px 10px;border:1px solid #e3eaf8;">${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  return `<div style="font-family:Arial,sans-serif;color:#1f2d3d;line-height:1.5;">
<h2 style="margin:0 0 12px;color:#0b2f5c;">New Booking Pending Admin Review</h2>
<p style="margin:0 0 14px;">A new customer booking has been created and is waiting for admin approval.</p>
<table style="border-collapse:collapse;width:100%;max-width:820px;background:#ffffff;">${rows}</table>
</div>`;
}

function buildBookingCustomerEmailText({ booking, context, customer }) {
  const stopsText = context.stops.length ? context.stops.join(" | ") : "None";
  return [
    "Your booking has been received by GO India RIDE.",
    `Booking ID: ${booking.bookingId}`,
    `Status: ${booking.status || "created"}`,
    `Admin Review: ${booking.adminReviewStatus || "pending"}`,
    `Pickup: ${context.pickupLocation || "N/A"}`,
    `Drop: ${context.dropLocation || "N/A"}`,
    `Ride Date/Time: ${(context.rideDate || "N/A")} ${(context.rideTime || "")}`.trim(),
    `Vehicle Type: ${context.vehicleType || "N/A"}`,
    `Trip Plan: ${context.tripPlan || "N/A"}`,
    `Payment Method: ${context.paymentMethod || "N/A"}`,
    `Stops: ${stopsText}`,
    `Passengers: ${context.passengers || 1}`,
    `Estimated Fare: INR ${Number(booking.amount || 0).toFixed(2)}`,
    "",
    "Thanks for booking with GO India RIDE.",
    "A driver will be assigned after admin approval.",
    `Customer: ${customer.name || "N/A"}`,
  ].join("\n");
}

function buildBookingCustomerEmailHtml({ booking, context, customer }) {
  const rows = [
    ["Booking ID", booking.bookingId],
    ["Status", booking.status || "created"],
    ["Admin Review", booking.adminReviewStatus || "pending"],
    ["Pickup", context.pickupLocation || "N/A"],
    ["Drop", context.dropLocation || "N/A"],
    ["Ride Date/Time", `${context.rideDate || "N/A"} ${context.rideTime || ""}`.trim()],
    ["Vehicle Type", context.vehicleType || "N/A"],
    ["Trip Plan", context.tripPlan || "N/A"],
    ["Payment Method", context.paymentMethod || "N/A"],
    ["Passengers", String(context.passengers || 1)],
    ["Estimated Fare", `INR ${Number(booking.amount || 0).toFixed(2)}`],
  ];

  const rowHtml = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 10px;border:1px solid #e3eaf8;font-weight:600;">${escapeHtml(label)}</td><td style="padding:8px 10px;border:1px solid #e3eaf8;">${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  return `<div style="font-family:Arial,sans-serif;color:#1f2d3d;line-height:1.5;">
<h2 style="margin:0 0 12px;color:#0b2f5c;">Booking Received</h2>
<p style="margin:0 0 14px;">Hi ${escapeHtml(customer.name || "Customer")}, your booking has been received successfully. It is currently pending admin review.</p>
<table style="border-collapse:collapse;width:100%;max-width:760px;background:#ffffff;">${rowHtml}</table>
<p style="margin-top:14px;">Thanks for choosing GO India RIDE.</p>
</div>`;
}

function normalizedRoutePath(req) {
  const path = sanitizeText(req.path || "/", 240).replace(/\/{2,}/g, "/");
  if (!path.startsWith("/")) return `/${path}`;
  return path;
}

function routeMatches(routePath, patterns) {
  return patterns.includes(routePath);
}

async function sendBookingAdminAlertEmail({ booking, context, customer }) {
  const recipients = resolveAdminAlertRecipients();
  if (!recipients.length) {
    return { sent: false, skipped: true, reason: "no_admin_recipients" };
  }

  const subject = `[GO India RIDE] New booking pending admin review - ${booking.bookingId}`;
  const text = buildBookingAdminEmailText({ booking, context, customer });
  const html = buildBookingAdminEmailHtml({ booking, context, customer });

  try {
    const result = await sendEmail({
      to: recipients.join(","),
      subject,
      text,
      html,
    });
    if (result.skipped) return { sent: false, skipped: true, reason: result.reason || "smtp_not_configured" };
    return { sent: true, skipped: false, recipients: recipients.length };
  } catch (error) {
    logger.error("booking_admin_email_failed", {
      bookingId: booking.bookingId,
      message: error.message,
    });
    return {
      sent: false,
      skipped: false,
      reason: "send_failed",
      message: sanitizeText(error.message, 140),
    };
  }
}

async function sendBookingCustomerConfirmationEmail({ booking, context, customer }) {
  const customerEmail = normalizeEmail(customer && customer.email);
  if (!isLikelyEmail(customerEmail)) {
    return { sent: false, skipped: true, reason: "missing_customer_email" };
  }

  const subject = `[GO India RIDE] Booking received - ${booking.bookingId}`;
  const text = buildBookingCustomerEmailText({ booking, context, customer });
  const html = buildBookingCustomerEmailHtml({ booking, context, customer });

  try {
    const result = await sendEmail({
      to: customerEmail,
      subject,
      text,
      html,
    });
    if (result.skipped) return { sent: false, skipped: true, reason: result.reason || "smtp_not_configured" };
    return { sent: true, skipped: false, recipient: customerEmail };
  } catch (error) {
    logger.error("booking_customer_email_failed", {
      bookingId: booking.bookingId,
      customerEmail,
      message: error.message,
    });
    return {
      sent: false,
      skipped: false,
      reason: "send_failed",
      message: sanitizeText(error.message, 140),
    };
  }
}

exports.api = functions
  .region("asia-south1")
  .runWith({ maxInstances: 10, timeoutSeconds: 60 })
  .https.onRequest(async (req, res) => {
  if (handlePreflight(req, res)) return;
  setCorsHeaders(req, res);

  const method = String(req.method || "GET").toUpperCase();
  const routePath = normalizedRoutePath(req);
  const runtimeTimestamp = new Date().toISOString();

  if (
    method === "GET" &&
    routeMatches(routePath, [
      "/health",
      "/future-runtime/status",
      "/future-runtime-business/status",
      "/api/future-runtime/status",
      "/api/future-runtime-business/status",
    ])
  ) {
    return res.status(200).json({
      status: "ok",
      service: "goindiaride-firebase-api",
      timestamp: runtimeTimestamp,
    });
  }

  if (
    method === "POST" &&
    routeMatches(routePath, [
      "/bookings/fallback/admin-alert-email",
      "/api/bookings/fallback/admin-alert-email",
    ])
  ) {
    const requestOrigin = resolveRequestOrigin(req);
    if (!isAllowedOrigin(requestOrigin)) {
      return res.status(403).json({ message: "Origin not allowed for fallback admin email alert" });
    }

    const bookingClient = sanitizeText(req.headers["x-booking-client"] || "", 80).toLowerCase();
    if (BOOKING_FALLBACK_ALERT_REQUIRE_CLIENT_HEADER && bookingClient !== BOOKING_BROWSER_CLIENT_HEADER) {
      return res.status(403).json({ message: "Booking client not allowed for fallback admin email alert" });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const bookingId = sanitizeText(body.bookingId || body.id, 80).toUpperCase();
    if (!bookingId || !/^(RID|BK)[A-Z0-9_-]{6,}$/.test(bookingId)) {
      return res.status(400).json({ message: "Valid bookingId is required" });
    }

    const bookingContext = buildBookingContext(body);
    if (!bookingContext.pickupLocation || !bookingContext.dropLocation) {
      return res.status(400).json({ message: "Pickup and drop locations are required" });
    }

    const amountInput = toAmount(body.amount ?? body.totalFare);
    const distanceInput = toAmount(body.distanceKm ?? body.distance);

    const booking = {
      bookingId,
      status: "created",
      adminReviewStatus: "pending",
      amount: Number.isFinite(amountInput) ? amountInput : 0,
      distanceKm: Number.isFinite(distanceInput) ? distanceInput : 0,
      createdAt: runtimeTimestamp,
    };

    const customerSnapshot = {
      name: sanitizeText(body.customerName || body.fullname || body.name, 140),
      email: sanitizeText(body.customerEmail || body.email, 180),
      phone: sanitizeText(body.customerPhone || body.phone, 40),
    };

    const adminEmail = await sendBookingAdminAlertEmail({
      booking,
      context: bookingContext,
      customer: customerSnapshot,
    });
    const customerEmail = await sendBookingCustomerConfirmationEmail({
      booking,
      context: bookingContext,
      customer: customerSnapshot,
    });

    if (!adminEmail || adminEmail.sent !== true) {
      return res.status(202).json({
        ok: false,
        bookingId,
        message: "Admin email not sent in fallback flow",
        adminEmail: adminEmail || { sent: false, reason: "unknown" },
        customerEmail: customerEmail || { sent: false, reason: "unknown" },
      });
    }

    return res.status(200).json({
      ok: true,
      bookingId,
      message: "Fallback admin alert email sent",
      adminEmail,
      customerEmail,
    });
  }

  return res.status(404).json({
    ok: false,
    message: "Route not found",
    routePath,
    method,
  });
  });
