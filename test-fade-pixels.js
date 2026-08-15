const { chromium } = require("playwright");
const fs = require("fs");
const zlib = require("zlib");

function decodePng(buf) {
  // returns { width, height, data: Buffer RGBA }
  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let rp = 0, op = 0;
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    const line = raw.slice(rp, rp + stride);
    rp += stride;
    const prev = y === 0 ? Buffer.alloc(stride) : out.slice((y - 1) * stride, y * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v;
      switch (filter) {
        case 0: v = line[x]; break;
        case 1: v = (line[x] + a) & 0xff; break;
        case 2: v = (line[x] + b) & 0xff; break;
        case 3: v = (line[x] + ((a + b) >> 1)) & 0xff; break;
        case 4: v = (line[x] + paeth(a, b, c)) & 0xff; break;
        default: throw new Error("bad filter " + filter);
      }
      out[y * stride + x] = v;
    }
  }
  return { width, height, data: out, bpp };
}

async function main() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  await page.fill("input[type=email]", "fan@haibu.test");
  await page.fill("input[type=password]", "haibu123");
  await page.click("button[type=submit]");
  await page.waitForTimeout(2000);
  await page.goto("http://localhost:3000/book/073c016e-db44-460f-9c32-824ec9c7d367", { waitUntil: "networkidle" });
  await page.click('button:has-text("Piano Lessons")');
  await page.waitForTimeout(2000);

  // Mid-scroll state
  await page.locator('button[aria-label="Scroll dates right"]').click();
  await page.waitForTimeout(900);

  const rowBox = await page.locator(".horizontal-scroll").first().boundingBox();
  const clip = { x: Math.round(rowBox.x) - 2, y: Math.round(rowBox.y), width: 150, height: 48 };
  const SHOT = "/Users/raghavendra/Documents/Projects/Haibu/test-screenshots";

  // 1. Check compiled gradient CSS on the element
  const g = page.locator("div.bg-linear-to-r").first();
  console.log("gradient bgImage:", await g.evaluate(el => getComputedStyle(el).backgroundImage));
  console.log("gradient width:", await g.evaluate(el => el.getBoundingClientRect().width));

  // 2. Evidence screenshot with fade visible (mouse hovering row)
  await page.mouse.move(rowBox.x + 60, rowBox.y + 24);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOT}/ux-pill-arrows-fade-midscroll.png` });

  // 3. Pixel comparison: fade ON vs fade OFF over the same clip
  await page.screenshot({ path: "/tmp/fade-on.png", clip });
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("div.bg-linear-to-r, div.bg-linear-to-l")) {
      el.style.opacity = "0";
      el.style.transition = "none";
    }
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: "/tmp/fade-off.png", clip });

  const on = decodePng(fs.readFileSync("/tmp/fade-on.png"));
  const off = decodePng(fs.readFileSync("/tmp/fade-off.png"));
  const lum = (d, x, y) => {
    const i = (y * d.width + x) * d.bpp;
    return 0.2126 * d.data[i] + 0.7152 * d.data[i + 1] + 0.0722 * d.data[i + 2];
  };
  // column-average luminance profile across the clip (rows 10-38 = pill zone)
  const profile = (d) => {
    const cols = [];
    for (let x = 0; x < d.width; x++) {
      let s = 0, n = 0;
      for (let y = 10; y < 38; y++) { s += lum(d, x, y); n++; }
      cols.push(Math.round(s / n));
    }
    return cols;
  };
  const pOn = profile(on), pOff = profile(off);
  console.log("column luminance (x: fadeON, fadeOFF):");
  for (let x = 0; x < pOn.length; x += 10) {
    console.log(`  x=${x}: on=${pOn[x]} off=${pOff[x]}`);
  }
  const leftDark = pOn.slice(0, 24).some(v => v < 30);
  const leftLightOff = pOff.slice(0, 24).some(v => v > 40);
  console.log("solid dark zone behind arrow when fade ON:", leftDark);
  console.log("text visible in same zone when fade OFF:", leftLightOff);

  // 4. Hover-artifact check for the white pill: move mouse onto last pill at end state
  for (let i = 0; i < 12; i++) {
    const r = page.locator('button[aria-label="Scroll dates right"]');
    if (!(await r.count())) break;
    await r.click();
    await page.waitForTimeout(450);
  }
  const lastPill = page.locator("button.rounded-pill").last();
  const lastBox = await lastPill.boundingBox();
  await page.mouse.move(lastBox.x + lastBox.width / 2, lastBox.y + lastBox.height / 2);
  await page.waitForTimeout(300);
  const st = await lastPill.evaluate(el => {
    const s = getComputedStyle(el);
    return { text: el.textContent, bg: s.backgroundColor, color: s.color };
  });
  console.log("last pill under mouse:", JSON.stringify(st));
  const selected = await page.evaluate(() => {
    const p = Array.from(document.querySelectorAll("button.rounded-pill")).find(el => getComputedStyle(el).backgroundColor === "rgb(168, 17, 32)");
    return p ? { text: p.textContent, bg: getComputedStyle(p).backgroundColor } : null;
  });
  console.log("actual selected pill:", JSON.stringify(selected));

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
