import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import "./App.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
const SHOW_WORKING_AI_SECTIONS = false;

const portalCards = [
  {
    title: "Customer Portal",
    tag: "Safe rides, transparent fares",
    gradient: "from-[#FF9933] to-[#FFC46B]",
    bullets: [
      "Real-time fare preview incl. toll and night charges",
      "SOS with police and ambulance routes",
      "Multi-language (Hindi / English / Rajasthani)",
    ],
    actionPath: "/dashboard",
    dark: false,
  },
  {
    title: "Driver Portal",
    tag: "Low commission, full control",
    gradient: "from-[#138808] to-[#6AD182]",
    bullets: [
      "Document vault with expiry alerts",
      "Security deposit tracker and earnings board",
      "Ratings and penalties insight",
    ],
    actionPath: "/driver",
    dark: false,
  },
  {
    title: "Admin Command",
    tag: "Audit-ready governance",
    gradient: "from-[#0B1F3A] to-[#0f3c6e]",
    bullets: [
      "Auto-dispatch and fraud flags",
      "RBAC with IP allow-list and 2FA",
      "Smart lockdown and rate controls",
    ],
    actionPath: "/admin",
    dark: true,
  },
];

const securityHighlights = [
  {
    title: "Risk Engine",
    detail:
      "Login/device/IP scoring with auto-lock, OTP escalation and geo checks.",
  },
  {
    title: "Secure-by-default",
    detail:
      "Helmet, CORS whitelist (goindiaride.in), Mongo sanitize, XSS clean, and CSRF shield.",
  },
  {
    title: "Ops Ready",
    detail:
      "PM2 restarts, error scrubbing, request signature and replay protection baseline.",
  },
];

const aiAutomationDefaults = [
  {
    id: "dispatch",
    title: "AI Auto Dispatch",
    mode: "Auto",
    status: "healthy",
    detail: "Assigns nearest verified driver with rating and risk filters.",
  },
  {
    id: "fraud",
    title: "Fraud Firewall",
    mode: "Auto",
    status: "healthy",
    detail: "Flags rapid booking, card misuse, and suspicious cancel bursts.",
  },
  {
    id: "fare",
    title: "Smart Fare Guard",
    mode: "Auto",
    status: "healthy",
    detail: "Checks distance, toll, night charges, and fare hash integrity.",
  },
  {
    id: "sos",
    title: "Emergency AI Router",
    mode: "Auto",
    status: "healthy",
    detail: "Broadcasts SOS to admin and driver with incident priority.",
  },
  {
    id: "device",
    title: "Device Trust AI",
    mode: "Auto",
    status: "healthy",
    detail: "Approves known devices and sends unknown devices to verification.",
  },
  {
    id: "compliance",
    title: "Compliance Watch",
    mode: "Auto",
    status: "healthy",
    detail: "Monitors document expiry and security posture in all portals.",
  },
];

