import sharp from "sharp";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "overlays");
const W = 1080, H = 1350;

function ensure(dir: string) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }
async function saveSVG(svg: string, outPath: string) {
  await sharp(Buffer.from(svg)).resize(W, H).png().toFile(outPath);
  console.log("OK " + path.basename(outPath));
}

// ─── 1. RIBBON (Sarokszalagok) ────────────────────────────────────────────────
async function cat_ribbon(dir: string) {
  const ribbons = [
    // Top-left red diagonal ribbon
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <polygon points="0,0 320,0 0,320" fill="#E53935" fill-opacity="0.95"/>
      <text transform="translate(100,160) rotate(-45)" text-anchor="middle" font-family="Arial Black,Arial" font-size="52" font-weight="900" fill="white" letter-spacing="2">AKCIÓ</text>
    </svg>`,
    // Top-right blue ribbon
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <polygon points="${W},0 ${W-320},0 ${W},320" fill="#1565C0" fill-opacity="0.95"/>
      <text transform="translate(${W-100},160) rotate(45)" text-anchor="middle" font-family="Arial Black,Arial" font-size="46" font-weight="900" fill="white" letter-spacing="2">ÚJ!</text>
    </svg>`,
    // Top-left green ribbon
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <polygon points="0,0 280,0 0,280" fill="#2E7D32" fill-opacity="0.95"/>
      <text transform="translate(82,138) rotate(-45)" text-anchor="middle" font-family="Arial Black,Arial" font-size="38" font-weight="900" fill="white">SALE</text>
    </svg>`,
    // Top-right orange starburst ribbon
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <polygon points="${W},0 ${W-260},0 ${W},260" fill="#FF6F00" fill-opacity="0.95"/>
      <text transform="translate(${W-80},128) rotate(45)" text-anchor="middle" font-family="Arial Black,Arial" font-size="32" font-weight="900" fill="white">HOT</text>
    </svg>`,
    // Double-band top-left ribbon (black + gold)
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <polygon points="0,0 340,0 0,340" fill="#212121" fill-opacity="0.9"/>
      <polygon points="0,0 300,0 0,300" fill="#FFD600" fill-opacity="0.85"/>
      <text transform="translate(88,148) rotate(-45)" text-anchor="middle" font-family="Arial Black,Arial" font-size="34" font-weight="900" fill="#212121">-30%</text>
    </svg>`,
    // Top-left purple premium ribbon
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <polygon points="0,0 360,0 0,360" fill="#6A1B9A" fill-opacity="0.93"/>
      <text transform="translate(106,180) rotate(-45)" text-anchor="middle" font-family="Arial Black,Arial" font-size="40" font-weight="900" fill="white">PRÉMIUM</text>
    </svg>`,
    // Bottom-right red ribbon
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <polygon points="${W},${H} ${W-300},${H} ${W},${H-300}" fill="#C62828" fill-opacity="0.95"/>
      <text transform="translate(${W-88},${H-148}) rotate(-45)" text-anchor="middle" font-family="Arial Black,Arial" font-size="34" font-weight="900" fill="white">VÉGE!</text>
    </svg>`,
    // Full-width diagonal stripe across center
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <polygon points="-100,${H*0.35} ${W+100},${H*0.2} ${W+100},${H*0.28} -100,${H*0.43}" fill="#E53935" fill-opacity="0.88"/>
      <text x="${W/2}" y="${H*0.39-10}" text-anchor="middle" font-family="Arial Black,Arial" font-size="54" font-weight="900" fill="white" letter-spacing="6">LEÁRAZÁS</text>
    </svg>`,
    // Top-left folded ribbon with shadow
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <polygon points="0,0 300,0 0,300" fill="#B71C1C" fill-opacity="0.92"/>
      <polygon points="0,0 300,0 260,40 0,260" fill="#E53935" fill-opacity="0.95"/>
      <text transform="translate(80,140) rotate(-45)" text-anchor="middle" font-family="Arial Black,Arial" font-size="44" font-weight="900" fill="white">50%</text>
    </svg>`,
    // Top-right turquoise ribbon
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <polygon points="${W},0 ${W-300},0 ${W},300" fill="#00897B" fill-opacity="0.95"/>
      <text transform="translate(${W-84},148) rotate(45)" text-anchor="middle" font-family="Arial Black,Arial" font-size="30" font-weight="900" fill="white">INGYENES</text>
    </svg>`,
  ];
  for (let i=0;i<ribbons.length;i++) await saveSVG(ribbons[i], path.join(dir,`ribbon-${String(i+1).padStart(2,"0")}.png`));
}

