const fs = require("fs");
const path = require("path");

const root = String.raw`C:\Users\Dhaval Gajjar\Desktop\GOindiaRIDE`;
const sourcePath = path.join(root, "feature-pack", "00-source", "COMPLETE-FEATURES-LIST.txt");
const outIndexPath = path.join(root, "feature-pack", "06-index", "FEATURE-INDEX.json");
const outSummaryPath = path.join(root, "feature-pack", "06-index", "FEATURE-SUMMARY.md");

const outFiles = {
    security: path.join(root, "feature-pack", "01-security", "security-and-global-levels.txt"),
    customer: path.join(root, "feature-pack", "02-customer", "customer-portal-features.txt"),
    driver: path.join(root, "feature-pack", "03-driver", "driver-portal-features.txt"),
    admin: path.join(root, "feature-pack", "04-admin", "admin-portal-features.txt"),
    additional: path.join(root, "feature-pack", "05-additional", "additional-and-notes.txt"),
};

const source = fs.readFileSync(sourcePath, "utf8");
const normalized = source.replace(/^\uFEFF/, "");
const lines = normalized.split(/\r?\n/);

let section = "security";
const buckets = {
    security: [],
    customer: [],
    driver: [],
    admin: [],
    additional: [],
};

const indexed = [];

function classify(line) {
    const text = line.trim().toLowerCase();

    if (text.includes("## section a")) return "customer";
    if (text.includes("## section b")) return "driver";
    if (text.includes("## section c")) return "admin";
    if (text.includes("## section d")) return "additional";

    if (text.startsWith("driver portel") || text.startsWith("customer portal") || text.startsWith("admin portal")) {
        return "additional";
    }

    return null;
}

for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const lineNo = i + 1;
    const sectionHit = classify(raw);
    if (sectionHit) {
        section = sectionHit;
    }

    const item = {
        id: `L${String(lineNo).padStart(4, "0")}`,
        lineNo,
        section,
        text: raw,
    };

    indexed.push(item);
    buckets[section].push(raw);
}

fs.writeFileSync(outIndexPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    sourcePath: sourcePath,
    totalLines: lines.length,
    sections: {
        security: buckets.security.length,
        customer: buckets.customer.length,
        driver: buckets.driver.length,
        admin: buckets.admin.length,
        additional: buckets.additional.length,
    },
    items: indexed,
}, null, 2), "utf8");

for (const [key, filePath] of Object.entries(outFiles)) {
    const header = `# ${key.toUpperCase()} FEATURES (Folder-wise)\n# Source: COMPLETE-FEATURES-LIST.txt\n# Total lines mapped: ${buckets[key].length}\n\n`;
    fs.writeFileSync(filePath, header + buckets[key].join("\n"), "utf8");
}

const summary = [
    "# Feature Pack Summary",
    "",
    "All lines from `COMPLETE-FEATURES-LIST.txt` are mapped without deleting old setup.",
    "",
    `- Total source lines: ${lines.length}`,
    `- Security/global lines: ${buckets.security.length}`,
    `- Customer lines: ${buckets.customer.length}`,
    `- Driver lines: ${buckets.driver.length}`,
    `- Admin lines: ${buckets.admin.length}`,
    `- Additional/notes lines: ${buckets.additional.length}`,
    "",
    "Generated files:",
    "- feature-pack/01-security/security-and-global-levels.txt",
    "- feature-pack/02-customer/customer-portal-features.txt",
    "- feature-pack/03-driver/driver-portal-features.txt",
    "- feature-pack/04-admin/admin-portal-features.txt",
    "- feature-pack/05-additional/additional-and-notes.txt",
    "- feature-pack/06-index/FEATURE-INDEX.json",
    "",
    "No existing project files were deleted.",
].join("\n");

fs.writeFileSync(outSummaryPath, summary, "utf8");
console.log("feature-pack generated", {
    totalLines: lines.length,
    security: buckets.security.length,
    customer: buckets.customer.length,
    driver: buckets.driver.length,
    admin: buckets.admin.length,
    additional: buckets.additional.length,
});
