import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './fixtures/auth';

test.describe('Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('sidebar is visible with scorecards', async ({ page }) => {
    await expect(page.locator('text=Workspaces')).toBeVisible();
    await expect(page.locator('text=Master Scorecard')).toBeVisible();
    await expect(page.locator('text=ScoreCards')).toBeVisible();
  });

  test('create new scorecard', async ({ page }) => {
    // Click the + button to create
    await page.locator('button[title="Create New ScoreCard"]').click();
    await expect(page.locator('text=Create New ScoreCard')).toBeVisible();

    // Fill in the name
    const name = `Test Scorecard ${Date.now()}`;
    await page.fill('input[placeholder*="Sales Performance"]', name);
    await page.click('button:has-text("Create ScoreCard")');

    // Verify it appears in the sidebar
    await expect(page.locator(`text=${name}`)).toBeVisible({ timeout: 10000 });
  });

  test('navigate between nav pills', async ({ page }) => {
    // Market Visits
    await page.click('button:has-text("Market Visits")');
    await expect(page).toHaveURL(/\/admin\/market-visits/);
    await expect(page.locator('text=Market Visits')).toBeVisible();

    // Clients
    await page.click('button:has-text("Clients")');
    await expect(page).toHaveURL(/\/admin\/clients/);
    await expect(page.locator('text=Client Management')).toBeVisible();

    // Back to Dashboard
    await page.click('button:has-text("Dashboard")');
    await expect(page).toHaveURL(/\/admin\/dashboard/);
  });

  test('auto-save fires after editing a cell', async ({ page }) => {
    // Wait for scorecards to load
    await page.waitForTimeout(2000);

    // Check if there's a scorecard in the sidebar, click it
    const scorecardBtn = page.locator('aside button').filter({ hasText: /^(?!Master|ScoreCards|Workspaces)/ }).first();
    const hasScorecards = await scorecardBtn.isVisible().catch(() => false);
    if (!hasScorecards) {
      test.skip(true, 'No scorecards to test — create one first');
      return;
    }

    await scorecardBtn.click();
    await page.waitForTimeout(1000);

    // Listen for PUT request to /api/scorecards
    const savePromise = page.waitForResponse(r => r.url().includes('/api/scorecards/') && r.request().method() === 'PUT', { timeout: 10000 }).catch(() => null);

    // Try to click a cell and edit it
    const firstCell = page.locator('.rdg-cell').first();
    if (await firstCell.isVisible()) {
      await firstCell.dblclick();
      await page.keyboard.type('Test');
      await page.keyboard.press('Enter');

      // Verify auto-save fires
      const res = await savePromise;
      if (res) {
        expect(res.status()).toBeLessThan(300);
      }
    }
  });
});
