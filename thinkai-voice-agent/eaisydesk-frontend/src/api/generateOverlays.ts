/**
 * generateOverlays.ts — Generates 10 transparent PNG overlays per category × 10 categories
 * Run: npx tsx src/generateOverlays.ts
 */
import sharp from "sharp";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "overlays");
const W = 1080, H = 1350;

function clamp(v: number) { return Math.max(0, Math.min(255, Math.round(v))); }
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => t * t * (3 - 2 * t);
function ensure(dir: string) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }

async function buildOverlay(fn: (x: number, y: number) => [number,number,number,number], outPath: string) {
  const buf = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const [r,g,b,a] = fn(x,y); const i = (y*W+x)*4;
      buf[i]=clamp(r); buf[i+1]=clamp(g); buf[i+2]=clamp(b); buf[i+3]=clamp(a);
    }
  await sharp(buf, { raw: { width: W, height: H, channels: 4 } }).png().toFile(outPath);
  console.log("OK " + path.basename(outPath));
}

async function saveSVG(svg: string, outPath: string) {
  await sharp(Buffer.from(svg)).resize(W,H).png().toFile(outPath);
  console.log("OK " + path.basename(outPath));
}

// ── 1. VIGNETTE
async function cat_vignette(dir: string) {
  const cfgs = [
    { c:[0,0,0] as [number,number,number], s:0.55, soft:0.5 },
    { c:[0,0,0] as [number,number,number], s:0.75, soft:0.3 },
    { c:[0,0,0] as [number,number,number], s:0.35, soft:0.7 },
    { c:[20,5,40] as [number,number,number], s:0.6, soft:0.4 },
    { c:[0,10,30] as [number,number,number], s:0.65, soft:0.4 },
    { c:[30,10,0] as [number,number,number], s:0.55, soft:0.5 },
    { c:[255,255,255] as [number,number,number], s:0.5, soft:0.4 },
    { c:[255,240,200] as [number,number,number], s:0.45, soft:0.5 },
    { c:[0,0,0] as [number,number,number], s:0.5, soft:0.6, topB:0.8, botB:0.2 },
    { c:[0,0,0] as [number,number,number], s:0.5, soft:0.6, topB:0.2, botB:0.8 },
  ];
  for (let i=0;i<cfgs.length;i++) {
    const c=cfgs[i]; const [cr,cg,cb]=c.c;
    await buildOverlay((x,y) => {
      const dx=(x-W/2)/(W/2), dy=(y-H/2)/(H/2);
      let dist=Math.sqrt(dx*dx+dy*dy);
      if (c.topB) dist=Math.max(dist, c.topB*(1-y/H), c.botB*(y/H));
      const t=Math.pow(Math.min(1,(dist-c.soft)/(1-c.soft+0.001)),2);
      return [cr,cg,cb, Math.max(0,t*c.s*255)];
    }, path.join(dir,`vignette-${String(i+1).padStart(2,"0")}.png`));
  }
}

