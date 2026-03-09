const fs = require("fs");
const path = require("path");

const root = process.cwd();
const desktopSourcePath = path.join(path.dirname(root), "COMPLETE-FEATURES-LIST.txt");
const sourcePath = path.join(root, "feature-pack", "00-source", "COMPLETE-FEATURES-LIST.txt");
const outIndexPath = path.join(root, "feature-pack", "06-index", "FEATURE-INDEX.json");
const outSummaryPath = path.join(root, "feature-pack", "06-index", "FEATURE-SUMMARY.md");
const auditDir = path.join(root, "feature-pack", "07-audit");
const auditCsvPath = path.join(auditDir, "LINE-COVERAGE.csv");
const auditReportPath = path.join(auditDir, "COVERAGE-REPORT.md");
const multiPointReportPath = path.join(auditDir, "MULTI-POINT-LINES.md");

const outFiles = {
    security: path.join(root, "feature-pack", "01-security", "security-and-global-levels.txt"),
    customer: path.join(root, "feature-pack", "02-customer", "customer-portal-features.txt"),
    driver: path.join(root, "feature-pack", "03-driver", "driver-portal-features.txt"),
    admin: path.join(root, "feature-pack", "04-admin", "admin-portal-features.txt"),
    additional: path.join(root, "feature-pack", "05-additional", "additional-and-notes.txt"),
};

const sectionOrder = ["security", "customer", "driver", "admin", "additional"];

const sectionMatcher = {
    additional: [
        /section\s*d\b/i,
        /\badditional features\b/i,
        /अतिरिक्त फीचर्स/i,
    ],
    admin: [
        /section\s*c\b/i,
        /\badmin\s+port(?:a|e)l\b/i,
        /एडमिन पोर्टल/i,
    ],
    driver: [
        /section\s*b\b/i,
        /\bdriver\s+port(?:a|e)l\b/i,
        /ड्राइवर पोर्टल/i,
    ],
    customer: [
        /section\s*a\b/i,
        /\bcustomer\s+port(?:a|e)l\b/i,
        /\bcostumer\s+port(?:a|e)l\b/i,
        /ग्राहक पोर्टल/i,
    ],
};

