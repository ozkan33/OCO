import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './fixtures/auth';

test.describe('API Routes', () => {
  test.describe('unauthenticated', () => {
    test('GET /api/scorecards returns 401', async ({ request }) => {
      const res = await request.get('/api/scorecards');
      expect(res.status()).toBe(401);
    });

    test('GET /api/auth/me returns 401', async ({ request }) => {
      const res = await request.get('/api/auth/me');
      expect(res.status()).toBe(401);
    });

    test('GET /api/admin/brand-users returns 401', async ({ request }) => {
      const res = await request.get('/api/admin/brand-users');
      expect(res.status()).toBe(401);
    });

    test('GET /api/portal/dashboard returns 401', async ({ request }) => {
      const res = await request.get('/api/portal/dashboard');
      expect(res.status()).toBe(401);
    });
  });

  test.describe('authenticated as admin', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAdmin(page);
    });

    test('GET /api/auth/me returns user with ADMIN role', async ({ page }) => {
      const res = await page.request.get('/api/auth/me');
      expect(res.status()).toBe(200);
      const data = await res.json();
      expect(data.user).toBeDefined();
      expect(data.user.role).toBe('ADMIN');
      expect(data.user.email).toBeTruthy();
    });

    test('GET /api/scorecards returns array', async ({ page }) => {
      const res = await page.request.get('/api/scorecards');
      expect(res.status()).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    test('POST /api/scorecards creates scorecard', async ({ page }) => {
      const res = await page.request.post('/api/scorecards', {
        data: { title: `API Test ${Date.now()}`, data: { columns: [], rows: [] } },
      });
      expect(res.status()).toBe(201);
      const sc = await res.json();
      expect(sc.id).toBeTruthy();
      expect(sc.title).toContain('API Test');

      // Cleanup
      await page.request.delete(`/api/scorecards/${sc.id}`);
    });

    test('GET /api/admin/brand-users returns array', async ({ page }) => {
      const res = await page.request.get('/api/admin/brand-users');
      expect(res.status()).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    test('GET /api/templates returns array', async ({ page }) => {
      const res = await page.request.get('/api/templates');
      expect(res.status()).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    test('GET /api/admin/login-sessions returns array', async ({ page }) => {
      const res = await page.request.get('/api/admin/login-sessions');
      expect(res.status()).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });
  });
});