function formatNotificationTime(value) {
  if (!value) return "";
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function resolvePortalPath({ token, role, accountType }) {
  if (!token) return "/login";

  if (role === "admin" || accountType === "admin") {
    return "/admin";
  }

  if (accountType === "driver") {
    return "/driver";
  }

  return "/dashboard";
}

function getStatusStyle(status) {
  if (status === "critical") {
    return "bg-red-100 text-red-700 border-red-200";
  }
  if (status === "elevated") {
    return "bg-amber-100 text-amber-700 border-amber-200";
  }
  return "bg-emerald-100 text-emerald-700 border-emerald-200";
}

function Landing() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role") || "user";
  const accountType = localStorage.getItem("accountType") || "customer";
  const openPath = resolvePortalPath({ token, role, accountType });

  return (
    <div className="min-h-screen relative text-[#0B1F3A]">
      <div className="absolute inset-0 bg-gradient-to-br from-[#FF9933] via-white to-[#138808]" />
      <div className="absolute inset-0 dash-grid opacity-60" />
      <div className="absolute inset-0 bg-white/60 backdrop-blur-sm" />
      <div className="relative z-10 max-w-6xl mx-auto px-6 py-10 space-y-8">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full glass-card border border-[#0B1F3A]/10 grid place-items-center font-black text-[#0B1F3A]">
              GI
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-[#0B1F3A]/70">
                GoIndiaRide
              </p>
              <h1 className="text-3xl font-black tricolor-text">
                Bharat Mobility Cloud
              </h1>
            </div>
          </div>
          
        <div className="flex gap-3">
            <button
              onClick={() => navigate(openPath)}
              className="px-4 py-2 rounded-full bg-[#0B1F3A] text-white shadow-lg hover:scale-105 transition"
            >
              {token ? "Open Dashboard" : "Secure Login"}
            </button>
            <button
              onClick={() => navigate("/login")}
              className="px-4 py-2 rounded-full bg-white text-[#0B1F3A] border border-[#0B1F3A]/15 hover:border-[#0B1F3A]/40"
            >
              Admin / Driver
            </button>
          </div>
        </header>

        <section className="glass-card rounded-2xl p-6 border-l-4 border-saffron shadow-xl">
          <p className="text-sm uppercase tracking-[0.2em] text-[#0B1F3A]/70 mb-2">
            India-first promise
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold text-[#0B1F3A] mb-3">
            Secure rides, fraud defence, tri-colour pride.
          </h2>
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="px-3 py-1 rounded-full bg-white/70 border border-[#FF9933]/40 text-[#0B1F3A]">
              XSS and CSRF and signature verification
            </span>
            <span className="px-3 py-1 rounded-full bg-white/70 border border-[#138808]/40 text-[#0B1F3A]">
              Device fingerprint and geo checks
            </span>
            <span className="px-3 py-1 rounded-full bg-white/70 border border-[#0B1F3A]/20 text-[#0B1F3A]">
              Dispatch and anomaly alerts
            </span>
          </div>
        </section>

        <section className="grid md:grid-cols-3 gap-4">
          {portalCards.map((card) => (
            <div
              key={card.title}
              className={`glass-card rounded-2xl p-6 border shadow-md bg-gradient-to-br ${card.gradient} ${card.dark ? "portal-card-dark" : "text-[#0B1F3A]"}`}
            >
              <p className={`text-xs uppercase tracking-[0.15em] mb-2 ${card.dark ? "text-white/80" : "text-[#0B1F3A]/70"}`}>
                {card.tag}
              </p>
              <h3 className="text-xl font-bold mb-3">{card.title}</h3>
              <ul className={`space-y-2 text-sm ${card.dark ? "text-white/95" : "text-[#0B1F3A]/90"}`}>
                {card.bullets.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="text-lg">*</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => navigate(token ? card.actionPath : "/login")}
                className={`mt-4 inline-flex items-center justify-center px-3 py-2 rounded-full text-sm hover:scale-105 transition ${card.dark ? "bg-white text-[#0B1F3A]" : "bg-[#0B1F3A] text-white"}`}
              >
                Enter {card.title}
              </button>
            </div>
          ))}
        </section>

        <section className="grid md:grid-cols-3 gap-4">
          {securityHighlights.map((item) => (
            <div
              key={item.title}
              className="glass-card rounded-2xl p-4 border border-[#0B1F3A]/10"
            >
              <p className="text-sm font-semibold tricolor-text">{item.title}</p>
              <p className="text-sm text-[#0B1F3A]/80 mt-2">{item.detail}</p>
            </div>
          ))}
        </section>

      </div>
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountType, setAccountType] = useState("customer");
  const [adminOtp, setAdminOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotAccountType, setForgotAccountType] = useState("customer");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotOtp, setForgotOtp] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotResetLoading, setForgotResetLoading] = useState(false);
  const [forgotError, setForgotError] = useState("");
  const [forgotSuccess, setForgotSuccess] = useState("");
  const [forgotDevOtp, setForgotDevOtp] = useState("");

  const navigate = useNavigate();
  const isAdminMode = accountType === "admin";

  useEffect(() => {
    setForgotAccountType(accountType);
  }, [accountType]);

  const handleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      const endpoint = isAdminMode ? "/api/auth/admin/login" : "/api/auth/login";
      const payload = {
        email: email.trim().toLowerCase(),
        password,
        submittedAt: Date.now() - 1500,
      };

      if (isAdminMode) {
        payload.adminOtp = adminOtp.trim();
        payload.otp = adminOtp.trim();
      } else {
        payload.accountType = accountType;
      }

      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (!res.ok || !data.accessToken) {
        setError(data.message || "Login failed");
        setLoading(false);
        return;
      }

      const resolvedAccountType =
        data.accountType ||
        (data.role === "admin" ? "admin" : accountType || "customer");

      localStorage.setItem("token", data.accessToken);
      localStorage.setItem("role", data.role || "user");
      localStorage.setItem("accountType", resolvedAccountType);

      navigate(
        resolvePortalPath({
          token: data.accessToken,
          role: data.role || "user",
          accountType: resolvedAccountType,
        })
      );
    } catch {
      setError("Network error, please retry.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotRequestOtp = async () => {
    setForgotLoading(true);
    setForgotError("");
    setForgotSuccess("");
    setForgotDevOtp("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/forgot-password/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: forgotEmail.trim().toLowerCase(),
          accountType: forgotAccountType,
          submittedAt: Date.now() - 1500,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setForgotError(data.message || "OTP request failed");
        return;
      }

      setForgotSuccess(data.message || "OTP sent.");
      if (data.devOtp) {
        setForgotDevOtp(String(data.devOtp));
        setForgotOtp(String(data.devOtp));
      }
    } catch {
      setForgotError("Network error while requesting OTP.");
    } finally {
      setForgotLoading(false);
    }
  };

  const handleForgotResetPassword = async () => {
    setForgotResetLoading(true);
    setForgotError("");
    setForgotSuccess("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/forgot-password/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: forgotEmail.trim().toLowerCase(),
          accountType: forgotAccountType,
          otp: forgotOtp.trim(),
          newPassword: forgotNewPassword,
          submittedAt: Date.now() - 1500,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setForgotError(data.message || "Password reset failed");
        return;
      }

      setForgotSuccess(data.message || "Password reset successful.");
      setForgotOtp("");
      setForgotNewPassword("");
      setPassword("");
      if (!email) {
        setEmail(forgotEmail.trim().toLowerCase());
      }
    } catch {
      setForgotError("Network error while resetting password.");
    } finally {
      setForgotResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative">
      <div className="absolute inset-0 bg-gradient-to-br from-[#FF9933] via-white to-[#138808]" />
      <div className="absolute inset-0 bg-white/55 backdrop-blur-sm" />
      <div className="relative z-10 flex items-center justify-center px-4 py-10">
        <div className="glass-card w-full max-w-md rounded-2xl p-8 border border-[#0B1F3A]/10 shadow-xl">
          <p className="text-center text-xs uppercase tracking-[0.2em] text-[#0B1F3A]/70 mb-3">
            Secure Login
          </p>
          <h2 className="text-2xl font-bold text-center tricolor-text mb-4">
            GoIndiaRide Console
          </h2>

          <div className="space-y-3">
            <select
              className="w-full p-3 rounded-xl border border-[#0B1F3A]/10 bg-white/80"
              value={accountType}
              onChange={(e) => {
                setAccountType(e.target.value);
                setError("");
              }}
            >
              <option value="customer">Customer Login</option>
              <option value="driver">Driver Login</option>
              <option value="admin">Admin Login</option>
            </select>

            <input
              type="email"
              placeholder="Email"
              className="w-full p-3 rounded-xl border border-[#0B1F3A]/10 bg-white/80"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <input
              type="password"
              placeholder="Password"
              className="w-full p-3 rounded-xl border border-[#0B1F3A]/10 bg-white/80"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {isAdminMode && (
              <input
                type="text"
                inputMode="numeric"
                placeholder="Admin OTP (Google Authenticator)"
                className="w-full p-3 rounded-xl border border-[#0B1F3A]/10 bg-white/80"
                value={adminOtp}
                onChange={(e) => setAdminOtp(e.target.value)}
              />
            )}

            {error && (
              <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg p-2">
                {error}
              </p>
            )}

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full bg-[#0B1F3A] text-white p-3 rounded-xl shadow-lg hover:scale-[1.01] transition disabled:opacity-60"
            >
              {loading ? "Securing..." : "Login"}
            </button>

            <button
              type="button"
              onClick={() => {
                setForgotOpen((prev) => !prev);
                setForgotError("");
                setForgotSuccess("");
                if (!forgotEmail && email) {
                  setForgotEmail(email.trim().toLowerCase());
                }
              }}
              className="w-full text-sm text-[#0B1F3A] underline underline-offset-2"
            >
              {forgotOpen ? "Hide Forgot Password" : "Forgot Password"}
            </button>

            {forgotOpen && (
              <div className="rounded-xl border border-[#0B1F3A]/15 bg-white/80 p-3 space-y-2">
                <p className="text-sm font-semibold text-[#0B1F3A]">Password Recovery</p>

                <select
                  className="w-full p-2 rounded-lg border border-[#0B1F3A]/10 bg-white"
                  value={forgotAccountType}
                  onChange={(e) => setForgotAccountType(e.target.value)}
                >
                  <option value="customer">Customer</option>
                  <option value="driver">Driver</option>
                  <option value="admin">Admin</option>
                </select>

                <input
                  type="email"
                  placeholder="Registered Email"
                  className="w-full p-2 rounded-lg border border-[#0B1F3A]/10 bg-white"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                />

                <button
                  type="button"
                  onClick={handleForgotRequestOtp}
                  disabled={forgotLoading}
                  className="w-full bg-[#0B1F3A] text-white p-2 rounded-lg disabled:opacity-60"
                >
                  {forgotLoading ? "Sending OTP..." : "Send Reset OTP"}
                </button>

                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Enter OTP"
                  className="w-full p-2 rounded-lg border border-[#0B1F3A]/10 bg-white"
                  value={forgotOtp}
                  onChange={(e) => setForgotOtp(e.target.value)}
                />

                <input
                  type="password"
                  placeholder="New Password"
                  className="w-full p-2 rounded-lg border border-[#0B1F3A]/10 bg-white"
                  value={forgotNewPassword}
                  onChange={(e) => setForgotNewPassword(e.target.value)}
                />

                <button
                  type="button"
                  onClick={handleForgotResetPassword}
                  disabled={forgotResetLoading}
                  className="w-full bg-[#138808] text-white p-2 rounded-lg disabled:opacity-60"
                >
                  {forgotResetLoading ? "Updating..." : "Reset Password"}
                </button>

                {forgotError && (
                  <p className="text-red-600 text-xs bg-red-50 border border-red-100 rounded-lg p-2">
                    {forgotError}
                  </p>
                )}

                {forgotSuccess && (
                  <p className="text-emerald-700 text-xs bg-emerald-50 border border-emerald-100 rounded-lg p-2">
                    {forgotSuccess}
                  </p>
                )}

                {forgotDevOtp && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-2">
                    Dev OTP: {forgotDevOtp}
                  </p>
                )}
              </div>
            )}

            <p className="text-xs text-center text-[#0B1F3A]/70">
              {isAdminMode
                ? "Admin login requires OTP (Google Authenticator or ADMIN_2FA_SECRET)."
                : "2FA and OTP trigger automatically if enabled on your account."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Dashboard() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role") || "user";
  const accountType = localStorage.getItem("accountType") || (role === "admin" ? "admin" : "customer");
  const token = localStorage.getItem("token");
  const isAdminPortal = role === "admin" || accountType === "admin";
  const canReceiveBookingAlarm = isAdminPortal || accountType === "driver";
  const bookingAlarmPrefKey = `gir_booking_alarm_enabled_${isAdminPortal ? "admin" : accountType === "driver" ? "driver" : "user"}`;

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationError, setNotificationError] = useState("");
  const [bookingAlarmEnabled, setBookingAlarmEnabled] = useState(() => {
    try {
      const storedBookingAlarm = localStorage.getItem(bookingAlarmPrefKey);
      if (storedBookingAlarm === "1" || storedBookingAlarm === "0") {
        return storedBookingAlarm === "1";
      }
      if (isAdminPortal) {
        localStorage.setItem(bookingAlarmPrefKey, "1");
        return true;
      }
      return localStorage.getItem(bookingAlarmPrefKey) === "1";
    } catch (error) {
      return false;
    }
  });
  const seenNotificationIdsRef = useRef(new Set());
  const bookingAlarmAudioContextRef = useRef(null);
  const bookingAlarmLastAtRef = useRef(0);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [bookingActionState, setBookingActionState] = useState({
    loading: false,
    success: "",
    error: "",
  });
  const [pendingBookingItems, setPendingBookingItems] = useState([]);
  const [pendingBookingCount, setPendingBookingCount] = useState(0);
  const [pendingBookingLoading, setPendingBookingLoading] = useState(false);
  const [pendingBookingError, setPendingBookingError] = useState("");
  const [pendingBookingReviewSuccess, setPendingBookingReviewSuccess] = useState("");
  const [pendingBookingReviewingId, setPendingBookingReviewingId] = useState("");
  const [sosState, setSosState] = useState({
    loading: false,
    channel: "",
    success: "",
    error: "",
  });
  const [aiSummary, setAiSummary] = useState(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiSummaryError, setAiSummaryError] = useState("");
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
    adminOtp: "",
  });
  const [passwordAction, setPasswordAction] = useState({
    loading: false,
    success: "",
    error: "",
  });
  const storedDonationPref = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("gir_donation_pref") || "{}");
    } catch (error) {
      return {};
    }
  }, []);
  const [donationOverview, setDonationOverview] = useState(null);
  const [donationHistory, setDonationHistory] = useState([]);
  const [donationAdminSummary, setDonationAdminSummary] = useState(null);
  const [donationOrder, setDonationOrder] = useState(null);
  const [lastBookingId, setLastBookingId] = useState(localStorage.getItem("gir_last_booking") || "");
  const [rideDonationPrompt, setRideDonationPrompt] = useState(null);
  const [donationState, setDonationState] = useState({
    loading: false,
    confirming: false,
    success: "",
    error: "",
  });
  const [donationForm, setDonationForm] = useState({
    amount: Number(storedDonationPref.amount || 101),
    currency: storedDonationPref.currency || "INR",
    paymentMode: storedDonationPref.paymentMode || "",
    note: storedDonationPref.note || "",
    clientReference: storedDonationPref.clientReference || "",
    providerReference: "",
  });
  const [commissionPaymentModes, setCommissionPaymentModes] = useState([]);
  const [driverCommissionMine, setDriverCommissionMine] = useState([]);
  const [driverCommissionSummary, setDriverCommissionSummary] = useState(null);
  const [driverCommissionWallet, setDriverCommissionWallet] = useState(null);
  const [driverCommissionAction, setDriverCommissionAction] = useState({
    loading: false,
    refunding: false,
    success: "",
    error: "",
  });
  const [driverSettlementForm, setDriverSettlementForm] = useState({
    bookingId: localStorage.getItem("gir_last_booking") || "",
    driverId: accountType === "driver" ? localStorage.getItem("userId") || "" : "",
    customerId: "",
    amount: 0,
    currency: "INR",
    paymentMode: "",
    customerRegion: "",
    providerReference: "",
    clientReference: "",
  });
  const [driverRefundForm, setDriverRefundForm] = useState({
    bookingId: localStorage.getItem("gir_last_booking") || "",
    driverId: accountType === "driver" ? localStorage.getItem("userId") || "" : "",
    refundAmount: "",
    paymentMode: "",
    refundReason: "",
    currency: "INR",
    providerReference: "",
    clientReference: "",
  });
  const saveDonationPref = useCallback((next) => {
    try {
      localStorage.setItem(
        "gir_donation_pref",
        JSON.stringify({
          amount: next.amount,
          currency: next.currency,
          paymentMode: next.paymentMode,
          note: next.note,
          clientReference: next.clientReference,
        })
      );
    } catch (error) {
      // ignore storage failures
    }
  }, []);
  const updateDonationForm = useCallback(
    (patch) => {
      setDonationForm((prev) => {
        const next = { ...prev, ...(typeof patch === "function" ? patch(prev) : patch) };
        saveDonationPref(next);
        return next;
      });
    },
    [saveDonationPref]
  );
  const chips = [
    "Anomaly watch active",
    "CSP and CORS hardened",
    "Device fingerprinting ready",
  ];
  const portalLabel = role === "admin" ? "Admin" : accountType === "driver" ? "Driver" : "Customer";

  const ensureBookingAlarmAudioContext = useCallback(() => {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;

    if (!bookingAlarmAudioContextRef.current) {
      bookingAlarmAudioContextRef.current = new AudioCtx();
    }

    return bookingAlarmAudioContextRef.current;
  }, []);

  const persistBookingAlarmEnabled = useCallback(
    (enabled) => {
      setBookingAlarmEnabled(enabled);
      try {
        localStorage.setItem(bookingAlarmPrefKey, enabled ? "1" : "0");
      } catch (error) {
        // ignore storage failures
      }
    },
    [bookingAlarmPrefKey]
  );

  const armBookingAlarm = useCallback(
    ({ force = false, testTone = false } = {}) => {
      if (!canReceiveBookingAlarm) return false;

      const ctx = ensureBookingAlarmAudioContext();
      if (!ctx) return false;

      const shouldEnable = force || bookingAlarmEnabled;
      if (!shouldEnable) return false;

      const finalize = () => {
        persistBookingAlarmEnabled(true);
        if (testTone) {
          bookingAlarmLastAtRef.current = 0;
          playBookingAlarm();
        }
      };

      if (ctx.state === "suspended") {
        ctx.resume().then(finalize).catch(() => {});
      } else {
        finalize();
      }

      return true;
    },
    [canReceiveBookingAlarm, ensureBookingAlarmAudioContext, bookingAlarmEnabled, persistBookingAlarmEnabled]
  );

  const playBookingAlarm = useCallback(() => {
    if (!canReceiveBookingAlarm) return;

    const nowMs = Date.now();
    if (nowMs - bookingAlarmLastAtRef.current < 2500) return;
    bookingAlarmLastAtRef.current = nowMs;

    const ctx = ensureBookingAlarmAudioContext();
    if (!ctx) return;

    if (ctx.state === "suspended") {
      if (!bookingAlarmEnabled) return;
      ctx.resume().catch(() => {});
      if (ctx.state === "suspended") return;
    }

    const start = ctx.currentTime + 0.02;
    [0, 0.2, 0.4].forEach((offset) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(910, start + offset);
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.18, start + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.16);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + 0.18);
    });
  }, [canReceiveBookingAlarm, bookingAlarmEnabled, ensureBookingAlarmAudioContext]);

  useEffect(() => {
    if (!canReceiveBookingAlarm) return undefined;

    const unlockAudio = () => {
      armBookingAlarm();
    };

    window.addEventListener("pointerdown", unlockAudio, { passive: true });
    window.addEventListener("keydown", unlockAudio);

    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, [canReceiveBookingAlarm, armBookingAlarm]);

  const loadNotifications = useCallback(async ({ silent = false } = {}) => {
    if (!token) return;

    if (!silent) {
      setNotificationLoading(true);
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/notifications?limit=8`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Unable to load notifications");
      }

      const items = Array.isArray(data.items) ? data.items : [];
      setNotifications(items);
      setUnreadCount(Number(data.unreadCount || 0));
      setNotificationError("");

      if (canReceiveBookingAlarm) {
        const freshBookingAlert = items.find((item) => {
          const id = String(item?._id || "");
          if (!id) return false;

          const wasSeen = seenNotificationIdsRef.current.has(id);
          seenNotificationIdsRef.current.add(id);
          if (wasSeen) return false;

          const type = String(item?.type || "").toLowerCase();
          const metadata = item?.metadata && typeof item.metadata === "object" ? item.metadata : {};
          const metadataWantsAlarm =
            Boolean(metadata.requiresAdminReview)
            || Boolean(metadata.playSound)
            || Boolean(metadata.ring)
            || String(metadata.audioCue || "").toLowerCase() === "booking_alarm";
          if (!item?.isRead && metadataWantsAlarm) {
            return true;
          }
          return !item?.isRead && (type === "booking_created" || type === "new_booking");
        });

        if (freshBookingAlert && bookingAlarmEnabled) {
          playBookingAlarm();
        }
      } else {
        items.forEach((item) => {
          const id = String(item?._id || "");
          if (id) {
            seenNotificationIdsRef.current.add(id);
          }
        });
      }
    } catch (error) {
      if (!silent) {
        setNotificationError(error.message || "Notifications unavailable");
      }
    } finally {
      if (!silent) {
        setNotificationLoading(false);
      }
    }
  }, [token, canReceiveBookingAlarm, bookingAlarmEnabled, playBookingAlarm]);

  const loadAiSummary = useCallback(async ({ silent = false } = {}) => {
    if (!token) return;

    if (!silent) {
      setAiSummaryLoading(true);
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/security/automation/summary`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Automation summary unavailable");
      }

      setAiSummary(data);
      setAiSummaryError("");
    } catch (error) {
      if (!silent) {
        setAiSummaryError(error.message || "Unable to load AI summary");
      }
    } finally {
      if (!silent) {
        setAiSummaryLoading(false);
      }
    }
  }, [token]);

  const loadDonationOverview = useCallback(async () => {
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/wallets/donations/overview`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Donation overview unavailable");
      }

      setDonationOverview(data);
      if (Array.isArray(data.paymentModes) && data.paymentModes.length) {
        updateDonationForm((prev) => ({
          ...prev,
          currency: data.currency || prev.currency,
          paymentMode: prev.paymentMode || data.paymentModes[0].modeId || "",
        }));
      }
      setDonationState((prev) => ({ ...prev, error: "" }));
    } catch (error) {
      setDonationState((prev) => ({ ...prev, error: error.message || "Donation overview unavailable" }));
    }
  }, [token, updateDonationForm]);

  const loadDonationHistory = useCallback(async () => {
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/wallets/donations/mine`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Unable to load donations");
      }

      setDonationHistory(Array.isArray(data.rows) ? data.rows : []);
    } catch (error) {
      setDonationState((prev) => ({ ...prev, error: prev.error || error.message || "Unable to load donations" }));
    }
  }, [token]);

  const loadDonationAdminSummary = useCallback(async () => {
    if (!token || !isAdminPortal) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/wallets/admin/donations/summary`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Admin donation summary unavailable");
      }

      setDonationAdminSummary(data);
    } catch (error) {
      setDonationState((prev) => ({ ...prev, error: prev.error || error.message || "Admin donation summary unavailable" }));
    }
  }, [token, isAdminPortal]);

  const loadCommissionPaymentModes = useCallback(async () => {
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/wallets/payment-modes?flow=commission`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Unable to load commission payment modes");
      }

      const rows = Array.isArray(data.rows) ? data.rows : [];
      setCommissionPaymentModes(rows);

      if (rows.length) {
        setDriverSettlementForm((prev) => ({
          ...prev,
          paymentMode: prev.paymentMode || rows[0].modeId || "",
        }));
        setDriverRefundForm((prev) => ({
          ...prev,
          paymentMode: prev.paymentMode || rows[0].modeId || "",
        }));
      }
    } catch (error) {
      setDriverCommissionAction((prev) => ({
        ...prev,
        error: prev.error || error.message || "Unable to load commission payment modes",
      }));
    }
  }, [token, canReceiveBookingAlarm, playBookingAlarm]);

  const loadDriverCommissionMine = useCallback(async () => {
    if (!token || (accountType !== "driver" && !isAdminPortal)) return;

    const lookupDriverId = (driverSettlementForm.driverId || "").trim();
    if (isAdminPortal && !lookupDriverId) {
      setDriverCommissionMine([]);
      setDriverCommissionWallet(null);
      return;
    }

    try {
      const params = new URLSearchParams();
      if (isAdminPortal && lookupDriverId) {
        params.set("driverId", lookupDriverId);
      }
      params.set("limit", "80");

      const response = await fetch(`${API_BASE_URL}/api/wallets/driver-commissions/mine?${params.toString()}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Unable to load driver commission wallet");
      }

      setDriverCommissionMine(Array.isArray(data.rows) ? data.rows : []);
      setDriverCommissionWallet(data.wallet || null);
      setDriverCommissionAction((prev) => ({ ...prev, error: "" }));

      if (data.wallet?.currency) {
        setDriverSettlementForm((prev) => ({ ...prev, currency: prev.currency || data.wallet.currency }));
        setDriverRefundForm((prev) => ({ ...prev, currency: prev.currency || data.wallet.currency }));
      }
    } catch (error) {
      setDriverCommissionAction((prev) => ({
        ...prev,
        error: error.message || "Unable to load driver commission wallet",
      }));
    }
  }, [token, accountType, isAdminPortal, driverSettlementForm.driverId]);

  const loadDriverCommissionSummary = useCallback(async () => {
    if (!token || !isAdminPortal) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/wallets/admin/driver-commissions/summary?limit=120`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Driver commission admin summary unavailable");
      }

      setDriverCommissionSummary(data);
      setDriverCommissionAction((prev) => ({ ...prev, error: "" }));

      const preferredCurrency = data?.config?.supportedCurrencies?.[0];
      if (preferredCurrency) {
        setDriverSettlementForm((prev) => ({ ...prev, currency: prev.currency || preferredCurrency }));
        setDriverRefundForm((prev) => ({ ...prev, currency: prev.currency || preferredCurrency }));
      }
    } catch (error) {
      setDriverCommissionAction((prev) => ({
        ...prev,
        error: prev.error || error.message || "Driver commission admin summary unavailable",
      }));
    }
  }, [token, isAdminPortal]);

  const settleDriverCommissionManually = async () => {
    if (!token) return;
    if (!isAdminPortal) {
      setDriverCommissionAction((prev) => ({ ...prev, error: "Har settlement ke liye admin approval required hai" }));
      return;
    }
    if (!driverSettlementForm.bookingId.trim()) {
      setDriverCommissionAction((prev) => ({ ...prev, error: "Booking ID required for settlement" }));
      return;
    }
    if (!driverSettlementForm.customerId.trim()) {
      setDriverCommissionAction((prev) => ({ ...prev, error: "Customer ID required for settlement" }));
      return;
    }

    const numericAmount = Number(driverSettlementForm.amount || 0);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setDriverCommissionAction((prev) => ({ ...prev, error: "Valid amount required" }));
      return;
    }

    setDriverCommissionAction({ loading: true, refunding: false, success: "", error: "" });

    try {
      const response = await fetch(`${API_BASE_URL}/api/wallets/driver-commissions/settle`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bookingId: driverSettlementForm.bookingId.trim(),
          driverId: driverSettlementForm.driverId.trim() || undefined,
          customerId: driverSettlementForm.customerId.trim(),
          amount: numericAmount,
          currency: driverSettlementForm.currency,
          paymentMode: driverSettlementForm.paymentMode || undefined,
          customerRegion: driverSettlementForm.customerRegion || undefined,
          providerReference: driverSettlementForm.providerReference.trim() || undefined,
          clientReference: driverSettlementForm.clientReference.trim() || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Driver commission settlement failed");
      }

      const settledAmount = Number(data?.settlement?.breakdown?.driverNetAmount || 0);
      setDriverCommissionAction({
        loading: false,
        refunding: false,
        success: `Settlement success. Driver net: ${settledAmount.toLocaleString("en-IN")}`,
        error: "",
      });

      setLastBookingId(driverSettlementForm.bookingId.trim());
      try {
        localStorage.setItem("gir_last_booking", driverSettlementForm.bookingId.trim());
      } catch (error) {
        // ignore storage errors
      }

      setDriverSettlementForm((prev) => ({ ...prev, providerReference: "" }));
      loadDriverCommissionMine();
      if (isAdminPortal) {
        loadDriverCommissionSummary();
      }
    } catch (error) {
      setDriverCommissionAction({ loading: false, refunding: false, success: "", error: error.message || "Driver commission settlement failed" });
    }
  };

  const refundDriverCommissionManually = async () => {
    if (!token) return;
    if (!isAdminPortal) {
      setDriverCommissionAction((prev) => ({ ...prev, error: "Har refund ke liye admin approval required hai" }));
      return;
    }
    if (!driverRefundForm.bookingId.trim()) {
      setDriverCommissionAction((prev) => ({ ...prev, error: "Booking ID required for refund" }));
      return;
    }

    setDriverCommissionAction({ loading: false, refunding: true, success: "", error: "" });

    try {
      const refundAmount = Number(driverRefundForm.refundAmount);
      const response = await fetch(`${API_BASE_URL}/api/wallets/driver-commissions/refund`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bookingId: driverRefundForm.bookingId.trim(),
          driverId: driverRefundForm.driverId.trim() || undefined,
          refundAmount: Number.isFinite(refundAmount) && refundAmount > 0 ? refundAmount : undefined,
          currency: driverRefundForm.currency,
          paymentMode: driverRefundForm.paymentMode || undefined,
          refundReason: driverRefundForm.refundReason || undefined,
          providerReference: driverRefundForm.providerReference.trim() || undefined,
          clientReference: driverRefundForm.clientReference.trim() || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Driver commission refund failed");
      }

      const refundGross = Number(data?.refund?.breakdown?.refundGrossAmount || 0);
      setDriverCommissionAction({
        loading: false,
        refunding: false,
        success: `Refund processed: ${refundGross.toLocaleString("en-IN")}`,
        error: "",
      });

      setDriverRefundForm((prev) => ({
        ...prev,
        providerReference: "",
        clientReference: "",
        refundAmount: "",
        refundReason: "",
      }));

      loadDriverCommissionMine();
      if (isAdminPortal) {
        loadDriverCommissionSummary();
      }
    } catch (error) {
      setDriverCommissionAction({ loading: false, refunding: false, success: "", error: error.message || "Driver commission refund failed" });
    }
  };
  const completeRideAndSuggestDonation = async () => {
    if (!token || !lastBookingId.trim()) {
      setDonationState((prev) => ({ ...prev, error: "Add a booking ID first" }));
      return;
    }

    setDonationState({ loading: true, confirming: false, success: "", error: "" });
    try {
      const shouldSettleToDriverWallet = accountType === "driver"
        || (isAdminPortal && Boolean((driverSettlementForm.driverId || "").trim()));

      const payload = {
        settleToDriverWallet: shouldSettleToDriverWallet || undefined,
        driverId: isAdminPortal ? driverSettlementForm.driverId.trim() || undefined : undefined,
        paymentMode: driverSettlementForm.paymentMode || undefined,
        currency: driverSettlementForm.currency || undefined,
        customerRegion: driverSettlementForm.customerRegion || undefined,
        providerReference: driverSettlementForm.providerReference.trim() || undefined,
        clientReference: driverSettlementForm.clientReference.trim() || undefined,
      };

      const response = await fetch(`${API_BASE_URL}/api/bookings/${encodeURIComponent(lastBookingId.trim())}/complete`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Ride completion failed");
      }
      setRideDonationPrompt(data.donation || null);
      if (data.bookingId) {
        setLastBookingId(data.bookingId);
        setDriverSettlementForm((prev) => ({ ...prev, bookingId: data.bookingId }));
        setDriverRefundForm((prev) => ({ ...prev, bookingId: data.bookingId }));
        try {
          localStorage.setItem("gir_last_booking", data.bookingId);
        } catch (error) {
          // ignore storage errors
        }
      }
      if (data?.donation?.suggestedAmounts?.length) {
        updateDonationForm((prev) => ({
          ...prev,
          amount: data.donation.suggestedAmounts[0],
          currency: data.donation?.donationWallet?.currency || prev.currency,
        }));
      }

      if (data.driverSettlementPendingApproval) {
        setDriverCommissionAction((prev) => ({
          ...prev,
          success: "Ride complete. Settlement admin approval ke liye pending hai.",
          error: "",
        }));
      }

      if (data.driverSettlement) {
        const netAmount = Number(data?.driverSettlement?.breakdown?.driverNetAmount || 0);
        setDriverCommissionAction((prev) => ({
          ...prev,
          success: `Ride complete. Driver wallet credited ${netAmount.toLocaleString("en-IN")}`,
          error: "",
        }));
        loadDriverCommissionMine();
        if (isAdminPortal) {
          loadDriverCommissionSummary();
        }
      }

      setDonationState({
        loading: false,
        confirming: false,
        success: data.driverSettlementPendingApproval
          ? "Ride closed. Driver settlement admin approval ke liye pending."
          : data.driverSettlement
            ? "Ride closed. Driver commission wallet settled."
            : "Ride closed. Donation prompt ready.",
        error: "",
      });
    } catch (error) {
      setDonationState({ loading: false, confirming: false, success: "", error: error.message || "Ride completion failed" });
    }
  };
  const startDonationIntent = async () => {
    if (!token) return;
    if (!donationForm.paymentMode) {
      setDonationState((prev) => ({ ...prev, error: "Pick a payment mode" }));
      return;
    }

    setDonationState({ loading: true, confirming: false, success: "", error: "" });
    try {
      const response = await fetch(`${API_BASE_URL}/api/wallets/donations/intent`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: Number(donationForm.amount || 0),
          currency: donationForm.currency,
          paymentMode: donationForm.paymentMode,
          note: donationForm.note,
          clientReference: donationForm.clientReference || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Could not start donation");
      }

      setDonationOrder(data.order);
      setDonationState({ loading: false, confirming: true, success: "Donation intent created. Add provider reference to confirm.", error: "" });
      loadDonationOverview();
      loadDonationHistory();
    } catch (error) {
      setDonationState({ loading: false, confirming: false, success: "", error: error.message || "Could not start donation" });
    }
  };

  const confirmDonation = async () => {
    if (!token || !donationOrder?.orderId) {
      setDonationState((prev) => ({ ...prev, error: "Start a donation first" }));
      return;
    }
    if (!donationForm.providerReference.trim()) {
      setDonationState((prev) => ({ ...prev, error: "Add gateway/UTR reference" }));
      return;
    }

    setDonationState({ loading: false, confirming: true, success: "", error: "" });
    try {
      const response = await fetch(`${API_BASE_URL}/api/wallets/donations/confirm`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderId: donationOrder.orderId,
          providerReference: donationForm.providerReference.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Donation confirmation failed");
      }

      setDonationState({ loading: false, confirming: false, success: "Donation locked in securely", error: "" });
      setDonationOrder(data.order);
      setDonationForm((prev) => ({ ...prev, providerReference: "" }));
      loadDonationOverview();
      loadDonationHistory();
      if (isAdminPortal) {
        loadDonationAdminSummary();
      }
    } catch (error) {
      setDonationState({ loading: false, confirming: false, success: "", error: error.message || "Donation confirmation failed" });
    }
  };
  useEffect(() => {
    if (!SHOW_WORKING_AI_SECTIONS) return undefined;

    let active = true;

    const run = async (silent = false) => {
      if (!active) return;
      await loadNotifications({ silent });
    };

    run(false);
    const timer = setInterval(() => {
      run(true);
    }, 15000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [loadNotifications]);

  useEffect(() => {
    if (!token || !isAdminPortal) return undefined;

    let active = true;
    const run = async (silent = false) => {
      if (!active) return;
      await loadPendingBookings({ silent });
    };

    run(false);
    const timer = setInterval(() => {
      run(true);
    }, 15000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [token, isAdminPortal, loadPendingBookings]);

  useEffect(() => {
    let active = true;

    const run = async (silent = false) => {
      if (!active) return;
      await loadAiSummary({ silent });
    };

    run(false);
    const timer = setInterval(() => {
      run(true);
    }, 30000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [loadAiSummary]);

  useEffect(() => {
    if (!token) return;
    loadDonationOverview();
    loadDonationHistory();
    loadCommissionPaymentModes();
    if (isAdminPortal) {
      loadDonationAdminSummary();
      loadDriverCommissionSummary();
    }
    if (accountType === "driver" || isAdminPortal) {
      loadDriverCommissionMine();
    }
  }, [
    token,
    accountType,
    isAdminPortal,
    loadDonationOverview,
    loadDonationHistory,
    loadDonationAdminSummary,
    loadCommissionPaymentModes,
    loadDriverCommissionMine,
    loadDriverCommissionSummary,
  ]);

  const automationModules = useMemo(() => {
    if (Array.isArray(aiSummary?.modules) && aiSummary.modules.length) {
      return aiSummary.modules;
    }

    return aiAutomationDefaults;
  }, [aiSummary]);

  const markAllNotificationsRead = async () => {
    if (!token || unreadCount === 0) return;

    setMarkingAllRead(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/notifications/read-all`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to update notifications");
      }

      setNotifications((prev) =>
        prev.map((item) => ({
          ...item,
          isRead: true,
        }))
      );
      setUnreadCount(0);
      setNotificationError("");
    } catch (error) {
      setNotificationError(error.message || "Failed to mark notifications");
    } finally {
      setMarkingAllRead(false);
    }
  };

  const markOneNotificationRead = async (id, isRead) => {
    if (!token || !id || isRead) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/notifications/${id}/read`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Unable to mark notification");
      }

      setNotifications((prev) =>
        prev.map((item) =>
          item._id === id
            ? {
                ...item,
                isRead: true,
                readAt: data.readAt || new Date().toISOString(),
              }
            : item
        )
      );
      setUnreadCount((prev) => Math.max(prev - 1, 0));
    } catch (error) {
      setNotificationError(error.message || "Unable to update notification");
    }
  };

  const loadPendingBookings = useCallback(
    async ({ silent = false } = {}) => {
      if (!token || !isAdminPortal) return;

      if (!silent) {
        setPendingBookingLoading(true);
      }

      try {
        const response = await fetch(`${API_BASE_URL}/api/bookings/admin/pending?limit=40`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || "Pending bookings unavailable");
        }

        const items = Array.isArray(data.items) ? data.items : [];
        setPendingBookingItems(items);
        setPendingBookingCount(Number(data.pendingCount || 0));
        setPendingBookingError("");
      } catch (error) {
        if (!silent) {
          setPendingBookingError(error.message || "Pending bookings unavailable");
        }
      } finally {
        if (!silent) {
          setPendingBookingLoading(false);
        }
      }
    },
    [token, isAdminPortal]
  );

  const reviewPendingBooking = useCallback(
    async (bookingId, decision) => {
      if (!token || !isAdminPortal || !bookingId) return;

      setPendingBookingReviewingId(bookingId);
      setPendingBookingReviewSuccess("");
      setPendingBookingError("");

      try {
        const response = await fetch(`${API_BASE_URL}/api/bookings/${encodeURIComponent(bookingId)}/admin/review`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ decision }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || "Review action failed");
        }

        setPendingBookingReviewSuccess(`Booking ${bookingId} ${decision} by admin`);
        setPendingBookingItems((prev) => prev.filter((item) => String(item.bookingId || "") !== String(bookingId)));
        setPendingBookingCount((prev) => Math.max(0, prev - 1));
        loadNotifications({ silent: true });
        loadPendingBookings({ silent: true });
      } catch (error) {
        setPendingBookingError(error.message || "Review action failed");
      } finally {
        setPendingBookingReviewingId("");
      }
    },
    [token, isAdminPortal, loadPendingBookings, loadNotifications]
  );

  const createDemoBooking = async () => {
    if (!token) return;

    setBookingActionState({ loading: true, success: "", error: "" });
    try {
      const quoteResponse = await fetch(`${API_BASE_URL}/api/bookings/quote?distanceKm=18`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const quoteData = await quoteResponse.json();
      if (!quoteResponse.ok) {
        throw new Error(quoteData.message || "Quote service unavailable");
      }

      const bookingPayload = {
        cardToken: `demo_card_${Date.now()}`,
        distanceKm: quoteData.distanceKm,
        amount: quoteData.amount,
        fareHash: quoteData.fareHash,
        referralCode: "DEMO",
      };

      const bookingResponse = await fetch(`${API_BASE_URL}/api/bookings`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bookingPayload),
      });

      const bookingData = await bookingResponse.json();
      if (!bookingResponse.ok) {
        throw new Error(bookingData.message || "Booking failed");
      }

      setBookingActionState({
        loading: false,
        success: `Demo booking created: ${bookingData.bookingId}`,
        error: "",
      });
      setLastBookingId(bookingData.bookingId || "");
      setRideDonationPrompt(null);
      try {
        localStorage.setItem("gir_last_booking", bookingData.bookingId || "");
      } catch (error) {
        // ignore storage errors
      }
      loadNotifications({ silent: false });
      loadAiSummary({ silent: true });
      if (isAdminPortal) {
        loadPendingBookings({ silent: true });
      }
    } catch (error) {
      setBookingActionState({
        loading: false,
        success: "",
        error: error.message || "Could not create demo booking",
      });
    }
  };

  const handleChangePassword = async () => {
    if (!token) return;

    setPasswordAction({ loading: true, success: "", error: "" });

    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setPasswordAction({ loading: false, success: "", error: "All password fields are required" });
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordAction({ loading: false, success: "", error: "New password and confirm password must match" });
      return;
    }

    if (isAdminPortal && !passwordForm.adminOtp.trim()) {
      setPasswordAction({ loading: false, success: "", error: "Admin OTP is required" });
      return;
    }

    try {
      const payload = {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      };

      if (isAdminPortal) {
        payload.adminOtp = passwordForm.adminOtp.trim();
        payload.otp = passwordForm.adminOtp.trim();
      }

      const response = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Password change failed");
      }

      setPasswordAction({ loading: false, success: data.message || "Password updated successfully", error: "" });
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "", adminOtp: "" });
    } catch (error) {
      setPasswordAction({ loading: false, success: "", error: error.message || "Password change failed" });
    }
  };
  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("accountType");
    navigate("/");
  };

  return (
    <div className="min-h-screen relative text-[#0B1F3A]">
      <div className="absolute inset-0 bg-gradient-to-br from-[#FF9933] via-white to-[#138808]" />
      <div className="absolute inset-0 dash-grid opacity-50" />
      <div className="absolute inset-0 bg-white/65 backdrop-blur-sm" />
      <div className="relative z-10 max-w-5xl mx-auto px-6 py-10 space-y-6">
        <div className="glass-card rounded-2xl p-6 border border-[#0B1F3A]/10 shadow-xl">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-[#0B1F3A]/70 mb-2">
                {portalLabel} cockpit
              </p>
              <h2 className="text-3xl font-bold tricolor-text mb-3">
                {portalLabel} Dashboard
              </h2>
              <div className="flex flex-wrap gap-2 text-xs">
                {chips.map((chip) => (
                  <span
                    key={chip}
                    className="px-3 py-1 rounded-full bg-white/80 border border-[#0B1F3A]/10"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative self-start flex items-center gap-2">
              {canReceiveBookingAlarm && !bookingAlarmEnabled && (
                <button
                  onClick={() => armBookingAlarm({ force: true, testTone: true })}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-white text-[#0B1F3A] border border-[#0B1F3A]/30 text-xs font-semibold"
                >
                  Enable ring
                </button>
              )}
              <button
                onClick={() => setNotificationOpen((prev) => !prev)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#0B1F3A] text-white shadow-md"
              >
                <span aria-hidden="true">🔔</span>
                <span>Alerts</span>
                {unreadCount > 0 && (
                  <span className="min-w-6 h-6 px-2 rounded-full bg-[#FF9933] text-[#0B1F3A] text-xs font-bold grid place-items-center">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>

              {notificationOpen && (
                <div className="absolute right-0 mt-3 w-[22rem] max-w-[90vw] glass-card rounded-2xl p-4 border border-[#0B1F3A]/15 shadow-2xl z-30 text-left">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <p className="text-sm font-semibold text-[#0B1F3A]">
                      Live Notifications
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => loadNotifications({ silent: false })}
                        className="text-xs px-2 py-1 rounded bg-white border border-[#0B1F3A]/20"
                      >
                        Refresh
                      </button>
                      <button
                        onClick={markAllNotificationsRead}
                        disabled={markingAllRead || unreadCount === 0}
                        className="text-xs px-2 py-1 rounded bg-[#0B1F3A] text-white disabled:opacity-50"
                      >
                        {markingAllRead ? "Saving..." : "Mark all read"}
                      </button>
                    </div>
                  </div>

                  {notificationLoading && notifications.length === 0 && (
                    <p className="text-xs text-[#0B1F3A]/70">Loading alerts...</p>
                  )}

                  {notificationError && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-2 mb-2">
                      {notificationError}
                    </p>
                  )}

                  {!notificationLoading && notifications.length === 0 && !notificationError && (
                    <p className="text-xs text-[#0B1F3A]/70">No alerts yet.</p>
                  )}

                  <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                    {notifications.map((item) => (
                      <button
                        key={item._id}
                        onClick={() => markOneNotificationRead(item._id, item.isRead)}
                        className={`w-full text-left rounded-xl border p-3 transition ${
                          item.isRead
                            ? "border-[#0B1F3A]/10 bg-white/70"
                            : "border-[#FF9933]/50 bg-[#fff5e8]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-[#0B1F3A]">
                            {item.title || "Notification"}
                          </p>
                          {!item.isRead && (
                            <span className="w-2 h-2 rounded-full bg-[#FF9933] mt-1" />
                          )}
                        </div>
                        <p className="text-xs text-[#0B1F3A]/80 mt-1">{item.message}</p>
                        <p className="text-[11px] text-[#0B1F3A]/60 mt-2">
                          {formatNotificationTime(item.createdAt)}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="glass-card rounded-2xl p-4 border border-[#FF9933]/40 ring-saffron">
            <p className="text-sm font-semibold text-[#0B1F3A]">Security posture</p>
            <p className="text-xs text-[#0B1F3A]/70 mt-2">
              CSRF shield, rate limits, request signatures and replay protection are enabled by default.
            </p>
          </div>
          <div className="glass-card rounded-2xl p-4 border border-[#138808]/40 ring-green">
            <p className="text-sm font-semibold text-[#0B1F3A]">Risk and devices</p>
            <p className="text-xs text-[#0B1F3A]/70 mt-2">
              Device fingerprinting, geo checks and anomaly bans are wired into the login flow.
            </p>
          </div>
          <div className="glass-card rounded-2xl p-4 border border-[#0B1F3A]/20">
            <p className="text-sm font-semibold text-[#0B1F3A]">Booking trigger</p>
            <p className="text-xs text-[#0B1F3A]/70 mt-2">
              Create a demo booking to test customer to admin to driver alert pipeline.
            </p>
            <button
              onClick={createDemoBooking}
              disabled={bookingActionState.loading}
              className="mt-3 px-3 py-2 rounded-lg bg-[#0B1F3A] text-white text-xs disabled:opacity-50"
            >
              {bookingActionState.loading ? "Creating..." : "Create demo booking"}
            </button>
            {bookingActionState.success && (
              <p className="text-[11px] text-green-700 mt-2">{bookingActionState.success}</p>
            )}
            {bookingActionState.error && (
              <p className="text-[11px] text-red-600 mt-2">{bookingActionState.error}</p>
            )}
          </div>
          <div className="glass-card rounded-2xl p-4 border border-[#0B1F3A]/20">
            <p className="text-sm font-semibold text-[#0B1F3A]">Emergency SOS</p>
            <p className="text-xs text-[#0B1F3A]/70 mt-2">
              Trigger emergency alert to admin and nearby driver channels.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => triggerSos("police")}
                disabled={sosState.loading}
                className="px-3 py-2 rounded-lg bg-[#b91c1c] text-white text-xs disabled:opacity-50"
              >
                {sosState.loading && sosState.channel === "police" ? "Sending..." : "Police"}
              </button>
              <button
                onClick={() => triggerSos("ambulance")}
                disabled={sosState.loading}
                className="px-3 py-2 rounded-lg bg-[#0f766e] text-white text-xs disabled:opacity-50"
              >
                {sosState.loading && sosState.channel === "ambulance" ? "Sending..." : "Ambulance"}
              </button>
            </div>
            {sosState.success && (
              <p className="text-[11px] text-green-700 mt-2">{sosState.success}</p>
            )}
            {sosState.error && (
              <p className="text-[11px] text-red-600 mt-2">{sosState.error}</p>
            )}
          </div>
        </div>

        {isAdminPortal && (
          <section className="glass-card rounded-2xl p-5 border border-[#0B1F3A]/15">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#0B1F3A]">Pending booking approvals</p>
                <p className="text-xs text-[#0B1F3A]/65">
                  Customer booking create होते ही yaha aayegi. Approve/reject directly yahi se karo.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-[#fff5e8] border border-[#FF9933]/60 text-xs font-semibold text-[#0B1F3A]">
                  Pending: {pendingBookingCount}
                </span>
                <button
                  onClick={() => loadPendingBookings({ silent: false })}
                  className="px-3 py-2 rounded-lg bg-white border border-[#0B1F3A]/20 text-xs"
                  disabled={pendingBookingLoading}
                >
                  {pendingBookingLoading ? "Refreshing..." : "Refresh list"}
                </button>
              </div>
            </div>

            {pendingBookingError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-2 mt-3">
                {pendingBookingError}
              </p>
            )}
            {pendingBookingReviewSuccess && (
              <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-2 mt-3">
                {pendingBookingReviewSuccess}
              </p>
            )}

            {pendingBookingLoading && pendingBookingItems.length === 0 && (
              <p className="text-xs text-[#0B1F3A]/70 mt-3">Loading pending bookings...</p>
            )}

            {!pendingBookingLoading && pendingBookingItems.length === 0 && !pendingBookingError && (
              <p className="text-xs text-[#0B1F3A]/70 mt-3">No pending admin approvals.</p>
            )}

            <div className="mt-3 space-y-2 max-h-80 overflow-y-auto pr-1">
              {pendingBookingItems.map((row) => {
                const rowBookingId = String(row?.bookingId || "");
                const reviewInProgress = pendingBookingReviewingId === rowBookingId;
                return (
                  <div key={rowBookingId} className="rounded-xl border border-[#0B1F3A]/12 bg-white/80 p-3">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-[#0B1F3A]">{rowBookingId || "Booking"}</p>
                        <p className="text-xs text-[#0B1F3A]/70 mt-1">
                          Customer: {row?.customer?.name || "-"} {row?.customer?.phone ? `(${row.customer.phone})` : ""}
                        </p>
                        <p className="text-xs text-[#0B1F3A]/70">
                          Fare: ₹{Number(row?.amount || 0).toLocaleString("en-IN")} | Distance: {Number(row?.distanceKm || 0).toFixed(1)} km
                        </p>
                        <p className="text-[11px] text-[#0B1F3A]/55">
                          {formatNotificationTime(row?.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => reviewPendingBooking(rowBookingId, "approved")}
                          disabled={!rowBookingId || reviewInProgress}
                          className="px-3 py-2 rounded-lg bg-[#138808] text-white text-xs disabled:opacity-50"
                        >
                          {reviewInProgress ? "Saving..." : "Approve"}
                        </button>
                        <button
                          onClick={() => reviewPendingBooking(rowBookingId, "rejected")}
                          disabled={!rowBookingId || reviewInProgress}
                          className="px-3 py-2 rounded-lg bg-[#b91c1c] text-white text-xs disabled:opacity-50"
                        >
                          {reviewInProgress ? "Saving..." : "Reject"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

                <section className="glass-card rounded-2xl p-5 border border-[#0B1F3A]/15">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[#0B1F3A]">Ride completion & donation</p>
              <p className="text-xs text-[#0B1F3A]/65">Admin-controlled donation pool, kept separate from ride wallets.</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={completeRideAndSuggestDonation}
                className="px-3 py-2 rounded-full bg-[#0B1F3A] text-white text-xs"
                disabled={donationState.loading}
              >
                {donationState.loading ? "Closing ride..." : "Complete ride & suggest"}
              </button>
              <button
                onClick={() => {
                  loadDonationOverview();
                  loadDonationHistory();
                  if (isAdminPortal) loadDonationAdminSummary();
                }}
                className="px-3 py-2 rounded-full bg-white border border-[#0B1F3A]/20 text-xs"
              >
                Sync wallet
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-3 mt-3">
            <div className="rounded-2xl border border-[#0B1F3A]/15 bg-white/80 p-4 flex flex-col gap-3">
              <div>
                <p className="text-xs text-[#0B1F3A]/70 mb-1">Last booking ID</p>
                <input
                  value={lastBookingId}
                  onChange={(e) => setLastBookingId(e.target.value)}
                  className="w-full p-2 rounded-lg border border-[#0B1F3A]/20 bg-white"
                  placeholder="BK..."
                />
              </div>
              <div>
                <p className="text-xs text-[#0B1F3A]/70 mb-1">Suggested amounts</p>
                <div className="flex flex-wrap gap-2">
                  {(rideDonationPrompt?.suggestedAmounts || donationOverview?.suggestedAmounts || [101, 251, 501]).map((amt) => (
                    <button
                      key={amt}
                      onClick={() => updateDonationForm({ amount: amt })}
                      className="px-3 py-1 rounded-full border border-[#0B1F3A]/20 text-xs bg-white hover:border-[#0B1F3A]/40"
                    >
                      ₹{amt}
                    </button>
                  ))}
                </div>
              </div>
              {rideDonationPrompt?.paymentModes && (
                <p className="text-[11px] text-[#0B1F3A]/65">Modes allowed now: {rideDonationPrompt.paymentModes.map((m) => m.label || m.modeId).join(", ")}</p>
              )}
              {donationState.error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-2">{donationState.error}</p>
              )}
              {donationState.success && (
                <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-2">{donationState.success}</p>
              )}
            </div>

            <div className="md:col-span-2 grid md:grid-cols-2 gap-3">
              <div className="rounded-2xl border border-[#0B1F3A]/15 bg-white/85 p-4 flex flex-col gap-2">
                <p className="text-sm font-semibold text-[#0B1F3A]">Donate now</p>
                <input
                  type="number"
                  min="1"
                  value={donationForm.amount}
                  onChange={(e) => updateDonationForm({ amount: Number(e.target.value) || 0 })}
                  className="w-full p-2 rounded-lg border border-[#0B1F3A]/20 bg-white"
                  placeholder="Amount"
                />
                <select
                  value={donationForm.currency}
                  onChange={(e) => updateDonationForm({ currency: e.target.value })}
                  className="w-full p-2 rounded-lg border border-[#0B1F3A]/20 bg-white"
                >
                  {Array.from(new Set([donationForm.currency, donationOverview?.currency || "INR"]))
                    .filter(Boolean)
                    .map((cur) => (
                      <option key={cur} value={cur}>{cur}</option>
                    ))}
                </select>
                <select
                  value={donationForm.paymentMode}
                  onChange={(e) => updateDonationForm({ paymentMode: e.target.value })}
                  className="w-full p-2 rounded-lg border border-[#0B1F3A]/20 bg-white"
                >
                  <option value="">Choose payment mode</option>
                  {(donationOverview?.paymentModes || rideDonationPrompt?.paymentModes || []).map((mode) => (
                    <option key={mode.modeId} value={mode.modeId}>
                      {mode.label} ({mode.region || "global"})
                    </option>
                  ))}
                </select>
                <input
                  value={donationForm.note}
                  onChange={(e) => updateDonationForm({ note: e.target.value })}
                  className="w-full p-2 rounded-lg border border-[#0B1F3A]/20 bg-white"
                  placeholder="Note for admin (optional)"
                />
                <input
                  value={donationForm.clientReference}
                  onChange={(e) => updateDonationForm({ clientReference: e.target.value })}
                  className="w-full p-2 rounded-lg border border-[#0B1F3A]/20 bg-white"
                  placeholder="Your reference (optional)"
                />
                <input
                  value={donationForm.providerReference}
                  onChange={(e) => updateDonationForm({ providerReference: e.target.value })}
                  className="w-full p-2 rounded-lg border border-[#0B1F3A]/20 bg-white"
                  placeholder="Gateway/UTR reference to confirm"
                />
                <div className="flex gap-2 flex-wrap mt-1">
                  <button
                    onClick={startDonationIntent}
                    className="px-3 py-2 rounded-full bg-[#0B1F3A] text-white text-xs disabled:opacity-50"
                    disabled={donationState.loading}
                  >
                    {donationState.loading ? "Starting..." : "Start donation"}
                  </button>
                  <button
                    onClick={confirmDonation}
                    className="px-3 py-2 rounded-full bg-[#FF9933] text-[#0B1F3A] text-xs disabled:opacity-50"
                    disabled={!donationOrder?.orderId || donationState.confirming}
                  >
                    {donationState.confirming ? "Confirming..." : "Confirm"}
                  </button>
                  {donationOrder?.orderId && (
                    <span className="text-[11px] text-[#0B1F3A]/70">Order {donationOrder.orderId}</span>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-[#0B1F3A]/15 bg-white/85 p-4">
                <p className="text-sm font-semibold text-[#0B1F3A]">Donation wallet snapshot</p>
                <p className="text-2xl font-bold text-[#0B1F3A] mt-2">
                  ₹{Number(donationOverview?.balance || 0).toLocaleString("en-IN")}
                  <span className="text-sm text-[#0B1F3A]/70 ml-2">{donationOverview?.currency || "INR"}</span>
                </p>
                <p className="text-[11px] text-[#0B1F3A]/60 mt-1">Pending intents: {donationAdminSummary?.pendingOrders ?? 0}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {(donationOverview?.paymentModes || []).slice(0, 6).map((mode) => (
                    <span key={mode.modeId} className="px-2 py-1 rounded-full bg-white border border-[#0B1F3A]/20 text-[11px]">
                      {mode.label}
                    </span>
                  ))}
                </div>
                <p className="text-xs font-semibold text-[#0B1F3A] mt-3">Recent donations</p>
                <div className="mt-2 space-y-2 max-h-32 overflow-y-auto">
                  {(donationHistory || []).slice(0, 4).map((row) => (
                    <div key={row._id} className="rounded-lg border border-[#0B1F3A]/15 bg-white/80 p-2">
                      <p className="text-sm font-semibold text-[#0B1F3A]">₹{Number(row.amount || 0).toLocaleString("en-IN")} {row.currency || "INR"}</p>
                      <p className="text-[11px] text-[#0B1F3A]/65">{row.paymentMode}</p>
                      <p className="text-[11px] text-[#0B1F3A]/55">{formatNotificationTime(row.createdAt)}</p>
                    </div>
                  ))}
                  {(donationHistory || []).length === 0 && (
                    <p className="text-[11px] text-[#0B1F3A]/60">No donations yet.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
        {(accountType === "driver" || isAdminPortal) && (
          <section className="glass-card rounded-2xl p-5 border border-[#0B1F3A]/15">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#0B1F3A]">Driver Commission Wallet</p>
                <p className="text-xs text-[#0B1F3A]/65">
                  Admin-controlled secure wallet for driver ride settlements and refunds.
                </p>
              </div>
              <button
                onClick={() => {
                  loadCommissionPaymentModes();
                  loadDriverCommissionMine();
                  if (isAdminPortal) {
                    loadDriverCommissionSummary();
                  }
                }}
                className="px-3 py-2 rounded-full bg-[#0B1F3A] text-white text-xs"
              >
                Sync commission wallet
              </button>
            </div>

            {!isAdminPortal && (
              <p className="text-xs text-[#0B1F3A]/70 mt-3">
                Driver portal read-only hai. Har settlement/refund admin approval ke baad hi execute hoga.
              </p>
            )}

            {(driverCommissionAction.error || driverCommissionAction.success) && (
              <div className="mt-3 space-y-2">
                {driverCommissionAction.error && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-2">{driverCommissionAction.error}</p>
                )}
                {driverCommissionAction.success && (
                  <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-2">{driverCommissionAction.success}</p>
                )}
              </div>
            )}

            <div className="grid md:grid-cols-3 gap-3 mt-3">
              <div className="rounded-2xl border border-[#0B1F3A]/15 bg-white/85 p-4 flex flex-col gap-2">
                <p className="text-sm font-semibold text-[#0B1F3A]">Settle ride to driver wallet</p>
                <input
                  value={driverSettlementForm.bookingId}
                  onChange={(e) => setDriverSettlementForm((prev) => ({ ...prev, bookingId: e.target.value }))}
                  className="w-full p-2 rounded-lg border border-[#0B1F3A]/20 bg-white"
                  placeholder="Booking ID"
                />
                {isAdminPortal && (
                  <input
                    value={driverSettlementForm.driverId}
                    onChange={(e) => setDriverSettlementForm((prev) => ({ ...prev, driverId: e.target.value }))}
                    className="w-full p-2 rounded-lg border border-[#0B1F3A]/20 bg-white"
                    placeholder="Driver user ID"
                  />
                )}
                <input
                  value={driverSettlementForm.customerId}
                  onChange={(e) => setDriverSettlementForm((prev) => ({ ...prev, customerId: e.target.value }))}
                  className="w-full p-2 rounded-lg border border-[#0B1F3A]/20 bg-white"
                  placeholder="Customer user ID"
                />
                <input
                  type="number"
                  min="0"
                  value={driverSettlementForm.amount}
                  onChange={(e) => setDriverSettlementForm((prev) => ({ ...prev, amount: Number(e.target.value) || 0 }))}
                  className="w-full p-2 rounded-lg border border-[#0B1F3A]/20 bg-white"
                  placeholder="Gross amount"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={driverSettlementForm.currency}
                    onChange={(e) => setDriverSettlementForm((prev) => ({ ...prev, currency: e.target.value }))}
                    className="w-full p-2 rounded-lg border border-[#0B1F3A]/20 bg-white"
                  >
                    {Array.from(new Set([driverSettlementForm.currency, ...(driverCommissionSummary?.config?.supportedCurrencies || ["INR", "USD"])]))
                      .filter(Boolean)
                      .map((cur) => (
                        <option key={cur} value={cur}>{cur}</option>
                      ))}
                  </select>
                  <select
                    value={driverSettlementForm.customerRegion}
                    onChange={(e) => setDriverSettlementForm((prev) => ({ ...prev, customerRegion: e.target.value }))}
                    className="w-full p-2 rounded-lg border border-[#0B1F3A]/20 bg-white"
                  >
                    <option value="">Auto region</option>
                    <option value="india">India</option>
                    <option value="international">International</option>
                  </select>
                </div>
                <select
                  value={driverSettlementForm.paymentMode}
                  onChange={(e) => setDriverSettlementForm((prev) => ({ ...prev, paymentMode: e.target.value }))}
                  className="w-full p-2 rounded-lg border border-[#0B1F3A]/20 bg-white"
                >
                  <option value="">Auto payment mode</option>
                  {(commissionPaymentModes || []).map((mode) => (
                    <option key={mode.modeId} value={mode.modeId}>
                      {mode.label} ({mode.region || "global"})
                    </option>
                  ))}
                </select>
                <input
                  value={driverSettlementForm.providerReference}
                  onChange={(e) => setDriverSettlementForm((prev) => ({ ...prev, providerReference: e.target.value }))}
                  className="w-full p-2 rounded-lg border border-[#0B1F3A]/20 bg-white"
                  placeholder="Gateway/UTR reference"
                />
                <input
                  value={driverSettlementForm.clientReference}
                  onChange={(e) => setDriverSettlementForm((prev) => ({ ...prev, clientReference: e.target.value }))}
                  className="w-full p-2 rounded-lg border border-[#0B1F3A]/20 bg-white"
                  placeholder="Client reference"
                />
                <button
                  onClick={settleDriverCommissionManually}
                  className="px-3 py-2 rounded-full bg-[#138808] text-white text-xs disabled:opacity-50"
                  disabled={!isAdminPortal || driverCommissionAction.loading}
                >
                  {!isAdminPortal ? "Admin only" : driverCommissionAction.loading ? "Settling..." : "Settle now"}
                </button>
              </div>

              <div className="rounded-2xl border border-[#0B1F3A]/15 bg-white/85 p-4 flex flex-col gap-2">
                <p className="text-sm font-semibold text-[#0B1F3A]">Process refund</p>
                <input
                  value={driverRefundForm.bookingId}
                  onChange={(e) => setDriverRefundForm((prev) => ({ ...prev, bookingId: e.target.value }))}
                  className="w-full p-2 rounded-lg border border-[#0B1F3A]/20 bg-white"
                  placeholder="Booking ID"
                />
                {isAdminPortal && (
                  <input
                    value={driverRefundForm.driverId}
                    onChange={(e) => setDriverRefundForm((prev) => ({ ...prev, driverId: e.target.value }))}
                    className="w-full p-2 rounded-lg border border-[#0B1F3A]/20 bg-white"
                    placeholder="Driver user ID"
                  />
                )}
                <input
                  type="number"
                  min="0"
                  value={driverRefundForm.refundAmount}
                  onChange={(e) => setDriverRefundForm((prev) => ({ ...prev, refundAmount: e.target.value }))}
                  className="w-full p-2 rounded-lg border border-[#0B1F3A]/20 bg-white"
                  placeholder="Refund gross amount (blank = full pending)"
                />
                <select
                  value={driverRefundForm.currency}
                  onChange={(e) => setDriverRefundForm((prev) => ({ ...prev, currency: e.target.value }))}
                  className="w-full p-2 rounded-lg border border-[#0B1F3A]/20 bg-white"
                >
                  {Array.from(new Set([driverRefundForm.currency, ...(driverCommissionSummary?.config?.supportedCurrencies || ["INR", "USD"])]))
                    .filter(Boolean)
                    .map((cur) => (
                      <option key={cur} value={cur}>{cur}</option>
                    ))}
                </select>
                <select
                  value={driverRefundForm.paymentMode}
                  onChange={(e) => setDriverRefundForm((prev) => ({ ...prev, paymentMode: e.target.value }))}
                  className="w-full p-2 rounded-lg border border-[#0B1F3A]/20 bg-white"
                >
                  <option value="">Auto payment mode</option>
                  {(commissionPaymentModes || []).map((mode) => (
                    <option key={mode.modeId} value={mode.modeId}>{mode.label}</option>
                  ))}
                </select>
                <input
                  value={driverRefundForm.refundReason}
                  onChange={(e) => setDriverRefundForm((prev) => ({ ...prev, refundReason: e.target.value }))}
                  className="w-full p-2 rounded-lg border border-[#0B1F3A]/20 bg-white"
                  placeholder="Refund reason"
                />
                <input
                  value={driverRefundForm.providerReference}
                  onChange={(e) => setDriverRefundForm((prev) => ({ ...prev, providerReference: e.target.value }))}
                  className="w-full p-2 rounded-lg border border-[#0B1F3A]/20 bg-white"
                  placeholder="Gateway/UTR reference"
                />
                <input
                  value={driverRefundForm.clientReference}
                  onChange={(e) => setDriverRefundForm((prev) => ({ ...prev, clientReference: e.target.value }))}
                  className="w-full p-2 rounded-lg border border-[#0B1F3A]/20 bg-white"
                  placeholder="Client reference"
                />
                <button
                  onClick={refundDriverCommissionManually}
                  className="px-3 py-2 rounded-full bg-[#FF9933] text-[#0B1F3A] text-xs disabled:opacity-50"
                  disabled={!isAdminPortal || driverCommissionAction.refunding}
                >
                  {!isAdminPortal ? "Admin only" : driverCommissionAction.refunding ? "Refunding..." : "Process refund"}
                </button>
              </div>

              <div className="rounded-2xl border border-[#0B1F3A]/15 bg-white/85 p-4">
                <p className="text-sm font-semibold text-[#0B1F3A]">Wallet snapshot</p>
                <p className="text-2xl font-bold text-[#0B1F3A] mt-2">
                  ₹{Number(driverCommissionWallet?.balance || 0).toLocaleString("en-IN")}
                  <span className="text-sm text-[#0B1F3A]/70 ml-2">{driverCommissionWallet?.currency || "INR"}</span>
                </p>
                <p className="text-[11px] text-[#0B1F3A]/60 mt-1">
                  Wallet owner: {driverCommissionWallet?.ownerId || (isAdminPortal ? "Select a driver ID" : "Current driver")}
                </p>
                {driverCommissionSummary?.config && (
                  <p className="text-[11px] text-[#0B1F3A]/65 mt-2">
                    India split: Admin {Number(driverCommissionSummary.config.indiaAdminCommissionPercent || 0)}% / Customer {Number(driverCommissionSummary.config.indiaCustomerCommissionPercent || 0)}%
                    <br />
                    Intl split: Admin {Number(driverCommissionSummary.config.internationalAdminCommissionPercent || 0)}% / Customer {Number(driverCommissionSummary.config.internationalCustomerCommissionPercent || 0)}%
                  </p>
                )}

                {isAdminPortal && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-[#0B1F3A]">Admin totals</p>
                    <div className="mt-2 space-y-2 max-h-28 overflow-y-auto">
                      {(driverCommissionSummary?.totals || []).slice(0, 6).map((row, index) => (
                        <div key={`${row?._id?.source || "unknown"}-${index}`} className="rounded-lg border border-[#0B1F3A]/15 bg-white/80 p-2">
                          <p className="text-[11px] text-[#0B1F3A]/80">{row?._id?.source || "source"} ({row?._id?.currency || "INR"})</p>
                          <p className="text-sm font-semibold text-[#0B1F3A]">{Number(row?.amount || 0).toLocaleString("en-IN")}</p>
                          <p className="text-[11px] text-[#0B1F3A]/55">Tx count: {Number(row?.count || 0)}</p>
                        </div>
                      ))}
                      {(!driverCommissionSummary?.totals || driverCommissionSummary.totals.length === 0) && (
                        <p className="text-[11px] text-[#0B1F3A]/60">No admin totals yet.</p>
                      )}
                    </div>
                  </div>
                )}

                <p className="text-xs font-semibold text-[#0B1F3A] mt-3">Recent driver wallet transactions</p>
                <div className="mt-2 space-y-2 max-h-32 overflow-y-auto">
                  {(driverCommissionMine || []).slice(0, 6).map((row) => (
                    <div key={row._id} className="rounded-lg border border-[#0B1F3A]/15 bg-white/80 p-2">
                      <p className="text-sm font-semibold text-[#0B1F3A]">{row.direction === "debit" ? "-" : "+"}₹{Number(row.amount || 0).toLocaleString("en-IN")} {row.currency || "INR"}</p>
                      <p className="text-[11px] text-[#0B1F3A]/65">{row.source}</p>
                      <p className="text-[11px] text-[#0B1F3A]/55">{formatNotificationTime(row.createdAt)}</p>
                    </div>
                  ))}
                  {(driverCommissionMine || []).length === 0 && (
                    <p className="text-[11px] text-[#0B1F3A]/60">No driver commission transactions yet.</p>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}
        {SHOW_WORKING_AI_SECTIONS && (
          <section className="glass-card rounded-2xl p-5 border border-[#0B1F3A]/15">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4">
            <div>
              <p className="text-sm font-semibold text-[#0B1F3A]">Automatic AI Control Center</p>
              <p className="text-xs text-[#0B1F3A]/65">Unified AI status for customer, driver, and admin portals.</p>
            </div>
            <button
              onClick={() => loadAiSummary({ silent: false })}
              className="self-start md:self-auto text-xs px-3 py-1.5 rounded-full bg-[#0B1F3A] text-white"
              disabled={aiSummaryLoading}
            >
              {aiSummaryLoading ? "Refreshing..." : "Refresh AI status"}
            </button>
          </div>

          {aiSummaryError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-2 mb-3">
              {aiSummaryError}
            </p>
          )}

          <div className="grid md:grid-cols-3 gap-3 mb-4">
            <div className="rounded-xl border border-[#0B1F3A]/10 bg-white/80 p-3 text-left">
              <p className="text-xs uppercase text-[#0B1F3A]/60">Incidents (24h)</p>
              <p className="text-2xl font-bold text-[#0B1F3A]">{Number(aiSummary?.window?.incidents24h || 0)}</p>
            </div>
            <div className="rounded-xl border border-[#0B1F3A]/10 bg-white/80 p-3 text-left">
              <p className="text-xs uppercase text-[#0B1F3A]/60">High risk users</p>
              <p className="text-2xl font-bold text-[#0B1F3A]">{Number(aiSummary?.window?.highRiskUsers || 0)}</p>
            </div>
            <div className="rounded-xl border border-[#0B1F3A]/10 bg-white/80 p-3 text-left">
              <p className="text-xs uppercase text-[#0B1F3A]/60">Auto bans active</p>
              <p className="text-2xl font-bold text-[#0B1F3A]">{Number(aiSummary?.window?.activeBans || 0)}</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 text-left">
            {automationModules.map((item) => (
              <div key={item.id || item.title} className="rounded-xl border border-[#0B1F3A]/10 bg-white/85 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[#0B1F3A]">{item.title}</p>
                  <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full border ${getStatusStyle(item.status || "healthy")}`}>
                    {(item.status || "healthy").toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-[#0B1F3A]/70 mt-2">{item.detail}</p>
                <p className="text-[11px] text-[#0B1F3A]/55 mt-2">{item.mode || "Auto"}</p>
              </div>
            ))}
          </div>
        </section>
        )}

        <section className="glass-card rounded-2xl p-5 border border-[#0B1F3A]/15">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <div>
              <p className="text-sm font-semibold text-[#0B1F3A]">Change Password</p>
              <p className="text-xs text-[#0B1F3A]/65">Secure password update for {portalLabel} account</p>
            </div>
            {isAdminPortal && (
              <span className="text-[11px] px-2 py-1 rounded-full border border-[#0B1F3A]/20 bg-white/70 text-[#0B1F3A]">
                Admin OTP required
              </span>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <input
              type="password"
              placeholder="Current password"
              className="w-full p-3 rounded-xl border border-[#0B1F3A]/10 bg-white/85"
              value={passwordForm.currentPassword}
              onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
            />
            <input
              type="password"
              placeholder="New password"
              className="w-full p-3 rounded-xl border border-[#0B1F3A]/10 bg-white/85"
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
            />
            <input
              type="password"
              placeholder="Confirm new password"
              className="w-full p-3 rounded-xl border border-[#0B1F3A]/10 bg-white/85"
              value={passwordForm.confirmPassword}
              onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
            />
            {isAdminPortal && (
              <input
                type="text"
                inputMode="numeric"
                placeholder="Admin OTP"
                className="w-full p-3 rounded-xl border border-[#0B1F3A]/10 bg-white/85"
                value={passwordForm.adminOtp}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, adminOtp: e.target.value }))}
              />
            )}
          </div>

          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <button
              onClick={handleChangePassword}
              disabled={passwordAction.loading}
              className="px-4 py-2 rounded-full bg-[#0B1F3A] text-white text-sm disabled:opacity-60"
            >
              {passwordAction.loading ? "Updating..." : "Update Password"}
            </button>
            <span className="text-[11px] text-[#0B1F3A]/60">
              Use 8+ chars with upper, lower, number and special character.
            </span>
          </div>

          {passwordAction.error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-2 mt-3">
              {passwordAction.error}
            </p>
          )}

          {passwordAction.success && (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-2 mt-3">
              {passwordAction.success}
            </p>
          )}
        </section>
        <div className="flex gap-3">
          <button
            onClick={() => navigate("/")}
            className="px-4 py-2 rounded-full bg-white border border-[#0B1F3A]/20 text-[#0B1F3A]"
          >
            Home
          </button>
          <button
            onClick={handleLogout}
            className="px-4 py-2 rounded-full bg-[#0B1F3A] text-white shadow-md"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}

function AdminDashboard() {
  return <Dashboard />;
}

function DriverDashboard() {
  return <Dashboard />;
}

function ProtectedRoute({ children }) {
  const token = localStorage.getItem("token");
  return token ? children : <Navigate to="/login" />;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/customer"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/driver"
        element={
          <ProtectedRoute>
            <DriverDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;