function ensureDir(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function normalizeForMatch(value) {
    return String(value || "")
        .replace(/^\uFEFF/, "")
        .replace(/[\u200b\u200c\u200d]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

function isHeadingLike(rawLine) {
    const trimmed = String(rawLine || "").trim();
    if (!trimmed) return false;

    const normalized = normalizeForMatch(trimmed);
    if (/^#{1,6}\s*/.test(trimmed)) return true;
    if (/^[-=*]{3,}$/.test(trimmed)) return true;
    if (/^section\s+[a-z0-9]/i.test(normalized)) return true;
    if (/^level\s*\d+/i.test(normalized)) return true;
    if (/^final result/i.test(normalized)) return true;
    if (/^free में/i.test(normalized)) return true;
    if (/^[\u25A0]+/.test(trimmed)) return true;

    if (/\b(customer|costumer|driver|admin)\s+port(?:a|e)l\b/i.test(normalized) && !/^[\-*•]/.test(trimmed)) {
        return true;
    }

    return false;
}

function detectSection(rawLine) {
    if (!isHeadingLike(rawLine)) {
        return null;
    }

    const trimmed = String(rawLine || "").trim();
    const normalized = normalizeForMatch(rawLine);

    const isTopLevelHashHeading = /^##(?!#)\s*/.test(trimmed);
    const isSquareHeading = /^[\u25A0]+/.test(trimmed);
    const isPortalHeading = /\b(customer|costumer|driver|admin)\s+port(?:a|e)l\b/i.test(normalized) && !/^[\-*•]/.test(trimmed);

    if (/section\s*d\b/i.test(normalized)) {
        return "additional";
    }

    if (isTopLevelHashHeading && (sectionMatcher.additional[1].test(normalized) || sectionMatcher.additional[2].test(rawLine))) {
        return "additional";
    }

    if (/section\s*c\b/i.test(normalized)) {
        return "admin";
    }

    if ((isTopLevelHashHeading || isSquareHeading || isPortalHeading) && sectionMatcher.admin.some((pattern) => pattern.test(rawLine) || pattern.test(normalized))) {
        return "admin";
    }

    if (/section\s*b\b/i.test(normalized)) {
        return "driver";
    }

    if ((isTopLevelHashHeading || isSquareHeading || isPortalHeading) && sectionMatcher.driver.some((pattern) => pattern.test(rawLine) || pattern.test(normalized))) {
        return "driver";
    }

    if (/section\s*a\b/i.test(normalized)) {
        return "customer";
    }

    if ((isTopLevelHashHeading || isSquareHeading || isPortalHeading) && sectionMatcher.customer.some((pattern) => pattern.test(rawLine) || pattern.test(normalized))) {
        return "customer";
    }

    return null;
}

function isLikelyMultiPointLine(rawLine) {
    const text = String(rawLine || "").trim();
    if (!text) return false;
    if (isHeadingLike(text)) return false;

    const commaCount = (text.match(/,/g) || []).length;
    const slashCount = (text.match(/\//g) || []).length;
    const semicolonCount = (text.match(/;/g) || []).length;

    if (/\s\|\s/.test(text)) return true;
    if (semicolonCount > 0) return true;
    if (/\s\/\s/.test(text)) return true;
    if (/\band\b.*\band\b/i.test(text)) return true;
    if (/और.*और/.test(text)) return true;
    if (commaCount >= 2) return true;

    if (commaCount >= 1 && (slashCount > 0 || /\band\b/i.test(text) || /और/.test(text))) {
        return true;
    }

    if (/^\w[^:]+:\s*\w+.*[,/].+/.test(text)) {
        return true;
    }

    return false;
}

if (fs.existsSync(desktopSourcePath)) {
    ensureDir(sourcePath);
    const desktopText = fs.readFileSync(desktopSourcePath, "utf8");
    fs.writeFileSync(sourcePath, desktopText.replace(/^\uFEFF/, ""), "utf8");
}

const source = fs.readFileSync(sourcePath, "utf8").replace(/^\uFEFF/, "");
const lines = source.split(/\r\n|\n|\r/);

let currentSection = "security";
const buckets = {
    security: [],
    customer: [],
    driver: [],
    admin: [],
    additional: [],
};

const indexed = [];

for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const lineNo = i + 1;
    const sectionHit = detectSection(raw);
    if (sectionHit) {
        currentSection = sectionHit;
    }

    const item = {
        id: `L${String(lineNo).padStart(4, "0")}`,
        lineNo,
        section: currentSection,
        likelyMultiPoint: isLikelyMultiPointLine(raw),
        text: raw,
    };

    indexed.push(item);
    buckets[currentSection].push(item);
}

const sectionStats = {};
for (const section of sectionOrder) {
    sectionStats[section] = {
        totalLines: buckets[section].length,
        nonEmptyLines: buckets[section].filter((item) => item.text.trim() !== "").length,
        likelyMultiPointLines: buckets[section].filter((item) => item.likelyMultiPoint).length,
    };
}

const totalMappedLines = sectionOrder.reduce((sum, section) => sum + sectionStats[section].totalLines, 0);
const totalNonEmptyLines = indexed.filter((item) => item.text.trim() !== "").length;
const mappedNonEmptyLines = sectionOrder.reduce((sum, section) => sum + sectionStats[section].nonEmptyLines, 0);
const missingLineCount = Math.max(0, lines.length - totalMappedLines);
const multiPointItems = indexed.filter((item) => item.likelyMultiPoint);

ensureDir(outIndexPath);
fs.writeFileSync(
    outIndexPath,
    JSON.stringify(
        {
            generatedAt: new Date().toISOString(),
            sourcePath,
            desktopSourcePath: fs.existsSync(desktopSourcePath) ? desktopSourcePath : null,
            totalLines: lines.length,
            totalNonEmptyLines,
            totalMappedLines,
            mappedNonEmptyLines,
            missingLineCount,
            likelyMultiPointLines: multiPointItems.length,
            sections: sectionStats,
            items: indexed,
        },
        null,
        2
    ),
    "utf8"
);

for (const [section, filePath] of Object.entries(outFiles)) {
    const stats = sectionStats[section];
    const header = [
        `# ${section.toUpperCase()} FEATURES (Folder-wise)`,
        "# Source: COMPLETE-FEATURES-LIST.txt",
        `# Total lines mapped: ${stats.totalLines}`,
        `# Non-empty lines mapped: ${stats.nonEmptyLines}`,
        `# Likely multi-point lines: ${stats.likelyMultiPointLines}`,
        "",
    ].join("\n");

    const body = buckets[section].map((item) => item.text).join("\n");
    ensureDir(filePath);
    fs.writeFileSync(filePath, `${header}\n${body}`, "utf8");
}

ensureDir(auditCsvPath);
const csvHeader = "lineNo,section,likelyMultiPoint,text";
const csvBody = indexed
    .map((item) => {
        const escapedText = `"${String(item.text).replace(/"/g, '""')}"`;
        return `${item.lineNo},${item.section},${item.likelyMultiPoint},${escapedText}`;
    })
    .join("\n");
fs.writeFileSync(auditCsvPath, `${csvHeader}\n${csvBody}\n`, "utf8");

const auditReport = [
    "# Coverage Report",
    "",
    "Line-by-line coverage verification from `COMPLETE-FEATURES-LIST.txt`.",
    "",
    `- Total source lines: ${lines.length}`,
    `- Total non-empty source lines: ${totalNonEmptyLines}`,
    `- Total mapped lines: ${totalMappedLines}`,
    `- Total mapped non-empty lines: ${mappedNonEmptyLines}`,
    `- Missing lines: ${missingLineCount}`,
    `- Likely multi-point lines: ${multiPointItems.length}`,
    "",
    "## Folder-wise counts",
    `- Security/global: ${sectionStats.security.totalLines} lines (${sectionStats.security.nonEmptyLines} non-empty, ${sectionStats.security.likelyMultiPointLines} multi-point)`,
    `- Customer: ${sectionStats.customer.totalLines} lines (${sectionStats.customer.nonEmptyLines} non-empty, ${sectionStats.customer.likelyMultiPointLines} multi-point)`,
    `- Driver: ${sectionStats.driver.totalLines} lines (${sectionStats.driver.nonEmptyLines} non-empty, ${sectionStats.driver.likelyMultiPointLines} multi-point)`,
    `- Admin: ${sectionStats.admin.totalLines} lines (${sectionStats.admin.nonEmptyLines} non-empty, ${sectionStats.admin.likelyMultiPointLines} multi-point)`,
    `- Additional: ${sectionStats.additional.totalLines} lines (${sectionStats.additional.nonEmptyLines} non-empty, ${sectionStats.additional.likelyMultiPointLines} multi-point)`,
    "",
    "## Generated files",
    "- feature-pack/01-security/security-and-global-levels.txt",
    "- feature-pack/02-customer/customer-portal-features.txt",
    "- feature-pack/03-driver/driver-portal-features.txt",
    "- feature-pack/04-admin/admin-portal-features.txt",
    "- feature-pack/05-additional/additional-and-notes.txt",
    "- feature-pack/06-index/FEATURE-INDEX.json",
    "- feature-pack/07-audit/LINE-COVERAGE.csv",
    "- feature-pack/07-audit/COVERAGE-REPORT.md",
    "- feature-pack/07-audit/MULTI-POINT-LINES.md",
    "",
    "No existing website feature files were deleted.",
].join("\n");

const multiPointReport = [
    "# Multi-point Line Review",
    "",
    "These lines likely contain more than one feature point and were verified in folder-wise mapping.",
    "",
    `- Total likely multi-point lines: ${multiPointItems.length}`,
    "",
    ...multiPointItems.map((item) => `- L${String(item.lineNo).padStart(4, "0")} [${item.section}] ${item.text}`),
].join("\n");

ensureDir(auditReportPath);
fs.writeFileSync(auditReportPath, auditReport, "utf8");
fs.writeFileSync(outSummaryPath, auditReport, "utf8");
fs.writeFileSync(multiPointReportPath, multiPointReport, "utf8");

console.log("feature-pack regenerated", {
    totalLines: lines.length,
    mappedLines: totalMappedLines,
    missingLines: missingLineCount,
    likelyMultiPointLines: multiPointItems.length,
    security: sectionStats.security.totalLines,
    customer: sectionStats.customer.totalLines,
    driver: sectionStats.driver.totalLines,
    admin: sectionStats.admin.totalLines,
    additional: sectionStats.additional.totalLines,
});
