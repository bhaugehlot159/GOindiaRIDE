import { useState } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import "./App.css";

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
      "Login/device/IP scoring with auto-lock, OTP escalation & geo checks.",
  },
  {
    title: "Secure-by-default",
    detail:
      "Helmet, CORS whitelist (goindiaride.in), Mongo sanitize, XSS clean, CSRF shield.",
  },
  {
    title: "Ops Ready",
    detail:
      "PM2 restarts, error scrubbing, request signature & replay protection baseline.",
  },
];

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
              <h1 className="text-3xl font-black tricolor-text">Bharat Mobility Cloud</h1>
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
              XSS • CSRF • Signature verification
            </span>
            <span className="px-3 py-1 rounded-full bg-white/70 border border-[#138808]/40 text-[#0B1F3A]">
              Device fingerprint + geo checks
            </span>
            <span className="px-3 py-1 rounded-full bg-white/70 border border-[#0B1F3A]/20 text-[#0B1F3A]">
              AI dispatch & anomaly alerts
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
                    <span className="text-lg">•</span>
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
      const res = await fetch("http://localhost:5000/api/auth/login", {
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
    } catch (err) {
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
              2FA & OTP will trigger automatically if enabled on your account.
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

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    navigate("/");
  };

  const chips = [
    "AI anomaly watch active",
    "CSP + CORS hardened",
    "Device fingerprinting ready",
  ];

  return (
    <div className="min-h-screen relative text-[#0B1F3A]">
      <div className="absolute inset-0 bg-gradient-to-br from-[#FF9933] via-white to-[#138808]" />
      <div className="absolute inset-0 dash-grid opacity-50" />
      <div className="absolute inset-0 bg-white/65 backdrop-blur-sm" />
      <div className="relative z-10 max-w-5xl mx-auto px-6 py-10 space-y-6">
        <div className="glass-card rounded-2xl p-6 border border-[#0B1F3A]/10 shadow-xl">
          <p className="text-sm uppercase tracking-[0.2em] text-[#0B1F3A]/70 mb-2">
            {role === "admin" ? "Admin" : "User"} cockpit
          </p>
          <h2 className="text-3xl font-bold tricolor-text mb-3">
            {role === "admin" ? "Admin Dashboard 🛡️" : "User Dashboard 🚀"}
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

        <div className="grid md:grid-cols-3 gap-4">
          <div className="glass-card rounded-2xl p-4 border border-[#FF9933]/40 ring-saffron">
            <p className="text-sm font-semibold text-[#0B1F3A]">Security posture</p>
            <p className="text-xs text-[#0B1F3A]/70 mt-2">
              CSRF shield, rate limits, request signatures and replay protection are enabled by default.
            </p>
          </div>
          <div className="glass-card rounded-2xl p-4 border border-[#138808]/40 ring-green">
            <p className="text-sm font-semibold text-[#0B1F3A]">Risk & devices</p>
            <p className="text-xs text-[#0B1F3A]/70 mt-2">
              Device fingerprinting, geo checks and anomaly bans are wired into the login flow.
            </p>
          </div>
          <div className="glass-card rounded-2xl p-4 border border-[#0B1F3A]/20">
            <p className="text-sm font-semibold text-[#0B1F3A]">Next up</p>
            <p className="text-xs text-[#0B1F3A]/70 mt-2">
              Booking timeline, SOS, and live tracking cards will slot here once backend endpoints are ready.
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

