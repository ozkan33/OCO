import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:3000';
const OUT = 'c:/tmp/pwa-emu';
mkdirSync(OUT, { recursive: true });

const tests = [
  { name: '1-ipad-admin-dashboard-unauth', device: 'iPad Pro 11 landscape', path: '/admin/dashboard' },
  { name: '2-iphone-admin-dashboard-redirected', device: 'iPhone 14', path: '/admin/dashboard' },
  { name: '3-iphone-mobile-unavailable-page', device: 'iPhone 14', path: '/admin/mobile-unavailable' },
  { name: '4-ipad-login-page', device: 'iPad Pro 11 landscape', path: '/auth/login' },
  { name: '5-iphone-force-desktop', device: 'iPhone 14', path: '/admin/dashboard?force=desktop' },
];

const browser = await chromium.launch();
const results = [];

for (const t of tests) {
  const deviceProfile = devices[t.device];
  if (!deviceProfile) {
    console.error(`No device profile for "${t.device}"`);
    continue;
  }
  const ctx = await browser.newContext({ ...deviceProfile });
  const page = await ctx.newPage();
  try {
    const response = await page.goto(BASE + t.path, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(800);
    const finalUrl = page.url();
    const status = response?.status() ?? 'n/a';
    await page.screenshot({ path: `${OUT}/${t.name}.png`, fullPage: true });
    results.push({ name: t.name, input: t.path, final: finalUrl.replace(BASE, ''), status });
    console.log(`${t.name.padEnd(42)} ${t.path.padEnd(42)} -> ${finalUrl.replace(BASE, '').padEnd(40)} [${status}]`);
  } catch (e) {
    console.error(`${t.name} FAILED: ${e.message}`);
    results.push({ name: t.name, input: t.path, error: e.message });
  }
  await ctx.close();
}

await browser.close();

console.log('\n--- SUMMARY ---');
for (const r of results) console.log(JSON.stringify(r));
