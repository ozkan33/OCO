import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:3002';
const OUT = 'c:/tmp/pwa-banner-shots';
mkdirSync(OUT, { recursive: true });

async function captureBanner(name, deviceProfile, role, simulatePrompt = false) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...deviceProfile });

  await ctx.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: { id: 'mock-user', email: 'test@example.com', role } }),
    }),
  );

  const page = await ctx.newPage();
  await ctx.addInitScript(() => {
    try { sessionStorage.setItem('oco:just-logged-in', '1'); } catch {}
  });

  if (simulatePrompt) {
    await ctx.addInitScript(() => {
      window.addEventListener('load', () => {
        setTimeout(() => {
          const evt = new Event('beforeinstallprompt');
          evt.prompt = async () => {};
          evt.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
          window.dispatchEvent(evt);
        }, 200);
      });
    });
  }

  // /admin/mobile-unavailable is public (Phase 2 carve-out) and we've
  // temporarily mounted PortalInstallBanner there for this capture.
  await page.goto(BASE + '/admin/mobile-unavailable', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2200);

  const bannerVisible = await page.evaluate(() => {
    const region = document.querySelector('[role="region"][aria-label*="Install"]');
    return !!region;
  });

  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(`${name.padEnd(40)} bannerVisible=${bannerVisible}`);

  await ctx.close();
  await browser.close();
}

await captureBanner('portal-iphone-ios-variant', devices['iPhone 14'], 'BRAND', false);
await captureBanner('portal-android-chromium-variant', devices['Pixel 7'], 'BRAND', true);
await captureBanner('portal-desktop-chromium-variant', devices['Desktop Chrome'], 'BRAND', true);