// ─── 2. STICKER (Matricák) ────────────────────────────────────────────────────
async function cat_sticker(dir: string) {
  // All stickers are positioned on a transparent 1080x1350 canvas
  const stickers = [
    // Red circle sticker top-left
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="180" cy="180" r="155" fill="#E53935" stroke="white" stroke-width="8" fill-opacity="0.96"/>
      <text x="180" y="155" text-anchor="middle" font-family="Arial Black,Arial" font-size="58" font-weight="900" fill="white">-40%</text>
      <text x="180" y="210" text-anchor="middle" font-family="Arial Black,Arial" font-size="26" font-weight="700" fill="rgba(255,255,255,0.85)">KEDVEZMÉNY</text>
    </svg>`,
    // Gold starburst sticker top-right
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <polygon points="${W-180},30 ${W-148},118 ${W-55},88 ${W-110},162 ${W-30},180 ${W-110},198 ${W-55},272 ${W-148},242 ${W-180},330 ${W-212},242 ${W-305},272 ${W-250},198 ${W-330},180 ${W-250},162 ${W-305},88 ${W-212},118" fill="#FFD600" stroke="white" stroke-width="5" fill-opacity="0.96"/>
      <text x="${W-180}" y="170" text-anchor="middle" font-family="Arial Black,Arial" font-size="44" font-weight="900" fill="#212121">ÚJ</text>
      <text x="${W-180}" y="210" text-anchor="middle" font-family="Arial Black,Arial" font-size="22" font-weight="700" fill="#212121">TERMÉK</text>
    </svg>`,
    // Green oval sticker bottom-left
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="200" cy="${H-200}" rx="180" ry="155" fill="#2E7D32" stroke="white" stroke-width="6" fill-opacity="0.96"/>
      <text x="200" y="${H-215}" text-anchor="middle" font-family="Arial Black,Arial" font-size="34" font-weight="900" fill="white">INGYENES</text>
      <text x="200" y="${H-170}" text-anchor="middle" font-family="Arial Black,Arial" font-size="30" font-weight="700" fill="white">SZÁLLÍTÁS</text>
    </svg>`,
    // Purple round sticker bottom-right
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${W-180}" cy="${H-180}" r="155" fill="#6A1B9A" stroke="white" stroke-width="8" fill-opacity="0.96"/>
      <text x="${W-180}" y="${H-195}" text-anchor="middle" font-family="Arial Black,Arial" font-size="46" font-weight="900" fill="white">LIMITÁLT</text>
      <text x="${W-180}" y="${H-148}" text-anchor="middle" font-family="Arial Black,Arial" font-size="26" font-weight="600" fill="#CE93D8">KIADÁS</text>
    </svg>`,
    // Flash sale sticker center-top
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${W/2-160}" y="30" width="320" height="110" rx="55" fill="#212121" stroke="#FFD600" stroke-width="5" fill-opacity="0.96"/>
      <text x="${W/2}" y="104" text-anchor="middle" font-family="Arial Black,Arial" font-size="48" font-weight="900" fill="#FFD600" letter-spacing="3">⚡ FLASH</text>
    </svg>`,
    // Double circle sticker (nested)
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="190" cy="190" r="172" fill="#C62828" stroke="white" stroke-width="4" fill-opacity="0.96"/>
      <circle cx="190" cy="190" r="145" fill="none" stroke="white" stroke-width="2" stroke-dasharray="8,6"/>
      <text x="190" y="168" text-anchor="middle" font-family="Arial Black,Arial" font-size="52" font-weight="900" fill="white">SALE</text>
      <text x="190" y="215" text-anchor="middle" font-family="Arial Black,Arial" font-size="28" font-weight="700" fill="rgba(255,255,255,0.85)">-30%</text>
    </svg>`,
    // Hexagon sticker
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <polygon points="${W-180},50 ${W-50},125 ${W-50},275 ${W-180},350 ${W-310},275 ${W-310},125" fill="#1565C0" stroke="white" stroke-width="6" fill-opacity="0.96"/>
      <text x="${W-180}" y="185" text-anchor="middle" font-family="Arial Black,Arial" font-size="36" font-weight="900" fill="white">BEST</text>
      <text x="${W-180}" y="228" text-anchor="middle" font-family="Arial Black,Arial" font-size="30" font-weight="700" fill="white">SELLER</text>
    </svg>`,
    // Torn/rough edge sticker circle
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <path d="M190,38 Q230,30 250,55 Q280,40 295,70 Q320,58 325,90 Q350,88 345,120 Q372,130 360,158 Q378,175 358,195 Q368,218 345,228 Q348,255 322,258 Q318,285 290,280 Q278,305 252,294 Q232,312 210,298 Q188,310 172,292 Q148,302 136,278 Q108,278 110,250 Q82,242 90,215 Q66,198 82,174 Q64,152 84,132 Q72,106 96,96 Q94,68 120,66 Q126,38 158,42 Z" fill="#FF6F00" stroke="white" stroke-width="3" fill-opacity="0.96"/>
      <text x="210" y="170" text-anchor="middle" font-family="Arial Black,Arial" font-size="50" font-weight="900" fill="white">ÚJ!</text>
    </svg>`,
    // Pill/capsule sticker
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="40" y="${H-130}" width="380" height="100" rx="50" fill="#00897B" stroke="white" stroke-width="5" fill-opacity="0.96"/>
      <text x="230" y="${H-63}" text-anchor="middle" font-family="Arial Black,Arial" font-size="38" font-weight="900" fill="white">✓ MINŐSÉG</text>
    </svg>`,
    // Star rating sticker
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${W-350}" y="${H-150}" width="330" height="120" rx="20" fill="#212121" stroke="#FFD600" stroke-width="4" fill-opacity="0.96"/>
      <text x="${W-185}" y="${H-95}" text-anchor="middle" font-family="Arial,sans-serif" font-size="36" fill="#FFD600">★★★★★</text>
      <text x="${W-185}" y="${H-55}" text-anchor="middle" font-family="Arial Black,Arial" font-size="22" font-weight="700" fill="white">5/5 Értékelés</text>
    </svg>`,
  ];
  for (let i=0;i<stickers.length;i++) await saveSVG(stickers[i], path.join(dir,`sticker-${String(i+1).padStart(2,"0")}.png`));
}

