import { useCallback, useEffect, useState } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import "./App.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

const portalCards = [
  {
    title: "Customer Portal",
    tag: "Safe rides, transparent fares",
    gradient: "from-[#FF9933] to-[#FFC46B]",
    bullets: [
      "Real-time fare preview incl. toll & night charges",
      "SOS with police + ambulance routes",
      "Multi-language (Hindi / English / Rajasthani)",
    ],
  },
  {
    title: "Driver Portal",
    tag: "Low commission, full control",
    gradient: "from-[#138808] to-[#6AD182]",
    bullets: [
      "Document vault with expiry alerts",
      "Security deposit tracker & earnings board",
      "Ratings + penalties insight",
    ],
  },
  {
    title: "Admin Command",
    tag: "Audit-ready governance",
    gradient: "from-[#0B1F3A] to-[#0f3c6e]",
    bullets: [
      "AI auto-dispatch & fraud flags",
      "RBAC with IP allow-list + 2FA",
      "Smart lockdown + rate controls",
    ],
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
      "Helmet, CORS whitelist (goindiaride.in), Mongo sanitize, XSS clean, CSRF shield.",
  },
  {
    title: "Ops Ready",
    detail:
      "PM2 restarts, error scrubbing, request signature and replay protection baseline.",
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

function Landing() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

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
              onClick={() => navigate(token ? "/dashboard" : "/login")}
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
              className={`glass-card rounded-2xl p-6 border shadow-md bg-gradient-to-br ${card.gradient} text-[#0B1F3A]`}
            >
              <p className="text-xs uppercase tracking-[0.15em] text-[#0B1F3A]/70 mb-2">
                {card.tag}
              </p>
              <h3 className="text-xl font-bold mb-3">{card.title}</h3>
              <ul className="space-y-2 text-sm text-[#0B1F3A]/90">
                {card.bullets.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="text-lg">*</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => navigate("/login")}
                className="mt-4 inline-flex items-center justify-center px-3 py-2 rounded-full bg-[#0B1F3A] text-white text-sm hover:scale-105 transition"
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok || !data.accessToken) {
        setError(data.message || "Login failed");
        setLoading(false);
        return;
      }

      localStorage.setItem("token", data.accessToken);
      localStorage.setItem("role", data.role);

      if (data.role === "admin") {
        navigate("/admin");
      } else {
        navigate("/dashboard");
      }
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
              2FA and OTP will trigger automatically if enabled on your account.
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
  const token = localStorage.getItem("token");

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationError, setNotificationError] = useState("");
  const [markingAllRead, setMarkingAllRead] = useState(false);

  const chips = [
    "AI anomaly watch active",
    "CSP + CORS hardened",
    "Device fingerprinting ready",
  ];

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

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
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
                {role === "admin" ? "Admin" : "User"} cockpit
              </p>
              <h2 className="text-3xl font-bold tricolor-text mb-3">
                {role === "admin" ? "Admin Dashboard" : "User Dashboard"}
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

        <div className="grid md:grid-cols-3 gap-4">
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
            <p className="text-sm font-semibold text-[#0B1F3A]">Next up</p>
            <p className="text-xs text-[#0B1F3A]/70 mt-2">
              Booking timeline, SOS, and live tracking cards are now ready for portal-level wiring.
            </p>
          </div>
        </div>

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



