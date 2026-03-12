(function initFitScreen() {
  function selectScrollHost() {
    const selectors = [
      "main",
      ".main-content",
      ".container",
      ".dashboard-container",
      ".content-wrapper",
      ".content",
      ".signup-container",
      ".login-container",
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

  function applyFitLayout() {
    document.documentElement.classList.add("fit-screen-page");
    document.body.classList.add("fit-screen-page");

    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    document.documentElement.style.setProperty("--fit-dvh", `${viewportHeight}px`);

    const scrollHost = selectScrollHost();
    if (!scrollHost) {
      return;
    }

    const topOffset = getTopOffset(scrollHost);
    document.documentElement.style.setProperty("--fit-top-offset", `${topOffset}px`);
    scrollHost.classList.add("fit-scroll-host");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyFitLayout, { once: true });
  } else {
    applyFitLayout();
  }

  window.addEventListener("resize", applyFitLayout, { passive: true });
  window.addEventListener("orientationchange", applyFitLayout, { passive: true });
})();
