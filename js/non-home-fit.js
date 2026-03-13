(function initFitScreen() {
  function shouldSkipFitScreen() {
    const path = String(window.location.pathname || "").toLowerCase();
    return path.endsWith("/pages/login.html") || path.endsWith("/pages/signup.html");
  }

  if (shouldSkipFitScreen()) {
    return;
  }

  function selectScrollHost() {
    const selectors = [
      "main",
      ".main-content",
      ".container",
      ".dashboard-container",
      ".content-wrapper",
      ".content",
      "#root",
      "section.active",
      "section"
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element !== document.body) {
        return element;
      }
    }

    const fallback = Array.from(document.body.children).find((child) => {
      const tag = child.tagName.toLowerCase();
      return tag !== "script" && tag !== "style" && tag !== "noscript";
    });

    return fallback || null;
  }

  function ensureScaleLayer(scrollHost) {
    const existing = scrollHost.querySelector(":scope > .fit-scale-layer");
    if (existing) {
      return existing;
    }

    const scaleLayer = document.createElement("div");
    scaleLayer.className = "fit-scale-layer";

    const nodes = Array.from(scrollHost.childNodes);
    for (const node of nodes) {
      scaleLayer.appendChild(node);
    }

    scrollHost.appendChild(scaleLayer);
    return scaleLayer;
  }

  function getTopOffset(scrollHost) {
    let offset = 0;
    const children = Array.from(document.body.children);

    for (const child of children) {
      const tag = child.tagName.toLowerCase();
      if (child === scrollHost || tag === "script" || tag === "style" || tag === "noscript") {
        continue;
      }

      const className = String(child.className || "").toLowerCase();
      const isTopBar =
        tag === "nav" ||
        tag === "header" ||
        className.includes("top-nav") ||
        className.includes("navbar") ||
        className.includes("topbar");

      if (isTopBar) {
        offset += child.getBoundingClientRect().height;
      }
    }

    return Math.max(0, Math.round(offset));
  }

  function calculateScale(scaleLayer, availableHeight) {
    scaleLayer.style.transform = "scale(1)";
    scaleLayer.style.width = "100%";

    // Force layout recalculation before measurement.
    void scaleLayer.offsetHeight;

    const naturalHeight = Math.max(scaleLayer.scrollHeight, scaleLayer.offsetHeight, 1);
    const naturalWidth = Math.max(scaleLayer.scrollWidth, scaleLayer.offsetWidth, 1);
    const scaleH = availableHeight / naturalHeight;
    const scaleW = window.innerWidth / naturalWidth;

    return Math.min(1, scaleH, scaleW);
  }

  function applyFitLayout() {
    document.documentElement.classList.add("fit-screen-page");
    document.body.classList.add("fit-screen-page");
    document.body.classList.remove("fit-density-tight", "fit-density-ultra");

    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    document.documentElement.style.setProperty("--fit-dvh", `${viewportHeight}px`);

    const scrollHost = selectScrollHost();
    if (!scrollHost) {
      return;
    }

    const topOffset = getTopOffset(scrollHost);
    document.documentElement.style.setProperty("--fit-top-offset", `${topOffset}px`);
    scrollHost.classList.add("fit-scroll-host");

    const scaleLayer = ensureScaleLayer(scrollHost);
    const availableHeight = Math.max(1, viewportHeight - topOffset);

    let scale = calculateScale(scaleLayer, availableHeight);

    if (scale < 0.8) {
      document.body.classList.add("fit-density-tight");
      scale = calculateScale(scaleLayer, availableHeight);
    }

    if (scale < 0.66) {
      document.body.classList.remove("fit-density-tight");
      document.body.classList.add("fit-density-ultra");
      scale = calculateScale(scaleLayer, availableHeight);
    }

    const finalScale = Math.max(0.46, Math.min(1, scale));
    scaleLayer.style.width = `${(100 / finalScale).toFixed(4)}%`;
    scaleLayer.style.transform = `scale(${finalScale.toFixed(4)})`;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyFitLayout, { once: true });
  } else {
    applyFitLayout();
  }

  window.addEventListener("resize", applyFitLayout, { passive: true });
  window.addEventListener("orientationchange", applyFitLayout, { passive: true });
})();