// ── 2. LIGHT LEAK
async function cat_lightleak(dir: string) {
  const cfgs = [
    { bands: [{x:0.1,y:0.05,r:255,g:200,b:80,rad:0.5,op:0.55}] },
    { bands: [{x:0.9,y:0.05,r:80,g:220,b:255,rad:0.45,op:0.5}] },
    { bands: [{x:0.95,y:0.8,r:255,g:80,b:200,rad:0.5,op:0.5}] },
    { bands: [{x:0.05,y:0.1,r:255,g:180,b:60,rad:0.45,op:0.45},{x:0.9,y:0.9,r:60,g:160,b:255,rad:0.45,op:0.4}] },
    { bands: [{x:0.5,y:-0.1,r:255,g:100,b:30,rad:0.6,op:0.45}] },
    { bands: [{x:-0.1,y:0.5,r:190,g:130,b:255,rad:0.5,op:0.5}] },
    { bands: [{x:0.1,y:1.0,r:60,g:220,b:160,rad:0.55,op:0.45}] },
    { bands: [{x:0.05,y:0.05,r:255,g:210,b:80,rad:0.4,op:0.4},{x:0.5,y:0.0,r:255,g:80,b:100,rad:0.35,op:0.3},{x:0.95,y:0.05,r:80,g:200,b:255,rad:0.4,op:0.38}] },
    { bands: [{x:0.5,y:1.1,r:200,g:30,b:30,rad:0.6,op:0.45}] },
    { bands: [{x:0.0,y:0.0,r:255,g:180,b:60,rad:0.55,op:0.3},{x:1.0,y:0.0,r:60,g:180,b:255,rad:0.55,op:0.3},{x:0.0,y:1.0,r:255,g:60,b:180,rad:0.55,op:0.3},{x:1.0,y:1.0,r:60,g:255,b:120,rad:0.55,op:0.3}] },
  ];
  for (let i=0;i<cfgs.length;i++) {
    const bands=cfgs[i].bands;
    await buildOverlay((x,y) => {
      let r=0,g=0,b=0,a=0;
      for (const bd of bands) {
        const dx=x/W-bd.x, dy=y/H-bd.y;
        const dist=Math.sqrt(dx*dx+dy*dy);
        const fade=ease(Math.max(0,1-dist/bd.rad))*bd.op;
        r+=bd.r*fade; g+=bd.g*fade; b+=bd.b*fade; a+=fade*255;
      }
      return [Math.min(255,r),Math.min(255,g),Math.min(255,b),Math.min(255,a)];
    }, path.join(dir,`lightleak-${String(i+1).padStart(2,"0")}.png`));
  }
}

// ── 3. GRADIENT SWEEP
async function cat_gradient(dir: string) {
  const cfgs: { cols:[number,number,number,number][]; stops:number[]; dir:string }[] = [
    { cols:[[0,0,0,0],[0,0,0,220]], stops:[0,1], dir:"v" },
    { cols:[[0,0,0,200],[0,0,0,0]], stops:[0,1], dir:"v" },
    { cols:[[0,0,0,0],[80,20,140,200]], stops:[0,1], dir:"v" },
    { cols:[[0,0,0,0],[180,80,20,200]], stops:[0,1], dir:"v" },
    { cols:[[20,80,180,0],[0,160,200,180]], stops:[0,1], dir:"d" },
    { cols:[[0,0,0,0],[200,40,100,190]], stops:[0,1], dir:"r" },
    { cols:[[100,20,180,160],[200,100,20,0],[200,100,20,0]], stops:[0,0.5,1], dir:"h" },
    { cols:[[0,0,0,0],[0,180,200,180]], stops:[0,1], dir:"d" },
    { cols:[[255,255,255,200],[255,255,255,0]], stops:[0,1], dir:"v" },
    { cols:[[10,15,50,200],[10,15,50,0]], stops:[0,1], dir:"v" },
  ];
  for (let i=0;i<cfgs.length;i++) {
    const c=cfgs[i];
    await buildOverlay((x,y) => {
      let t: number;
      if (c.dir==="v") t=y/H;
      else if (c.dir==="h") t=x/W;
      else if (c.dir==="d") t=(x/W+y/H)/2;
      else t=Math.sqrt((x/W)**2+(y/H)**2)/Math.SQRT2;
      const n=c.stops.length; let seg=n-2;
      for (let s=0;s<n-1;s++) if(t<=c.stops[s+1]){seg=s;break;}
      const lt=(t-c.stops[seg])/(c.stops[seg+1]-c.stops[seg]+0.0001);
      const [a0,a1]=[c.cols[seg],c.cols[seg+1]];
      return [lerp(a0[0],a1[0],lt),lerp(a0[1],a1[1],lt),lerp(a0[2],a1[2],lt),lerp(a0[3],a1[3],lt)];
    }, path.join(dir,`gradient-${String(i+1).padStart(2,"0")}.png`));
  }
}

