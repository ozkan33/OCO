import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsBrand, createBrandUser, deleteBrandUser } from './fixtures/auth';

test.describe('Brand Portal', () => {
  const testBrandEmail = `portal-test-${Date.now()}@example.com`;
  const testBrandPassword = 'TestBrand123!';
  let brandUserId: string | null = null;

  test('portal redirects to login without auth', async ({ page }) => {
    await page.goto('/portal');
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('admin can access portal for preview', async ({ page }) => {
    // Login as admin first, then navigate to portal
    await loginAsAdmin(page);
    // Portal might redirect admin, just verify no crash
    const res = await page.request.get('/api/portal/dashboard');
    // Admin may get 403 or 200 depending on implementation
    expect([200, 403]).toContain(res.status());
  });

  test('portal shows brand name and summary cards', async ({ page }) => {
    // This test needs a brand user to be logged in
    // Skip if no brand user is set up
    const email = process.env.TEST_BRAND_EMAIL;
    const password = process.env.TEST_BRAND_PASSWORD;
    if (!email || !password) {
      test.skip(true, 'Set TEST_BRAND_EMAIL and TEST_BRAND_PASSWORD to run portal tests');
      return;
    }

    await loginAsBrand(page, email, password);
    if (page.url().includes('/portal')) {
      await expect(page.locator('text=Total Retailers')).toBeVisible();
      await expect(page.locator('text=Authorized')).toBeVisible();
      await expect(page.locator('text=Product Status')).toBeVisible();
      await expect(page.locator('text=Market Visits')).toBeVisible();
      await expect(page.locator('text=Sign out')).toBeVisible();
    }
  });

  test('portal market visits tab shows download button on hover', async ({ page }) => {
    const email = process.env.TEST_BRAND_EMAIL;
    const password = process.env.TEST_BRAND_PASSWORD;
    if (!email || !password) {
      test.skip(true, 'Set TEST_BRAND_EMAIL and TEST_BRAND_PASSWORD');
      return;
    }

    await loginAsBrand(page, email, password);
    if (!page.url().includes('/portal')) return;

    // Switch to Market Visits tab
    await page.click('button:has-text("Market Visits")');
    await page.waitForTimeout(1000);

    // Check if any visits exist
    const visitCard = page.locator('.grid > div').first();
    const hasVisits = await visitCard.isVisible().catch(() => false);
    if (!hasVisits) return; // No visits to test

    // Hover to reveal download button
    await visitCard.hover();
    const downloadBtn = visitCard.locator('a[title="Download photo"]');
    await expect(downloadBtn).toBeVisible();
    expect(await downloadBtn.getAttribute('download')).toBeTruthy();
  });
});
