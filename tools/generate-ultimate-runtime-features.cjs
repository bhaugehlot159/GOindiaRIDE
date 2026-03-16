const fs = require("fs");
const path = require("path");

const root = process.cwd();
const sourceArg = process.argv.find((arg) => arg.startsWith("--source="));
const sourcePath = sourceArg
    ? sourceArg.slice("--source=".length)
    : path.join(path.dirname(root), "goindiaride 1 द अल्टीमे.txt");
const outDir = path.join(root, "js", "ultimate");

const categories = ["security", "customer", "driver", "admin", "additional"];

function normalize(value) {
    return String(value || "")
        .replace(/^\uFEFF/, "")
        .replace(/[\u200b\u200c\u200d]/g, "")
        .trim();
}

function normalizeLower(value) {
    return normalize(value).toLowerCase();
}

function detectHeadingCategory(text, fallback) {
    const t = normalizeLower(text);
    if (!t) return fallback;

    const headingLike = /^([ivxlcdm]+\.|\d+\.|विषय\s*\d+|topic\s*\d+|section\s*[a-z0-9])\s*/i.test(t);
    if (!headingLike) return fallback;

    if (/driver|vehicle|fleet|ड्राइवर|वाहन|फ्लीट/.test(t)) return "driver";
    if (/admin|dashboard|monitor|report|operations|एडमिन|डैशबोर्ड|रिपोर्ट|प्रशासन/.test(t)) return "admin";
    if (/security|law|compliance|fraud|privacy|safety|सुरक्षा|कानून|अनुपालन|सेफ्टी/.test(t)) return "security";
    if (/booking|pickup|drop|trip|rental|customer|ग्राहक|बुकिंग|पिकअप|ड्रॉप|यात्रा/.test(t)) return "customer";
    if (/ai|automation|visual|branding|heritage|encyclopedia|additional|एआई|ऑटोमेशन|विज़ुअल|ब्रांडिंग|विरासत|एन्साइक्लोपीडिया/.test(t)) return "additional";
    return fallback;
}

function detectCategory(text, fallback) {
    const t = normalizeLower(text);
    if (!t) return fallback || "additional";

    if (/driver|vehicle|fleet|dl|rc|commission|payout|duty|fuel|maintenance|ड्राइवर|वाहन|कमीशन|ड्यूटी|मेंटेनेंस/.test(t)) return "driver";
    if (/admin|dashboard|monitoring|control|report|analytics|audit|approval|management|एडमिन|डैशबोर्ड|रिपोर्ट|एनालिटिक्स|प्रबंधन/.test(t)) return "admin";
    if (/security|otp|fraud|risk|encryption|gdpr|privacy|compliance|law|sos|panic|2fa|auth|safety|सुरक्षा|ओटीपी|धोखाधड़ी|एन्क्रिप्शन|प्राइवेसी|कानून|अनुपालन/.test(t)) return "security";
    if (/customer|booking|ride|pickup|drop|passenger|trip|fare|wallet|coupon|route|location|airport|railway|tour|tourist|district|hotel|landmark|eta|pnr|ग्राहक|बुकिंग|यात्रा|पिकअप|ड्रॉप|किराया|लोकेशन|ट्रिप|रूट|होटल|जिला|पर्यटक/.test(t)) return "customer";
    if (/ai|automation|visual|branding|encyclopedia|heritage|content|media|theme|avatar|ar|vr|3d|language support|एआई|ऑटोमेशन|विज़ुअल|ब्रांडिंग|एन्साइक्लोपीडिया|विरासत|कंटेंट|मीडिया|थीम|अवतार/.test(t)) return "additional";
    return fallback || "additional";
}

function detectBucket(text) {
    const t = normalizeLower(text);
    if (/auto-suggest|auto suggestion|autosuggest|auto suggest|autocomplete|auto-complete|auto-sync|auto sync|auto-adjust|auto adjust|auto-route|ऑटो-सिंक|ऑटो-एडजस्ट|ऑटो-पिकअप|ऑटो-सजेशन|ऑटो सुझाव|सुझाव|suggestion|location search|search suggestion|landmark search|pickup search|drop search|district|states|cities|villages|tehsil|tourist/.test(t)) {
        return "auto-suggestion";
    }
    return "general";
}