// ── 4. FILM GRAIN
async function cat_grain(dir: string) {
  const cfgs = [
    {s:40,c:[128,128,128] as [number,number,number],op:0.18},{s:70,c:[128,128,128] as [number,number,number],op:0.22},
    {s:40,c:[200,170,120] as [number,number,number],op:0.20},{s:40,c:[120,150,190] as [number,number,number],op:0.18},
    {s:60,c:[80,60,30] as [number,number,number],op:0.25},{s:35,c:[220,210,190] as [number,number,number],op:0.15},
    {s:80,c:[50,50,50] as [number,number,number],op:0.3},{s:45,c:[160,200,160] as [number,number,number],op:0.17},
    {s:50,c:[180,120,150] as [number,number,number],op:0.2},{s:30,c:[200,200,220] as [number,number,number],op:0.12},
  ];
  for (let i=0;i<cfgs.length;i++) {
    const c=cfgs[i]; const [cr,cg,cb]=c.c;
    let rng=42+i*31337;
    const rand=()=>{rng=(rng*1664525+1013904223)&0xffffffff;return(rng>>>0)/4294967296;};
    const buf=Buffer.alloc(W*H*4);
    for (let j=0;j<W*H;j++) {
      const n=(rand()-0.5)*2*c.s;
      buf[j*4]=clamp(cr+n); buf[j*4+1]=clamp(cg+n); buf[j*4+2]=clamp(cb+n); buf[j*4+3]=clamp(c.op*255);
    }
    await sharp(buf,{raw:{width:W,height:H,channels:4}}).png().toFile(path.join(dir,`grain-${String(i+1).padStart(2,"0")}.png`));
    console.log("OK grain-"+String(i+1).padStart(2,"0")+".png");
  }
}

// ── 5. GEO FRAME
async function cat_geoframe(dir: string) {
  const svgs = [
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect x="30" y="30" width="${W-60}" height="${H-60}" fill="none" stroke="white" stroke-width="4" stroke-opacity="0.85"/></svg>`,
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect x="20" y="20" width="${W-40}" height="${H-40}" fill="none" stroke="white" stroke-width="3" stroke-opacity="0.8"/><rect x="36" y="36" width="${W-72}" height="${H-72}" fill="none" stroke="white" stroke-width="1.5" stroke-opacity="0.6"/></svg>`,
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><g stroke="white" stroke-width="5" fill="none" stroke-opacity="0.9"><line x1="30" y1="30" x2="130" y2="30"/><line x1="30" y1="30" x2="30" y2="130"/><line x1="${W-30}" y1="30" x2="${W-130}" y2="30"/><line x1="${W-30}" y1="30" x2="${W-30}" y2="130"/><line x1="30" y1="${H-30}" x2="130" y2="${H-30}"/><line x1="30" y1="${H-30}" x2="30" y2="${H-130}"/><line x1="${W-30}" y1="${H-30}" x2="${W-130}" y2="${H-30}"/><line x1="${W-30}" y1="${H-30}" x2="${W-30}" y2="${H-130}"/></g></svg>`,
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${W}" height="8" fill="white" fill-opacity="0.75"/><rect x="0" y="${H-8}" width="${W}" height="8" fill="white" fill-opacity="0.75"/></svg>`,
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect x="24" y="24" width="${W-48}" height="${H-48}" rx="32" ry="32" fill="none" stroke="white" stroke-width="4" stroke-opacity="0.8"/></svg>`,
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${W}" height="120" fill="black" fill-opacity="0.6"/><rect x="0" y="${H-120}" width="${W}" height="120" fill="black" fill-opacity="0.6"/></svg>`,
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="80" height="${H}" fill="black" fill-opacity="0.4"/><rect x="${W-80}" y="0" width="80" height="${H}" fill="black" fill-opacity="0.4"/></svg>`,
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect x="30" y="30" width="${W-60}" height="${H-60}" fill="none" stroke="white" stroke-width="3" stroke-dasharray="20,12" stroke-opacity="0.75"/></svg>`,
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><line x1="0" y1="0" x2="${W}" y2="${H}" stroke="white" stroke-width="1.5" stroke-opacity="0.12"/><line x1="${W}" y1="0" x2="0" y2="${H}" stroke="white" stroke-width="1.5" stroke-opacity="0.12"/><rect x="24" y="24" width="${W-48}" height="${H-48}" fill="none" stroke="white" stroke-width="3" stroke-opacity="0.7"/></svg>`,
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><polygon points="${W/2},30 ${W-30},${H/4} ${W-30},${H*3/4} ${W/2},${H-30} 30,${H*3/4} 30,${H/4}" fill="none" stroke="white" stroke-width="3" stroke-opacity="0.7"/></svg>`,
  ];
  for (let i=0;i<svgs.length;i++) await saveSVG(svgs[i], path.join(dir,`geoframe-${String(i+1).padStart(2,"0")}.png`));
}

