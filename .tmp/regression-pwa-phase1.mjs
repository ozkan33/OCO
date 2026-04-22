import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:3002';
const OUT = 'c:/tmp/pwa-regression';
mkdirSync(OUT, { recursive: true });

// Comprehensive matrix: every public surface on every device class.
const tests = [
  // Marketing — must continue to work, this is the live landing page.
  { name: '01-marketing-desktop',          device: 'Desktop Chrome',         path: '/' },
  { name: '02-marketing-ipad',             device: 'iPad Pro 11 landscape',  path: '/' },
  { name: '03-marketing-iphone',           device: 'iPhone 14',              path: '/' },

  // Auth — should always render normally regardless of device.
  { name: '04-login-desktop',              device: 'Desktop Chrome',         path: '/auth/login' },
  { name: '05-login-ipad',                 device: 'iPad Pro 11 landscape',  path: '/auth/login' },
  { name: '06-login-iphone',               device: 'iPhone 14',              path: '/auth/login' },
  { name: '07-login-from-pwa-admin',       device: 'iPad Pro 11 landscape',  path: '/auth/login?from=pwa&target=admin' },
  { name: '08-login-from-pwa-portal',      device: 'iPhone 14',              path: '/auth/login?from=pwa&target=portal' },

  // Admin — phase 2 phone gate must still fire.
  { name: '09-admin-ipad-unauth',          device: 'iPad Pro 11 landscape',  path: '/admin/dashboard' },
  { name: '10-admin-iphone-redirected',    device: 'iPhone 14',              path: '/admin/dashboard' },
  { name: '11-admin-iphone-force-desktop', device: 'iPhone 14',              path: '/admin/dashboard?force=desktop' },
  { name: '12-mobile-unavailable-iphone',  device: 'iPhone 14',              path: '/admin/mobile-unavailable' },
  { name: '13-mobile-unavailable-ipad',    device: 'iPad Pro 11 landscape',  path: '/admin/mobile-unavailable' },

  // Portal — works on every form factor, unauth → login.
  { name: '14-portal-iphone-unauth',       device: 'iPhone 14',              path: '/portal' },
  { name: '15-portal-ipad-unauth',         device: 'iPad Pro 11 landscape',  path: '/portal' },
  { name: '16-portal-desktop-unauth',      device: 'Desktop Chrome',         path: '/portal' },
];

const browser = await chromium.launch();
const summary = [];

for (const t of tests) {
  const ctx = await browser.newContext({ ...devices[t.device] });
  const page = await ctx.newPage();

  const consoleErrors = [];
  const consoleWarnings = [];
  const failedRequests = [];
  const pageErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
    if (msg.type() === 'warning') consoleWarnings.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('requestfailed', (req) => {
    // Ignore the favicon noise that Next dev sometimes emits
    if (req.url().includes('favicon')) return;
    failedRequests.push(`${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
  });

  let result = { name: t.name, path: t.path, device: t.device };

  try {
    await page.goto(BASE + t.path, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1200);
    const finalUrl = page.url();
    const meta = await page.evaluate(() => ({
      manifest: document.querySelector('link[rel="manifest"]')?.getAttribute('href') ?? null,
      theme: document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null,
      title: document.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute('content') ?? null,
      capable: document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.getAttribute('content') ?? null,
      docTitle: document.title,
    }));
    await page.screenshot({ path: `${OUT}/${t.name}.png`, fullPage: true });
    result = {
      ...result,
      finalPath: finalUrl.replace(BASE, ''),
      ...meta,
      consoleErrors,
      consoleWarnings: consoleWarnings.slice(0, 3),
      failedRequests,
      pageErrors,
    };
  } catch (e) {
    result.crash = e.message;
  }

  summary.push(result);
  const errCount = (result.consoleErrors?.length || 0) + (result.pageErrors?.length || 0) + (result.failedRequests?.length || 0);
  console.log(`${t.name.padEnd(40)} ${t.path.padEnd(40)} -> ${(result.finalPath || 'CRASH').padEnd(40)} manifest=${result.manifest} errors=${errCount}`);
  if (result.pageErrors?.length) console.log(`  PAGE ERRORS: ${JSON.stringify(result.pageErrors)}`);
  if (result.consoleErrors?.length) console.log(`  CONSOLE ERRORS: ${JSON.stringify(result.consoleErrors)}`);
  if (result.failedRequests?.length) console.log(`  FAILED REQUESTS: ${JSON.stringify(result.failedRequests)}`);
  await ctx.close();
}

writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 2));
await browser.close();

const totalErrors = summary.reduce((acc, r) => acc + (r.consoleErrors?.length || 0) + (r.pageErrors?.length || 0) + (r.failedRequests?.length || 0), 0);
const crashed = summary.filter((r) => r.crash);
console.log('');
console.log(`Total tests: ${summary.length}  Crashed: ${crashed.length}  Total errors: ${totalErrors}`);
if (crashed.length) console.log('CRASHES:', crashed.map((r) => r.name).join(', '));
