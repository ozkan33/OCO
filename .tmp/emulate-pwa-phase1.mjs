import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:3002';
const OUT = 'c:/tmp/pwa-emu-phase1';
mkdirSync(OUT, { recursive: true });

const tests = [
  { name: '1-marketing-home', device: 'Desktop Chrome', path: '/' },
  { name: '2-ipad-login-page', device: 'iPad Pro 11 landscape', path: '/auth/login?from=pwa&target=admin' },
  { name: '3-ipad-admin-mobile-unavailable', device: 'iPad Pro 11 landscape', path: '/admin/mobile-unavailable' },
  { name: '4-iphone-portal-anon', device: 'iPhone 14', path: '/portal' },
  { name: '5-iphone-mobile-unavailable', device: 'iPhone 14', path: '/admin/mobile-unavailable' },
];

const browser = await chromium.launch();
for (const t of tests) {
  const ctx = await browser.newContext({ ...devices[t.device] });
  const page = await ctx.newPage();
  try {
    await page.goto(BASE + t.path, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(800);
    const finalUrl = page.url();
    const meta = await page.evaluate(() => ({
      manifest: document.querySelector('link[rel="manifest"]')?.getAttribute('href') ?? null,
      theme: document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null,
      title: document.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute('content') ?? null,
      appleIcon: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href') ?? null,
    }));
    await page.screenshot({ path: `${OUT}/${t.name}.png`, fullPage: true });
    console.log(`${t.name.padEnd(40)} -> ${finalUrl.replace(BASE, '').padEnd(45)}  manifest=${meta.manifest} theme=${meta.theme} title=${meta.title}`);
  } catch (e) {
    console.error(`${t.name} FAILED: ${e.message}`);
  }
  await ctx.close();
}
await browser.close();