// ── 6. BOKEH
async function cat_bokeh(dir: string) {
  const cfgs: {c:[number,number,number];n:number;sMin:number;sMax:number;oMin:number;oMax:number}[] = [
    {c:[255,220,100],n:60,sMin:20,sMax:80,oMin:0.1,oMax:0.4},
    {c:[150,200,255],n:80,sMin:15,sMax:60,oMin:0.1,oMax:0.35},
    {c:[255,150,200],n:70,sMin:20,sMax:70,oMin:0.1,oMax:0.38},
    {c:[200,255,180],n:60,sMin:15,sMax:55,oMin:0.08,oMax:0.3},
    {c:[220,180,255],n:65,sMin:20,sMax:75,oMin:0.1,oMax:0.35},
    {c:[255,255,255],n:90,sMin:10,sMax:50,oMin:0.1,oMax:0.45},
    {c:[255,180,80],n:50,sMin:30,sMax:100,oMin:0.08,oMax:0.3},
    {c:[80,220,255],n:75,sMin:12,sMax:45,oMin:0.1,oMax:0.4},
    {c:[255,100,100],n:60,sMin:20,sMax:65,oMin:0.1,oMax:0.35},
    {c:[180,255,230],n:70,sMin:15,sMax:55,oMin:0.08,oMax:0.32},
  ];
  for (let idx=0;idx<cfgs.length;idx++) {
    const c=cfgs[idx]; const [cr,cg,cb]=c.c;
    const buf=Buffer.alloc(W*H*4,0);
    let rng=1337+idx*99991;
    const rand=()=>{rng=(rng*1664525+1013904223)&0xffffffff;return(rng>>>0)/4294967296;};
    for (let p=0;p<c.n;p++) {
      const px=Math.floor(rand()*W), py=Math.floor(rand()*H);
      const r=c.sMin+rand()*(c.sMax-c.sMin);
      const alpha=c.oMin+rand()*(c.oMax-c.oMin);
      const ri=Math.ceil(r);
      for (let dy=-ri;dy<=ri;dy++) for (let dx=-ri;dx<=ri;dx++) {
        const dist=Math.sqrt(dx*dx+dy*dy); if(dist>r) continue;
        const nx=px+dx,ny=py+dy; if(nx<0||ny<0||nx>=W||ny>=H) continue;
        const fade=(1-dist/r)*alpha;
        const j=(ny*W+nx)*4;
        buf[j]=clamp(cr); buf[j+1]=clamp(cg); buf[j+2]=clamp(cb);
        buf[j+3]=clamp(Math.min(255,buf[j+3]+fade*255));
      }
    }
    await sharp(buf,{raw:{width:W,height:H,channels:4}}).png().toFile(path.join(dir,`bokeh-${String(idx+1).padStart(2,"0")}.png`));
    console.log("OK bokeh-"+String(idx+1).padStart(2,"0")+".png");
  }
}

