const sharp = require("./node_modules/sharp");
async function test() {
  const r = await sharp("renders/rembg-1782826134973.png").png().toBuffer();
  const m = await sharp(r).metadata();
  const W = m.width, H = m.height, C = Math.round(H * 0.45);
  const svgStr = `<svg width="${W}" height="${C}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="wt" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgb(255,130,25)" stop-opacity="0.28"/><stop offset="100%" stop-color="rgb(255,130,25)" stop-opacity="0"/></linearGradient></defs><rect width="${W}" height="${C}" fill="url(#wt)"/></svg>`;
  const svg = Buffer.from(svgStr);
  const wb = await sharp({create:{width:W,height:C,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp(svg).png().toBuffer(),blend:"over"}]).png().toBuffer();
  const after = await sharp(r).composite([{input:wb,left:0,top:0,blend:"soft-light"}]).png().toBuffer();
  const origRaw = await sharp(r).raw().toBuffer();
  const afterRaw = await sharp(after).raw().toBuffer();
  let bad = 0;
  for (let i = 0; i < origRaw.length; i += 4) {
    if (origRaw[i+3] === 0 && afterRaw[i+3] > 0) bad++;
  }
  console.log("Contaminated pixels after soft-light:", bad);
  if (bad > 0) {
    console.log("ROOT CAUSE CONFIRMED - soft-light bleeds into alpha=0 areas");
    const fixedRaw = Buffer.from(afterRaw);
    for (let i = 0; i < origRaw.length; i += 4) { fixedRaw[i+3] = origRaw[i+3]; }
    let still = 0;
    for (let i = 0; i < origRaw.length; i += 4) {
      if (origRaw[i+3] === 0 && fixedRaw[i+3] > 0) still++;
    }
    console.log("After alpha restore fix:", still, "contaminated - FIX WORKS:", still === 0);
  } else {
    console.log("soft-light safe in this version - rectangle from elsewhere");
  }
}
test().catch(console.error);
