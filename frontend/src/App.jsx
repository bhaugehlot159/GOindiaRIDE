import { useCallback, useEffect, useMemo, useState } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import "./App.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

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
      "AI auto-dispatch and fraud flags",
      "RBAC with IP allow-list and 2FA",
      "Smart lockdown and rate controls",
    ],
    actionPath: "/admin",
    dark: true,
  },
];

const securityHighlights = [
  {
    title: "AI Risk Engine",
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
            Secure rides, AI fraud defence, tri-colour pride.
          </h2>
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="px-3 py-1 rounded-full bg-white/70 border border-[#FF9933]/40 text-[#0B1F3A]">
              XSS and CSRF and signature verification
            </span>
            <span className="px-3 py-1 rounded-full bg-white/70 border border-[#138808]/40 text-[#0B1F3A]">
              Device fingerprint and geo checks
            </span>
            <span className="px-3 py-1 rounded-full bg-white/70 border border-[#0B1F3A]/20 text-[#0B1F3A]">
              AI dispatch and anomaly alerts
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

        <section className="glass-card rounded-2xl p-5 border border-[#0B1F3A]/10">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <h3 className="text-lg font-bold text-[#0B1F3A]">AI Automation Stack</h3>
            <span className="text-xs uppercase tracking-[0.16em] text-[#0B1F3A]/60">Auto monitored</span>
          </div>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 text-left">
            {aiAutomationDefaults.map((item) => (
              <div key={item.id} className="rounded-xl border border-[#0B1F3A]/10 bg-white/80 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[#0B1F3A]">{item.title}</p>
                  <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full border ${getStatusStyle(item.status)}`}>
                    {item.mode}
                  </span>
                </div>
                <p className="text-xs text-[#0B1F3A]/70 mt-2">{item.detail}</p>
              </div>
            ))}
          </div>
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
  const navigate = useNavigate();
  const isAdminMode = accountType === "admin";

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

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationError, setNotificationError] = useState("");
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [bookingActionState, setBookingActionState] = useState({
    loading: false,
    success: "",
    error: "",
  });
  const [sosState, setSosState] = useState({
    loading: false,
    channel: "",
    success: "",
    error: "",
  });
  const [aiSummary, setAiSummary] = useState(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiSummaryError, setAiSummaryError] = useState("");

  const chips = [
    "AI anomaly watch active",
    "CSP and CORS hardened",
    "Device fingerprinting ready",
  ];

  const portalLabel = role === "admin" ? "Admin" : accountType === "driver" ? "Driver" : "Customer";

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

      setNotifications(Array.isArray(data.items) ? data.items : []);
      setUnreadCount(Number(data.unreadCount || 0));
      setNotificationError("");
    } catch (error) {
      if (!silent) {
        setNotificationError(error.message || "Notifications unavailable");
      }
    } finally {
      if (!silent) {
        setNotificationLoading(false);
      }
    }
  }, [token]);

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

  useEffect(() => {
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
      loadNotifications({ silent: false });
    } catch (error) {
      setBookingActionState({
        loading: false,
        success: "",
        error: error.message || "Could not create demo booking",
      });
    }
  };

  const triggerSos = async (channel) => {
    if (!token) return;

    setSosState({ loading: true, channel, success: "", error: "" });
    try {
      const response = await fetch(`${API_BASE_URL}/api/security/sos`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel,
          note: `Dashboard quick SOS (${channel})`,
          location: {
            address: "Dashboard quick action",
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Unable to trigger SOS");
      }

      setSosState({
        loading: false,
        channel,
        success: `SOS sent (${channel}). Incident: ${data.incidentId}`,
        error: "",
      });

      loadNotifications({ silent: false });
      loadAiSummary({ silent: true });
    } catch (error) {
      setSosState({
        loading: false,
        channel,
        success: "",
        error: error.message || "SOS request failed",
      });
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

            <div className="relative self-start">
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
