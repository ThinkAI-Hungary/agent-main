import sharp from 'sharp';
import * as path from 'path';

// Test Fix #1: adaptive rembg alpha cleanup
// Expected: pass1 (near-white, alpha<80) removes the golden rectangle pixels
// Verify: pass1Count > 0 means the golden rectangle source pixels were found and removed

const rembgFile = path.join('renders', 'rembg-1782826134973.png');

async function testAlphaCleanup() {
  console.log(`\n=== Fix #1 Test: Adaptive Alpha Cleanup ===`);
  console.log(`Input: ${rembgFile}\n`);

  const inputBuf = await sharp(rembgFile).png().toBuffer();
  const meta = await sharp(inputBuf).metadata();
  console.log(`Image size: ${meta.width}×${meta.height}, channels: ${meta.channels}`);

  if (meta.channels !== 4) {
    console.error('❌ Not an RGBA image - rembg may not have run');
    return;
  }

  const rawBuf = await sharp(inputBuf).raw().toBuffer();
  const totalPixels = rawBuf.length / 4;

  // Count alpha distribution BEFORE cleanup
  let alpha0 = 0, alpha1_24 = 0, alpha25_79 = 0, alpha25_79_white = 0, alpha80_254 = 0, alpha255 = 0;
  for (let i = 0; i < rawBuf.length; i += 4) {
    const a = rawBuf[i+3];
    if (a === 0) alpha0++;
    else if (a < 25) alpha1_24++;
    else if (a < 80) {
      alpha25_79++;
      if ((rawBuf[i] + rawBuf[i+1] + rawBuf[i+2]) > 570) alpha25_79_white++;
    }
    else if (a < 255) alpha80_254++;
    else alpha255++;
  }

  console.log(`=== BEFORE cleanup (total ${totalPixels} pixels) ===`);
  console.log(`  alpha=0   (fully transparent): ${alpha0} (${(alpha0/totalPixels*100).toFixed(1)}%)`);
  console.log(`  alpha=1-24 (very low):         ${alpha1_24} → Pass 2 will zero these`);
  console.log(`  alpha=25-79 (semi-transparent): ${alpha25_79} total`);
  console.log(`    ↳ near-WHITE (R+G+B>570):    ${alpha25_79_white} → Pass 1 will zero these ← KOCKA PIXELS`);
  console.log(`    ↳ non-white:                  ${alpha25_79 - alpha25_79_white} → kept (product edges)`);
  console.log(`  alpha=80-254 (partial):         ${alpha80_254}`);
  console.log(`  alpha=255 (fully opaque):       ${alpha255}`);

  // Apply the two-pass cleanup
  const rawBuf2 = Buffer.from(rawBuf); // copy
  let pass1Count = 0, pass2Count = 0;
  for (let i = 0; i < rawBuf2.length; i += 4) {
    const r = rawBuf2[i], g = rawBuf2[i+1], b = rawBuf2[i+2], a = rawBuf2[i+3];
    if (a > 0 && a < 80 && (r + g + b) > 570) {
      rawBuf2[i+3] = 0;
      pass1Count++;
    } else if (a < 25) {
      rawBuf2[i+3] = 0;
      pass2Count++;
    }
  }

  // Save cleaned version
  const outputBuf = await sharp(rawBuf2, {
    raw: { width: meta.width!, height: meta.height!, channels: 4 }
  }).png().toBuffer();
  const outputPath = 'renders/test-alpha-cleaned.png';
  await sharp(outputBuf).toFile(outputPath);

  console.log(`\n=== AFTER cleanup ===`);
  console.log(`  Pass 1 (near-white<80) zeroed: ${pass1Count}px`);
  console.log(`  Pass 2 (any<25) zeroed:        ${pass2Count}px`);
  console.log(`  Total zeroed:                  ${pass1Count + pass2Count}px`);
  console.log(`\n  Output saved: ${outputPath}`);

  if (pass1Count > 500) {
    console.log(`\n✅ Fix #1 WORKS — ${pass1Count} golden-rectangle pixels removed`);
  } else if (pass1Count > 0) {
    console.log(`\n⚠️  Fix #1 partial — only ${pass1Count} white pixels found. Kocka may have other source.`);
  } else {
    console.log(`\n❌ Fix #1 NO EFFECT — 0 near-white pixels found. Kocka comes from elsewhere.`);
  }
}

testAlphaCleanup().catch(console.error);
