(function initPublicAIAutoSystem() {
    "use strict";

    function detectModeFromPath() {
        const path = String(window.location.pathname || "").toLowerCase();
        if (path.includes("login")) return "login";
        if (path.includes("signup")) return "signup";
        if (path.includes("booking")) return "booking";
        return "public";
    }

    function ensureFormWatch(mode) {
        if (!window.GoIndiaAuthenticityEngine) {
            return;
        }

        const forms = Array.from(document.querySelectorAll("form"));
        forms.forEach((form, index) => {
            window.GoIndiaAuthenticityEngine.watchForm(form, {
                mode,
                minFillMs: mode === "signup" ? 1800 : 1400,
                honeypotFieldName: `goi_hp_${mode}_${index + 1}`,
            });
        });
    }

    function moduleFactory(mode, summary) {
        const authenticityStatus = summary.authenticityStatus || "elevated";
        const authenticityLabel = summary.authenticityLabel || "review";

        return [
            {
                title: "Fake vs Real Session AI",
                status: authenticityStatus,
                detail: "Detects bot-like behavior with honeypot, form timing, and interaction pattern checks.",
                action: `Action: ${authenticityLabel.replace(/_/g, " ")} score ${summary.authenticityScore || 0}`,
            },
            {
                title: "Public Threat Surface Watch",
                status: summary.status,
                detail: "Monitors risky payload patterns and suspicious rapid actions on open pages.",
                action: "Action: Public page watch active",
            },
            {
                title: "Auto Gatekeeper",
                status: authenticityStatus,
                detail: "Escalates suspicious sessions for additional verification before critical steps.",
                action: authenticityStatus === "critical" ? "Action: Verification guard raised" : "Action: Guard healthy",
            },
        ];
    }

    function boot() {
        if (!window.GoIndiaAIAutoCore) {
            return;
        }

        const mode = detectModeFromPath();

        window.GoIndiaAIAutoCore.mount({
            id: `public-ai-auto-${mode}`,
            mode,
            title: "AI Automatic Fake/Real Detection",
            selectors: [".signup-right", ".login-right", ".hero-content", ".container", "body"],
            insertPosition: "afterbegin",
            intervalMs: 12000,
            moduleFactory: (_, __) => moduleFactory(mode, window.GoIndiaAIAutoCore.evaluateMode(mode)),
        });

        ensureFormWatch(mode);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})();