// ── 7. BADGE
async function cat_badge(dir: string) {
  const badges = [
    {svg:`<svg width="240" height="240" xmlns="http://www.w3.org/2000/svg"><circle cx="120" cy="120" r="115" fill="#E53935"/><text x="120" y="110" text-anchor="middle" font-family="Arial Black,Arial" font-size="52" font-weight="900" fill="white">SALE</text><text x="120" y="158" text-anchor="middle" font-family="Arial Black,Arial" font-size="30" font-weight="700" fill="white">-30%</text></svg>`,x:30,y:30},
    {svg:`<svg width="280" height="90" xmlns="http://www.w3.org/2000/svg"><rect width="280" height="90" rx="45" fill="#1565C0" opacity="0.92"/><text x="140" y="60" text-anchor="middle" font-family="Arial Black,Arial" font-size="30" font-weight="900" fill="white">BESTSELLER</text></svg>`,x:(W-280)>>1,y:60},
    {svg:`<svg width="${W}" height="140" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="140" fill="#C62828" fill-opacity="0.92"/><text x="${W>>1}" y="90" text-anchor="middle" font-family="Arial Black,Arial" font-size="56" font-weight="900" fill="white" letter-spacing="4">AKCIÓ</text></svg>`,x:0,y:0},
    {svg:`<svg width="220" height="220" xmlns="http://www.w3.org/2000/svg"><circle cx="110" cy="110" r="105" fill="none" stroke="white" stroke-width="6"/><circle cx="110" cy="110" r="92" fill="rgba(0,0,0,0.65)"/><text x="110" y="95" text-anchor="middle" font-family="Arial Black,Arial" font-size="28" font-weight="900" fill="white">LIMITÁLT</text><text x="110" y="130" text-anchor="middle" font-family="Arial Black,Arial" font-size="22" font-weight="700" fill="#FFD600">KIADÁS</text></svg>`,x:W-250,y:H-250},
    {svg:`<svg width="${W}" height="140" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="140" fill="#212121" opacity="0.9"/><text x="${W>>1}" y="90" text-anchor="middle" font-family="Arial Black,Arial" font-size="52" font-weight="900" fill="#FFD600" letter-spacing="3">FLASH SALE</text></svg>`,x:0,y:H-140},
    {svg:`<svg width="160" height="60" xmlns="http://www.w3.org/2000/svg"><rect width="160" height="60" fill="#2E7D32" opacity="0.93"/><text x="80" y="42" text-anchor="middle" font-family="Arial Black,Arial" font-size="32" font-weight="900" fill="white">ÚJ!</text></svg>`,x:W-164,y:0},
    {svg:`<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg"><circle cx="100" cy="100" r="96" fill="#6A1B9A" opacity="0.93"/><text x="100" y="80" text-anchor="middle" font-family="Arial Black,Arial" font-size="40" font-weight="900" fill="white">-50%</text><text x="100" y="118" text-anchor="middle" font-family="Arial Black,Arial" font-size="20" font-weight="600" fill="#CE93D8">KEDVEZMÉNY</text></svg>`,x:30,y:H-230},
    {svg:`<svg width="${W}" height="80" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="80" fill="#B71C1C" opacity="0.9"/><text x="${W>>1}" y="53" text-anchor="middle" font-family="Arial,sans-serif" font-size="30" font-weight="700" fill="white" letter-spacing="2">KORLÁTOZOTT IDEIG</text></svg>`,x:0,y:(H-80)>>1},
    {svg:`<svg width="280" height="80" xmlns="http://www.w3.org/2000/svg"><rect width="280" height="80" rx="8" fill="#00897B" opacity="0.93"/><text x="140" y="52" text-anchor="middle" font-family="Arial Black,Arial" font-size="22" font-weight="900" fill="white">INGYENES SZÁLLÍTÁS</text></svg>`,x:(W-280)>>1,y:H-100},
    {svg:`<svg width="240" height="240" xmlns="http://www.w3.org/2000/svg"><polygon points="120,5 148,88 235,88 168,141 192,225 120,175 48,225 72,141 5,88 92,88" fill="#FF6F00" opacity="0.95"/><text x="120" y="108" text-anchor="middle" font-family="Arial Black,Arial" font-size="28" font-weight="900" fill="white">NEW</text><text x="120" y="142" text-anchor="middle" font-family="Arial Black,Arial" font-size="20" font-weight="700" fill="white">ARRIVAL</text></svg>`,x:W-270,y:30},
  ];
  for (let i=0;i<badges.length;i++) {
    const b=badges[i];
    const canvas=Buffer.alloc(W*H*4,0);
    const canvasImg=await sharp(canvas,{raw:{width:W,height:H,channels:4}}).png().toBuffer();
    const outPath=path.join(dir,`badge-${String(i+1).padStart(2,"0")}.png`);
    await sharp(canvasImg).composite([{input:Buffer.from(b.svg),left:Math.max(0,Math.round(b.x)),top:Math.max(0,Math.round(b.y))}]).png().toFile(outPath);
    console.log("OK badge-"+String(i+1).padStart(2,"0")+".png");
  }
}

