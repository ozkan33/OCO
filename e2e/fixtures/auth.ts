import { Page } from '@playwright/test';

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || 'dev@test.local';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'devpassword';

export async function loginAsAdmin(page: Page) {
  await page.goto('/auth/login');
  await page.fill('input[type="email"]', ADMIN_EMAIL);
  await page.fill('input[type="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/admin/dashboard', { timeout: 15000 });
}

export async function loginAsBrand(page: Page, email: string, password: string) {
  await page.goto('/auth/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  // May redirect to change-password or portal
  await page.waitForURL(/\/(portal|auth\/change-password)/, { timeout: 15000 });
}

export async function logout(page: Page) {
  await page.request.post('/api/auth/logout');
  await page.goto('/auth/login');
}

/** Create a brand user via API (admin must be logged in) */
export async function createBrandUser(page: Page, data: {
  email: string; contactName: string; brandName: string; tempPassword: string;
  scorecardAssignments?: { scorecardId: string; productColumns: string[] }[];
}) {
  const res = await page.request.post('/api/admin/brand-users', { data });
  return res.json();
}

/** Delete a brand user via API */
export async function deleteBrandUser(page: Page, userId: string) {
  await page.request.delete(`/api/admin/brand-users/${userId}`, {
    data: { permanent: true },
  });
}
