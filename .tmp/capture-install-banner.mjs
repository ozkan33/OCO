/**
 * Capture the install banner in three states:
 *  - iPad iOS variant on /admin/mobile-unavailable (admin role mocked)
 *  - iPhone iOS variant on /portal (brand role mocked)
 *  - Desktop Chromium variant on /admin/mobile-unavailable with synthetic
 *    beforeinstallprompt fired (admin role mocked)
 *
 * /admin/mobile-unavailable is used because it's the only /admin route the
 * middleware exposes without auth — the layout still mounts the banner.
 */
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:3002';
const OUT = 'c:/tmp/pwa-banner-shots';
mkdirSync(OUT, { recursive: true });

async function captureBanner(name, deviceProfile, path, role, simulatePrompt = false) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...deviceProfile });

  // Mock /api/auth/me to return the requested role.
  await ctx.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: { id: 'mock-user', email: 'test@example.com', role } }),
    }),
  );

  const page = await ctx.newPage();

  // Set the just-logged-in sessionStorage flag before any script runs.
  await ctx.addInitScript(() => {
    try { sessionStorage.setItem('oco:just-logged-in', '1'); } catch {}
  });

  // For desktop we synthesize the beforeinstallprompt event so the
  // Chromium "Install app" button variant renders. On iOS profiles we
  // skip — the iOS variant doesn't need a real prompt event.
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

  await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // Give the banner mount logic + auth fetch + setTimeout time to complete.
  await page.waitForTimeout(2200);

  // Verify the banner is in the DOM.
  const bannerVisible = await page.evaluate(() => {
    const region = document.querySelector('[role="region"][aria-label*="Install"]');
    return !!region;
  });

  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(`${name.padEnd(40)} bannerVisible=${bannerVisible}`);

  await ctx.close();
  await browser.close();
}

await captureBanner(
  'admin-ipad-ios-variant',
  devices['iPad Pro 11 landscape'],
  '/admin/mobile-unavailable',
  'ADMIN',
  false,
);

await captureBanner(
  'admin-desktop-chromium-variant',
  devices['Desktop Chrome'],
  '/admin/mobile-unavailable',
  'ADMIN',
  true,
);

await captureBanner(
  'portal-iphone-ios-variant',
  devices['iPhone 14'],
  '/portal',
  'BRAND',
  false,
);

await captureBanner(
  'portal-android-chromium-variant',
  devices['Pixel 7'],
  '/portal',
  'BRAND',
  true,
);
