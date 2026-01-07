import fs from "fs";
import path from "path";

// Load logo as base64 for email embedding
let logoBase64Data = "";
try {
  const logoPath = path.join(process.cwd(), "server/assets/logo.png");
  if (fs.existsSync(logoPath)) {
    const logoBuffer = fs.readFileSync(logoPath);
    logoBase64Data = logoBuffer.toString("base64");
  }
} catch (err) {
  console.warn("Could not load logo for emails:", err);
}

// SVG fallback for emails when image not available
export const FAIRSIGN_LOGO_SVG = `
<svg width="180" height="40" viewBox="0 0 180 40" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="4" width="24" height="32" rx="3" fill="#2563eb" stroke="#1d4ed8" stroke-width="1.5"/>
  <path d="M7 12h14M7 18h14M7 24h10" stroke="white" stroke-width="2" stroke-linecap="round"/>
  <text x="34" y="28" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="700" fill="#1a1a1a">FairSign.io</text>
</svg>
`.trim();

// Use inline PNG if available, otherwise fall back to SVG
export const FAIRSIGN_LOGO_HTML = logoBase64Data 
  ? `<img src="data:image/png;base64,${logoBase64Data}" alt="FairSign.io" style="height: 40px; width: auto;" />`
  : FAIRSIGN_LOGO_SVG;

export const FAIRSIGN_LOGO_BASE64 = Buffer.from(FAIRSIGN_LOGO_SVG).toString('base64');