// ── 8. COLOR WASH
async function cat_colorwash(dir: string) {
  const w=[{r:255,g:220,b:120,a:0.18},{r:80,g:160,b:255,a:0.18},{r:255,g:80,b:140,a:0.16},{r:20,g:200,b:160,a:0.15},{r:160,g:80,b:255,a:0.18},{r:255,g:100,b:60,a:0.17},{r:0,g:0,b:0,a:0.3},{r:255,g:255,b:255,a:0.25},{r:200,g:160,b:100,a:0.2},{r:60,g:20,b:80,a:0.22}];
  for (let i=0;i<w.length;i++) {
    const c=w[i],buf=Buffer.alloc(W*H*4),a=clamp(c.a*255);
    for(let j=0;j<W*H;j++){buf[j*4]=c.r;buf[j*4+1]=c.g;buf[j*4+2]=c.b;buf[j*4+3]=a;}
    await sharp(buf,{raw:{width:W,height:H,channels:4}}).png().toFile(path.join(dir,`colorwash-${String(i+1).padStart(2,"0")}.png`));
    console.log("OK colorwash-"+String(i+1).padStart(2,"0")+".png");
  }
}

// ── 9. BRUSH STROKE
async function cat_brushstroke(dir: string) {
  const svgs = [
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><path d="M0 ${H-280} Q${W*.1} ${H-320} ${W*.3} ${H-300} Q${W*.5} ${H-280} ${W*.7} ${H-310} Q${W*.9} ${H-330} ${W} ${H-290} L${W} ${H} L0 ${H} Z" fill="black" fill-opacity="0.75"/></svg>`,
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L${W} 0 L${W} 250 Q${W*.8} 290 ${W*.5} 270 Q${W*.2} 250 0 280 Z" fill="black" fill-opacity="0.75"/></svg>`,
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><path d="M0 0 Q200 50 350 200 Q200 350 0 400 Z" fill="black" fill-opacity="0.65"/></svg>`,
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><path d="M0 ${H-360} Q${W*.15} ${H-400} ${W*.35} ${H-370} Q${W*.6} ${H-340} ${W*.8} ${H-380} Q${W*.95} ${H-350} ${W} ${H-360} L${W} ${H} L0 ${H} Z" fill="#1a1a1a" fill-opacity="0.82"/></svg>`,
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><path d="M0 ${H-200} Q${W*.2} ${H-240} ${W*.45} ${H-210} Q${W*.7} ${H-180} ${W} ${H-220} L${W} ${H} L0 ${H} Z" fill="white" fill-opacity="0.88"/></svg>`,
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><path d="M0 ${H*.55} Q120 ${H*.45} 180 ${H*.5} Q240 ${H*.55} 200 ${H*.65} Q160 ${H*.75} 0 ${H*.7} Z" fill="#8B5CF6" fill-opacity="0.8"/><path d="M0 ${H*.3} Q80 ${H*.22} 130 ${H*.28} Q180 ${H*.34} 140 ${H*.44} Q100 ${H*.5} 0 ${H*.46} Z" fill="#EC4899" fill-opacity="0.7"/></svg>`,
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="${W/2}" cy="${H*.92}" rx="${W*.6}" ry="${H*.15}" fill="black" fill-opacity="0.7"/><ellipse cx="${W/2}" cy="${H*.07}" rx="${W*.55}" ry="${H*.12}" fill="black" fill-opacity="0.55"/></svg>`,
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L${W} 0 L${W} 160 Q${W*.75} 190 ${W*.5} 175 Q${W*.25} 160 0 195 Z" fill="#111" fill-opacity="0.88"/></svg>`,
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${W}" height="100" fill="black" fill-opacity="0.8"/><ellipse cx="180" cy="140" rx="30" ry="55" fill="black" fill-opacity="0.8"/><ellipse cx="420" cy="125" rx="22" ry="45" fill="black" fill-opacity="0.8"/><ellipse cx="720" cy="150" rx="28" ry="60" fill="black" fill-opacity="0.8"/><ellipse cx="950" cy="130" rx="20" ry="42" fill="black" fill-opacity="0.8"/></svg>`,
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><path d="M0 0 Q${W*.4} ${H*.1} ${W*.5} ${H*.5} Q${W*.4} ${H*.9} 0 ${H} Z" fill="black" fill-opacity="0.65"/></svg>`,
  ];
  for (let i=0;i<svgs.length;i++) await saveSVG(svgs[i], path.join(dir,`brushstroke-${String(i+1).padStart(2,"0")}.png`));
}

// ── 10. DUOTONE
async function cat_duotone(dir: string) {
  const cfgs: {dark:[number,number,number];light:[number,number,number];angle:number}[] = [
    {dark:[30,0,80],light:[255,160,60],angle:45},
    {dark:[0,40,120],light:[0,220,200],angle:135},
    {dark:[120,0,60],light:[255,120,60],angle:45},
    {dark:[10,80,40],light:[160,255,80],angle:90},
    {dark:[60,0,100],light:[255,80,180],angle:30},
    {dark:[0,60,80],light:[60,220,255],angle:60},
    {dark:[80,20,0],light:[255,200,100],angle:135},
    {dark:[0,0,60],light:[100,100,255],angle:0},
    {dark:[60,0,40],light:[255,180,200],angle:150},
    {dark:[20,20,20],light:[220,220,220],angle:90},
  ];
  for (let i=0;i<cfgs.length;i++) {
    const c=cfgs[i]; const rad=c.angle*Math.PI/180; const cos=Math.cos(rad),sin=Math.sin(rad);
    const [dr,dg,db]=c.dark; const [lr,lg,lb]=c.light;
    await buildOverlay((x,y) => {
      const t=Math.max(0,Math.min(1,((x/W)*cos+(y/H)*sin)/(Math.abs(cos)+Math.abs(sin)+0.0001)));
      return [lerp(dr,lr,t),lerp(dg,lg,t),lerp(db,lb,t),180];
    }, path.join(dir,`duotone-${String(i+1).padStart(2,"0")}.png`));
  }
}

// ── MAIN
async function main() {
  const cats = [
    {id:"vignette",label:"Vignette",fn:cat_vignette},
    {id:"lightleak",label:"Light Leak",fn:cat_lightleak},
    {id:"gradient",label:"Gradient Sweep",fn:cat_gradient},
    {id:"grain",label:"Film Grain",fn:cat_grain},
    {id:"geoframe",label:"Geometric Frame",fn:cat_geoframe},
    {id:"bokeh",label:"Bokeh / Particles",fn:cat_bokeh},
    {id:"badge",label:"Sale Badge",fn:cat_badge},
    {id:"colorwash",label:"Color Wash",fn:cat_colorwash},
    {id:"brushstroke",label:"Brush Stroke",fn:cat_brushstroke},
    {id:"duotone",label:"Duotone",fn:cat_duotone},
  ];
  ensure(OUT_DIR);
  for (const cat of cats) {
    const d=path.join(OUT_DIR,cat.id); ensure(d);
    console.log("\n["+cat.label+"]");
    await cat.fn(d);
  }
  const manifest: Record<string,{id:string;label:string;files:string[]}> = {};
  for (const cat of cats) {
    const d=path.join(OUT_DIR,cat.id);
    manifest[cat.id]={id:cat.id,label:cat.label,files:fs.readdirSync(d).filter(f=>f.endsWith(".png")).sort().map(f=>`/overlays/${cat.id}/${f}`)};
  }
  fs.writeFileSync(path.join(OUT_DIR,"manifest.json"),JSON.stringify(manifest,null,2));
  console.log("\nDone! manifest.json written.");
}
main().catch(console.error);
