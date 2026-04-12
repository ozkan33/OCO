import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './fixtures/auth';

test.describe('Market Visits', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/market-visits');
    await page.waitForLoadState('networkidle');
  });

  test('page loads with upload form and gallery', async ({ page }) => {
    await expect(page.locator('text=New Market Visit')).toBeVisible();
    await expect(page.locator('text=Drop a photo')).toBeVisible();
    await expect(page.locator('label:has-text("Visit Date")')).toBeVisible();
    await expect(page.locator('label:has-text("Store Name")')).toBeVisible();
  });

  test('brand filter dropdown has options', async ({ page }) => {
    const select = page.locator('select').first();
    await expect(select).toBeVisible();
    const options = await select.locator('option').allTextContents();
    expect(options.length).toBeGreaterThan(1); // "All Brands" + at least one brand
    expect(options[0]).toBe('All Brands');
  });

  test('edit button appears on visit card', async ({ page }) => {
    // Check if any visits exist
    const visitCards = page.locator('.grid > div').first();
    const hasVisits = await visitCards.isVisible().catch(() => false);
    if (!hasVisits) {
      test.skip(true, 'No visits to test — upload one first');
      return;
    }

    // Hover to reveal edit button
    await visitCards.hover();
    const editBtn = visitCards.locator('button[aria-label="Edit visit"]');
    await expect(editBtn).toBeVisible();
  });
});