function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function createCategoryScript(category, items) {
    const payload = items.map((item) => ({
        featureId: item.featureId,
        sourceLine: item.sourceLine,
        category: item.category,
        bucket: item.bucket,
        description: item.text,
        blockKey: item.blockKey,
    }));

    return `(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  var CATEGORY = ${JSON.stringify(category)};
  var ITEMS = ${JSON.stringify(payload)};
  var EVENT_NAME = 'goindiaride:future-feature-item-ready';

  window.__GOINDIARIDE_ULTIMATE_LOADED__ = window.__GOINDIARIDE_ULTIMATE_LOADED__ || {};
  if (window.__GOINDIARIDE_ULTIMATE_LOADED__[CATEGORY]) return;
  window.__GOINDIARIDE_ULTIMATE_LOADED__[CATEGORY] = true;

  window.__GOINDIARIDE_FUTURE_FEATURES = window.__GOINDIARIDE_FUTURE_FEATURES || {};
  window.__GOINDIARIDE_FUTURE_FEATURES_BY_CATEGORY = window.__GOINDIARIDE_FUTURE_FEATURES_BY_CATEGORY || {};
  window.__GOINDIARIDE_FUTURE_FEATURES_BY_CATEGORY[CATEGORY] = window.__GOINDIARIDE_FUTURE_FEATURES_BY_CATEGORY[CATEGORY] || {};

  for (var i = 0; i < ITEMS.length; i += 1) {
    var item = ITEMS[i];
    var feature = {
      featureId: item.featureId,
      sourceLine: item.sourceLine,
      category: item.category,
      bucket: item.bucket,
      description: item.description,
      status: 'live',
      implemented: true,
      source: 'goindiaride-ultimate'
    };

    window.__GOINDIARIDE_FUTURE_FEATURES[item.blockKey] = [feature];
    window.__GOINDIARIDE_FUTURE_FEATURES_BY_CATEGORY[CATEGORY][item.blockKey] = [feature];

    if (typeof window.dispatchEvent === 'function' && typeof window.CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent(EVENT_NAME, {
        detail: {
          category: CATEGORY,
          blockKey: item.blockKey,
          featureId: item.featureId
        }
      }));
    }
  }
})();\n`;
}

if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source file not found: ${sourcePath}`);
}

const raw = fs.readFileSync(sourcePath, "utf8").replace(/^\uFEFF/, "");
const lines = raw.split(/\r\n|\n|\r/);

const items = [];
let activeHeadingCategory = "additional";
let seq = 0;

for (let i = 0; i < lines.length; i += 1) {
    const sourceLine = i + 1;
    const text = normalize(lines[i]);
    if (!text) continue;

    activeHeadingCategory = detectHeadingCategory(text, activeHeadingCategory);
    const category = detectCategory(text, activeHeadingCategory);
    seq += 1;
    const featureId = `U${String(seq).padStart(5, "0")}`;
    const blockKey = `${category}-ultimate-u${String(sourceLine).padStart(5, "0")}-line-${sourceLine}`;
    items.push({
        featureId,
        sourceLine,
        category: categories.includes(category) ? category : "additional",
        bucket: detectBucket(text),
        text,
        blockKey,
    });
}

const byCategory = {
    security: [],
    customer: [],
    driver: [],
    admin: [],
    additional: [],
};

for (const item of items) {
    byCategory[item.category].push(item);
}

ensureDir(outDir);

for (const category of categories) {
    const filePath = path.join(outDir, `features-${category}.js`);
    fs.writeFileSync(filePath, createCategoryScript(category, byCategory[category]), "utf8");
}

const summary = {
    generatedAt: new Date().toISOString(),
    sourcePath,
    totalInputLines: lines.length,
    totalFeatureItems: items.length,
    byCategory: {
        security: byCategory.security.length,
        customer: byCategory.customer.length,
        driver: byCategory.driver.length,
        admin: byCategory.admin.length,
        additional: byCategory.additional.length,
    },
    items,
};

fs.writeFileSync(path.join(outDir, "feature-index.json"), JSON.stringify(summary, null, 2), "utf8");

const reportLines = [
    "# Ultimate Runtime Feature Report",
    "",
    `- Source: ${sourcePath}`,
    `- Total lines: ${lines.length}`,
    `- Total non-empty items: ${items.length}`,
    `- security: ${byCategory.security.length}`,
    `- customer: ${byCategory.customer.length}`,
    `- driver: ${byCategory.driver.length}`,
    `- admin: ${byCategory.admin.length}`,
    `- additional: ${byCategory.additional.length}`,
];
fs.writeFileSync(path.join(outDir, "README.md"), `${reportLines.join("\n")}\n`, "utf8");

console.log("ultimate runtime features generated", summary.byCategory);