// ─── 3. BANNER (Promóciós sávok) ─────────────────────────────────────────────
async function cat_banner(dir: string) {
  const banners = [
    // Red top banner
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${W}" height="130" fill="#C62828" fill-opacity="0.95"/>
      <text x="${W/2}" y="86" text-anchor="middle" font-family="Arial Black,Arial" font-size="58" font-weight="900" fill="white" letter-spacing="4">AKCIÓ!</text>
    </svg>`,
    // Black bottom banner with gold text
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="${H-130}" width="${W}" height="130" fill="#111" fill-opacity="0.95"/>
      <text x="${W/2}" y="${H-42}" text-anchor="middle" font-family="Arial Black,Arial" font-size="52" font-weight="900" fill="#FFD600" letter-spacing="3">⚡ FLASH SALE</text>
    </svg>`,
    // Purple center band
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="${H/2-65}" width="${W}" height="130" fill="#6A1B9A" fill-opacity="0.92"/>
      <text x="${W/2}" y="${H/2+22}" text-anchor="middle" font-family="Arial Black,Arial" font-size="56" font-weight="900" fill="white" letter-spacing="5">LIMITÁLT AJÁNLAT</text>
    </svg>`,
    // Wave-edge top banner
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <path d="M0 0 L${W} 0 L${W} 100 Q${W*0.75} 140 ${W*0.5} 110 Q${W*0.25} 80 0 120 Z" fill="#E53935" fill-opacity="0.95"/>
      <text x="${W/2}" y="80" text-anchor="middle" font-family="Arial Black,Arial" font-size="54" font-weight="900" fill="white" letter-spacing="4">LEÁRAZÁS</text>
    </svg>`,
    // Wave-edge bottom banner
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <path d="M0 ${H} L${W} ${H} L${W} ${H-100} Q${W*0.75} ${H-140} ${W*0.5} ${H-110} Q${W*0.25} ${H-80} 0 ${H-120} Z" fill="#1565C0" fill-opacity="0.95"/>
      <text x="${W/2}" y="${H-46}" text-anchor="middle" font-family="Arial Black,Arial" font-size="48" font-weight="900" fill="white" letter-spacing="3">VÁSÁROLJ MOST</text>
    </svg>`,
    // Striped promotional band
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${W}" height="110" fill="#212121" fill-opacity="0.92"/>
      <rect x="0" y="14" width="${W}" height="18" fill="#FFD600" fill-opacity="0.6"/>
      <rect x="0" y="78" width="${W}" height="18" fill="#FFD600" fill-opacity="0.6"/>
      <text x="${W/2}" y="74" text-anchor="middle" font-family="Arial Black,Arial" font-size="48" font-weight="900" fill="white" letter-spacing="6">BEST DEAL</text>
    </svg>`,
    // Top + bottom double banner
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${W}" height="90" fill="#B71C1C" fill-opacity="0.93"/>
      <text x="${W/2}" y="60" text-anchor="middle" font-family="Arial Black,Arial" font-size="44" font-weight="900" fill="white" letter-spacing="4">🔥 AKCIÓ 🔥</text>
      <rect x="0" y="${H-90}" width="${W}" height="90" fill="#B71C1C" fill-opacity="0.93"/>
      <text x="${W/2}" y="${H-28}" text-anchor="middle" font-family="Arial,sans-serif" font-size="32" font-weight="700" fill="white">Korlátozott ideig!</text>
    </svg>`,
    // Angled ribbon across width
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <polygon points="-60,${H*0.28} ${W+60},${H*0.18} ${W+60},${H*0.28} -60,${H*0.38}" fill="#E53935" fill-opacity="0.92"/>
      <text x="${W/2}" y="${H*0.33-2}" text-anchor="middle" font-family="Arial Black,Arial" font-size="50" font-weight="900" fill="white" letter-spacing="5">NYÁRI AKCIÓ</text>
    </svg>`,
    // Green bottom free shipping banner
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="${H-100}" width="${W}" height="100" fill="#2E7D32" fill-opacity="0.95"/>
      <text x="${W/2}" y="${H-34}" text-anchor="middle" font-family="Arial Black,Arial" font-size="44" font-weight="900" fill="white">🚚 INGYENES SZÁLLÍTÁS</text>
    </svg>`,
    // Teal limited-time top banner
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${W}" height="100" fill="#00695C" fill-opacity="0.95"/>
      <text x="${W/2}" y="64" text-anchor="middle" font-family="Arial Black,Arial" font-size="42" font-weight="900" fill="white" letter-spacing="3">⏰ CSAK MA!</text>
    </svg>`,
  ];
  for (let i=0;i<banners.length;i++) await saveSVG(banners[i], path.join(dir,`banner-${String(i+1).padStart(2,"0")}.png`));
}

