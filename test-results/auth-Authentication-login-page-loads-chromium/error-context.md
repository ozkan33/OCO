# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> Authentication >> login page loads
- Location: e2e\auth.spec.ts:5:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.goto: net::ERR_ABORTED; maybe frame was detached?
Call log:
  - navigating to "http://localhost:3000/auth/login", waiting until "load"

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { loginAsAdmin, logout } from './fixtures/auth';
  3  | 
  4  | test.describe('Authentication', () => {
  5  |   test('login page loads', async ({ page }) => {
> 6  |     await page.goto('/auth/login');
     |                ^ Error: page.goto: net::ERR_ABORTED; maybe frame was detached?
  7  |     await expect(page.locator('h2')).toContainText('Sign In');
  8  |     await expect(page.locator('input[type="email"]')).toBeVisible();
  9  |     await expect(page.locator('input[type="password"]')).toBeVisible();
  10 |   });
  11 | 
  12 |   test('login with invalid credentials shows error', async ({ page }) => {
  13 |     await page.goto('/auth/login');
  14 |     await page.fill('input[type="email"]', 'wrong@test.com');
  15 |     await page.fill('input[type="password"]', 'wrongpassword');
  16 |     await page.click('button[type="submit"]');
  17 |     await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 10000 });
  18 |   });
  19 | 
  20 |   test('admin login redirects to dashboard', async ({ page }) => {
  21 |     await loginAsAdmin(page);
  22 |     await expect(page).toHaveURL(/\/admin\/dashboard/);
  23 |     await expect(page.locator('text=3Brothers Marketing')).toBeVisible();
  24 |   });
  25 | 
  26 |   test('protected route redirects to login without auth', async ({ page }) => {
  27 |     await page.goto('/admin/dashboard');
  28 |     await expect(page).toHaveURL(/\/auth\/login/);
  29 |   });
  30 | 
  31 |   test('portal route redirects to login without auth', async ({ page }) => {
  32 |     await page.goto('/portal');
  33 |     await expect(page).toHaveURL(/\/auth\/login/);
  34 |   });
  35 | 
  36 |   test('logout clears session', async ({ page }) => {
  37 |     await loginAsAdmin(page);
  38 |     await logout(page);
  39 |     await page.goto('/admin/dashboard');
  40 |     await expect(page).toHaveURL(/\/auth\/login/);
  41 |   });
  42 | });
  43 | 
```