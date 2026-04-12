import { test, expect } from '@playwright/test';
import { loginAsAdmin, deleteBrandUser } from './fixtures/auth';

test.describe('Client Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/clients');
    await page.waitForLoadState('networkidle');
  });

  test('page loads with table and add button', async ({ page }) => {
    await expect(page.locator('text=Client Management')).toBeVisible();
    await expect(page.locator('button:has-text("Add Client")')).toBeVisible();
    await expect(page.locator('th:has-text("BRAND")')).toBeVisible();
    await expect(page.locator('th:has-text("CONTACT")')).toBeVisible();
  });

  test('create brand user flow', async ({ page }) => {
    const testEmail = `test-${Date.now()}@example.com`;

    // Open create modal
    await page.click('button:has-text("Add Client")');
    await expect(page.locator('text=Add New Client')).toBeVisible();

    // Fill form
    await page.selectOption('select', { label: 'Taco Terco' });
    await page.fill('input[placeholder="Jane Doe"]', 'Test User');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[placeholder*="Min 8"]', 'testpassword123');

    // Submit
    await page.click('button:has-text("Create Client")');

    // Should show success with credentials
    await expect(page.locator('text=Account created successfully')).toBeVisible({ timeout: 10000 });
    await expect(page.locator(`text=${testEmail}`)).toBeVisible();

    // Close and verify table
    await page.click('button:has-text("Done")');
    await expect(page.locator(`td:has-text("${testEmail}")`)).toBeVisible();

    // Cleanup: delete the test user
    const row = page.locator('tr', { has: page.locator(`td:has-text("${testEmail}")`) });
    const userId = await row.getAttribute('data-user-id').catch(() => null);
    if (userId) await deleteBrandUser(page, userId);
  });

  test('edit modal opens with user data', async ({ page }) => {
    // Check if any users exist
    const editBtn = page.locator('button[title="Edit"]').first();
    const hasUsers = await editBtn.isVisible().catch(() => false);
    if (!hasUsers) {
      test.skip(true, 'No brand users to test');
      return;
    }

    await editBtn.click();
    await expect(page.locator('text=Edit Client')).toBeVisible();
    await expect(page.locator('text=Account Status')).toBeVisible();
    await expect(page.locator('text=Reset Password')).toBeVisible();
    await expect(page.locator('text=Scorecard Access')).toBeVisible();
  });

  test('login history panel toggles', async ({ page }) => {
    const clockBtn = page.locator('button[title="Login History"]').first();
    const hasUsers = await clockBtn.isVisible().catch(() => false);
    if (!hasUsers) {
      test.skip(true, 'No brand users to test');
      return;
    }

    await clockBtn.click();
    await expect(page.locator('text=Login History')).toBeVisible();

    // Click again to close
    await clockBtn.click();
    await expect(page.locator('text=Login History')).not.toBeVisible();
  });
});