// ─── 4. LABEL (Árcédulák / Tagek) ────────────────────────────────────────────
async function cat_label(dir: string) {
  const labels = [
    // Hanging price tag top-right
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <line x1="${W-200}" y1="0" x2="${W-200}" y2="60" stroke="white" stroke-width="3" stroke-dasharray="6,4"/>
      <circle cx="${W-200}" cy="75" r="12" fill="white" fill-opacity="0.9"/>
      <rect x="${W-320}" y="88" width="240" height="150" rx="12" fill="white" fill-opacity="0.95"/>
      <polygon points="${W-200},238 ${W-240},268 ${W-200},258 ${W-160},268" fill="white" fill-opacity="0.95"/>
      <text x="${W-200}" y="148" text-anchor="middle" font-family="Arial Black,Arial" font-size="40" font-weight="900" fill="#E53935">-25%</text>
      <text x="${W-200}" y="188" text-anchor="middle" font-family="Arial,sans-serif" font-size="22" font-weight="600" fill="#333">KEDVEZMÉNY</text>
    </svg>`,
    // Ticket/coupon left
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="20" y="${H/2-80}" width="340" height="160" rx="12" fill="#E53935" fill-opacity="0.95"/>
      <circle cx="20" cy="${H/2-40}" r="18" fill="var(--bg,#0d0d0d)"/>
      <circle cx="20" cy="${H/2+40}" r="18" fill="var(--bg,#0d0d0d)"/>
      <line x1="100" y1="${H/2-60}" x2="100" y2="${H/2+60}" stroke="white" stroke-width="2" stroke-dasharray="8,5"/>
      <text x="230" y="${H/2-10}" text-anchor="middle" font-family="Arial Black,Arial" font-size="44" font-weight="900" fill="white">30%</text>
      <text x="230" y="${H/2+38}" text-anchor="middle" font-family="Arial,sans-serif" font-size="20" font-weight="700" fill="rgba(255,255,255,0.85)">KUPON</text>
    </svg>`,
    // Folded corner label top-left
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <polygon points="0,0 260,0 0,260" fill="#1565C0" fill-opacity="0.96"/>
      <polygon points="0,260 40,220 220,40 260,0 220,0 0,220" fill="#1976D2" fill-opacity="0.5"/>
      <text transform="translate(72,128) rotate(-45)" text-anchor="middle" font-family="Arial Black,Arial" font-size="34" font-weight="900" fill="white">BESTSELLER</text>
    </svg>`,
    // Stamp/seal label
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${W-190}" cy="${H-190}" r="155" fill="none" stroke="#E53935" stroke-width="14" stroke-opacity="0.9"/>
      <circle cx="${W-190}" cy="${H-190}" r="130" fill="#E53935" stroke="white" stroke-width="4" fill-opacity="0.92"/>
      <text x="${W-190}" y="${H-210}" text-anchor="middle" font-family="Arial Black,Arial" font-size="34" font-weight="900" fill="white">GARANTÁLT</text>
      <text x="${W-190}" y="${H-168}" text-anchor="middle" font-family="Arial Black,Arial" font-size="28" font-weight="700" fill="white">MINŐSÉG</text>
      <text x="${W-190}" y="${H-130}" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" fill="rgba(255,255,255,0.8)">★ ★ ★ ★ ★</text>
    </svg>`,
    // Arrow label right side
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <polygon points="${W},${H/2-55} ${W-260},${H/2-55} ${W-300},${H/2} ${W-260},${H/2+55} ${W},${H/2+55}" fill="#FF6F00" fill-opacity="0.96"/>
      <text x="${W-148}" y="${H/2+14}" text-anchor="middle" font-family="Arial Black,Arial" font-size="38" font-weight="900" fill="white">ÚJ!</text>
    </svg>`,
    // Circular dotted border label center
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${W/2}" cy="220" r="185" fill="#6A1B9A" stroke="white" stroke-width="5" stroke-dasharray="14,8" fill-opacity="0.92"/>
      <text x="${W/2}" y="195" text-anchor="middle" font-family="Arial Black,Arial" font-size="48" font-weight="900" fill="white">PRÉMIUM</text>
      <text x="${W/2}" y="248" text-anchor="middle" font-family="Arial Black,Arial" font-size="32" font-weight="700" fill="#CE93D8">MINŐSÉG</text>
    </svg>`,
    // Small tag top-left (like a clothing tag)
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <line x1="90" y1="0" x2="90" y2="36" stroke="#888" stroke-width="3"/>
      <rect x="20" y="36" width="140" height="180" rx="8" fill="#fff" fill-opacity="0.97"/>
      <rect x="20" y="36" width="140" height="40" rx="8" fill="#E53935" fill-opacity="0.97"/>
      <text x="90" y="67" text-anchor="middle" font-family="Arial Black,Arial" font-size="22" font-weight="900" fill="white">AKCIÓ</text>
      <text x="90" y="138" text-anchor="middle" font-family="Arial Black,Arial" font-size="42" font-weight="900" fill="#E53935">-50%</text>
      <text x="90" y="185" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" fill="#555">LEÁRAZVA</text>
    </svg>`,
    // Explosion/burst badge center
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <path d="M${W/2},${H-380} L${W/2+50},${H-300} L${W/2+140},${H-330} L${W/2+100},${H-240} L${W/2+180},${H-200} L${W/2+90},${H-150} L${W/2+130},${H-60} L${W/2},${H-90} L${W/2-130},${H-60} L${W/2-90},${H-150} L${W/2-180},${H-200} L${W/2-100},${H-240} L${W/2-140},${H-330} L${W/2-50},${H-300} Z" fill="#FFD600" fill-opacity="0.96"/>
      <text x="${W/2}" y="${H-220}" text-anchor="middle" font-family="Arial Black,Arial" font-size="44" font-weight="900" fill="#212121">AKCIÓ!</text>
      <text x="${W/2}" y="${H-170}" text-anchor="middle" font-family="Arial Black,Arial" font-size="36" font-weight="700" fill="#E53935">-40%</text>
    </svg>`,
    // Product quality seal
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="190" cy="${H-190}" r="160" fill="#1B5E20" stroke="white" stroke-width="6" fill-opacity="0.94"/>
      <circle cx="190" cy="${H-190}" r="135" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="2"/>
      <text x="190" y="${H-230}" text-anchor="middle" font-family="Arial Black,Arial" font-size="28" font-weight="900" fill="white">MAGYAR</text>
      <text x="190" y="${H-192}" text-anchor="middle" font-family="Arial Black,Arial" font-size="28" font-weight="900" fill="white">TERMÉK</text>
      <text x="190" y="${H-152}" text-anchor="middle" font-family="Arial,sans-serif" font-size="20" fill="rgba(255,255,255,0.8)">🇭🇺 Garantált</text>
    </svg>`,
    // Limited time diagonal band label
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${W-280}" y="0" width="280" height="200" fill="#B71C1C" fill-opacity="0.94"/>
      <line x1="${W-280}" y1="0" x2="${W-280}" y2="200" stroke="white" stroke-width="3"/>
      <text x="${W-140}" y="80" text-anchor="middle" font-family="Arial Black,Arial" font-size="30" font-weight="900" fill="white">KORLÁTOZOTT</text>
      <text x="${W-140}" y="120" text-anchor="middle" font-family="Arial Black,Arial" font-size="28" font-weight="900" fill="#FFD600">IDEIG</text>
      <text x="${W-140}" y="162" text-anchor="middle" font-family="Arial,sans-serif" font-size="22" fill="rgba(255,255,255,0.85)">⏰ Sietős!</text>
    </svg>`,
  ];
  for (let i=0;i<labels.length;i++) await saveSVG(labels[i], path.join(dir,`label-${String(i+1).padStart(2,"0")}.png`));
}

