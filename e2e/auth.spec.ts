import { test, expect } from '@playwright/test';
import { loginAsAdmin, logout } from './fixtures/auth';

test.describe('Authentication', () => {
  test('login page loads', async ({ page }) => {
    await page.goto('/auth/login', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h2')).toContainText('Sign In');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto('/auth/login', { waitUntil: 'domcontentloaded' });
    await page.fill('input[type="email"]', 'wrong@test.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 10000 });
  });

  test('admin login redirects to dashboard', async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page).toHaveURL(/\/admin\/dashboard/);
    await expect(page.locator('text=3Brothers Marketing')).toBeVisible();
  });

  test('protected route redirects to login without auth', async ({ page }) => {
    await page.goto('/admin/dashboard');
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('portal route redirects to login without auth', async ({ page }) => {
    await page.goto('/portal');
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('logout clears session', async ({ page }) => {
    await loginAsAdmin(page);
    await logout(page);
    await page.goto('/admin/dashboard');
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});