// ─── 5. FRAME_DECO (Díszítő keretek) ─────────────────────────────────────────
async function cat_frame_deco(dir: string) {
  const P = 40; // padding
  const frames = [
    // Polaroid frame (white border, thick bottom)
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${W}" height="${H}" fill="white" fill-opacity="0.96"/>
      <rect x="${P}" y="${P}" width="${W-P*2}" height="${H-P*3-140}" fill="none"/>
      <rect x="0" y="0" width="${P}" height="${H}" fill="white" fill-opacity="0.96"/>
      <rect x="${W-P}" y="0" width="${P}" height="${H}" fill="white" fill-opacity="0.96"/>
      <rect x="0" y="0" width="${W}" height="${P}" fill="white" fill-opacity="0.96"/>
      <rect x="0" y="${H-P*3-100}" width="${W}" height="${P*3+100}" fill="white" fill-opacity="0.96"/>
    </svg>`,
    // Dark luxury border
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="#111" stroke-width="50"/>
      <rect x="35" y="35" width="${W-70}" height="${H-70}" fill="none" stroke="#gold" stroke-width="2" stroke-opacity="0"/>
      <rect x="50" y="50" width="${W-100}" height="${H-100}" fill="none" stroke="#FFD600" stroke-width="1.5" stroke-opacity="0.7"/>
    </svg>`,
    // Corner ornaments (floral style)
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <g fill="none" stroke="white" stroke-width="4" stroke-opacity="0.9">
        <path d="M30,30 Q80,30 80,80"/>
        <path d="M30,30 Q30,80 80,80"/>
        <circle cx="30" cy="30" r="8" fill="white"/>
        <circle cx="80" cy="30" r="4" fill="white"/>
        <circle cx="30" cy="80" r="4" fill="white"/>
        <path d="M${W-30},30 Q${W-80},30 ${W-80},80"/>
        <path d="M${W-30},30 Q${W-30},80 ${W-80},80"/>
        <circle cx="${W-30}" cy="30" r="8" fill="white"/>
        <path d="M30,${H-30} Q80,${H-30} 80,${H-80}"/>
        <path d="M30,${H-30} Q30,${H-80} 80,${H-80}"/>
        <circle cx="30" cy="${H-30}" r="8" fill="white"/>
        <path d="M${W-30},${H-30} Q${W-80},${H-30} ${W-80},${H-80}"/>
        <path d="M${W-30},${H-30} Q${W-30},${H-80} ${W-80},${H-80}"/>
        <circle cx="${W-30}" cy="${H-30}" r="8" fill="white"/>
      </g>
    </svg>`,
    // Triple border frame
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="12" y="12" width="${W-24}" height="${H-24}" fill="none" stroke="white" stroke-width="5" stroke-opacity="0.9"/>
      <rect x="28" y="28" width="${W-56}" height="${H-56}" fill="none" stroke="white" stroke-width="1.5" stroke-opacity="0.5"/>
      <rect x="40" y="40" width="${W-80}" height="${H-80}" fill="none" stroke="white" stroke-width="3" stroke-opacity="0.8"/>
    </svg>`,
    // Film strip frame (cinema)
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${W}" height="80" fill="#111" fill-opacity="0.9"/>
      <rect x="0" y="${H-80}" width="${W}" height="80" fill="#111" fill-opacity="0.9"/>
      ${Array.from({length:12},(_, i)=>`<rect x="${60+i*80}" y="14" width="44" height="52" rx="5" fill="none" stroke="white" stroke-width="2" stroke-opacity="0.8"/>`).join("")}
      ${Array.from({length:12},(_, i)=>`<rect x="${60+i*80}" y="${H-66}" width="44" height="52" rx="5" fill="none" stroke="white" stroke-width="2" stroke-opacity="0.8"/>`).join("")}
    </svg>`,
    // Torn paper edge frame
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <path d="M0,0 L${W},0 L${W},60 Q${W*0.9},80 ${W*0.8},60 Q${W*0.7},40 ${W*0.6},65 Q${W*0.5},85 ${W*0.4},62 Q${W*0.3},42 ${W*0.2},68 Q${W*0.1},88 0,60 Z" fill="white" fill-opacity="0.95"/>
      <path d="M0,${H} L${W},${H} L${W},${H-60} Q${W*0.9},${H-80} ${W*0.8},${H-60} Q${W*0.7},${H-40} ${W*0.6},${H-65} Q${W*0.5},${H-85} ${W*0.4},${H-62} Q${W*0.3},${H-42} ${W*0.2},${H-68} Q${W*0.1},${H-88} 0,${H-60} Z" fill="white" fill-opacity="0.95"/>
    </svg>`,
    // Rounded white photo frame
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${W}" height="${H}" rx="40" fill="none" stroke="white" stroke-width="55"/>
    </svg>`,
    // Gold ornate corners
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="20" y="20" width="${W-40}" height="${H-40}" fill="none" stroke="#FFD600" stroke-width="3" stroke-opacity="0.8"/>
      <rect x="32" y="32" width="${W-64}" height="${H-64}" fill="none" stroke="#FFD600" stroke-width="1" stroke-opacity="0.4"/>
      <g fill="#FFD600" fill-opacity="0.9">
        <rect x="15" y="15" width="80" height="6"/><rect x="15" y="15" width="6" height="80"/>
        <rect x="${W-95}" y="15" width="80" height="6"/><rect x="${W-21}" y="15" width="6" height="80"/>
        <rect x="15" y="${H-21}" width="80" height="6"/><rect x="15" y="${H-95}" width="6" height="80"/>
        <rect x="${W-95}" y="${H-21}" width="80" height="6"/><rect x="${W-21}" y="${H-95}" width="6" height="80"/>
      </g>
    </svg>`,
    // Watercolor-style soft border (SVG filter)
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs><filter id="rough"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="4" seed="2"/><feDisplacementMap in="SourceGraphic" scale="12"/></filter></defs>
      <rect x="25" y="25" width="${W-50}" height="${H-50}" fill="none" stroke="white" stroke-width="40" stroke-opacity="0.7" filter="url(#rough)"/>
    </svg>`,
    // Scalloped/wavy edge frame
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <path d="M50,50 L${W-50},50 L${W-50},${H-50} L50,${H-50} Z" fill="none" stroke="white" stroke-width="4" stroke-opacity="0.85" stroke-dasharray="16,10"/>
      <path d="M24,24 L${W-24},24 L${W-24},${H-24} L24,${H-24} Z" fill="none" stroke="white" stroke-width="2" stroke-opacity="0.5"/>
    </svg>`,
  ];
  for (let i=0;i<frames.length;i++) await saveSVG(frames[i], path.join(dir,`frame_deco-${String(i+1).padStart(2,"0")}.png`));
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  const newCats = [
    {id:"ribbon",    label:"Szalag (Ribbon)",    fn:cat_ribbon},
    {id:"sticker",   label:"Matrica (Sticker)",  fn:cat_sticker},
    {id:"banner",    label:"Promósáv (Banner)",  fn:cat_banner},
    {id:"label",     label:"Árcédula (Label)",   fn:cat_label},
    {id:"frame_deco",label:"Díszítő Keret",      fn:cat_frame_deco},
  ];

  ensure(OUT_DIR);

  for (const cat of newCats) {
    const d=path.join(OUT_DIR,cat.id); ensure(d);
    console.log("\n["+cat.label+"]");
    await cat.fn(d);
  }

  // Rebuild full manifest (include existing geoframe + badge)
  const allCats = [
    {id:"geoframe",   label:"Geometrikus Keret"},
    {id:"badge",      label:"Sale Badge"},
    {id:"ribbon",     label:"Szalag (Ribbon)"},
    {id:"sticker",    label:"Matrica (Sticker)"},
    {id:"banner",     label:"Promósáv (Banner)"},
    {id:"label",      label:"Árcédula (Label)"},
    {id:"frame_deco", label:"Díszítő Keret"},
  ];

  const manifest: Record<string,{id:string;label:string;files:string[]}> = {};
  for (const cat of allCats) {
    const d=path.join(OUT_DIR,cat.id);
    if (!fs.existsSync(d)) continue;
    manifest[cat.id]={id:cat.id,label:cat.label,files:fs.readdirSync(d).filter(f=>f.endsWith(".png")).sort().map(f=>`/overlays/${cat.id}/${f}`)};
  }
  require; // unused import guard
  const { writeFileSync } = await import("fs");
  writeFileSync(path.join(OUT_DIR,"manifest.json"),JSON.stringify(manifest,null,2));
  console.log("\nDone! manifest.json updated.");
}
main().catch(console.error);
