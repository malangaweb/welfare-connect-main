import { test, expect } from '@playwright/test';

test.describe('Members list performance', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="username"]', 'Malingi');
    await page.fill('input[name="password"]', 'b1216170');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 20000 });
  });

  test('shows loading skeleton on initial load', async ({ page }) => {
    await page.goto('/members');
    // Should see skeleton immediately (animate-pulse from shadcn Skeleton)
    const skeleton = page.locator('.animate-pulse').first();
    await expect(skeleton).toBeVisible({ timeout: 5000 });
    // Wait for data to load (skeleton should disappear)
    await expect(skeleton).not.toBeVisible({ timeout: 30000 });
  });

  test('shows loading overlay when balance filter changes', async ({ page }) => {
    await page.goto('/members');
    await page.waitForSelector('table', { timeout: 30000 });

    // Click the balance filter trigger (Radix Select)
    await page.locator('text=All Balances').click();
    await page.waitForTimeout(300);

    // Select "Negative Balance" from the dropdown portal
    await page.locator('[role="option"]').filter({ hasText: 'Negative Balance' }).click();

    // Loading overlay should appear
    const overlay = page.locator('text=Refreshing...');
    await expect(overlay).toBeVisible({ timeout: 5000 });
    // And disappear when done
    await expect(overlay).not.toBeVisible({ timeout: 60000 });
  });

  test('balance filter loads in under 10 seconds', async ({ page }) => {
    await page.goto('/members');
    await page.waitForSelector('table', { timeout: 30000 });

    const start = Date.now();

    // Trigger balance filter via Radix Select
    await page.locator('text=All Balances').click();
    await page.waitForTimeout(500);
    await page.locator('[role="option"]').filter({ hasText: 'Negative Balance' }).click();

    // Wait for the table to update with filter results
    await page.waitForTimeout(2000);
    await page.waitForSelector('table', { timeout: 30000 });

    const elapsed = Date.now() - start;
    test.info().annotations.push({
      type: 'performance',
      description: `Balance filter loaded in ${elapsed}ms`,
    });
    // After optimization should be well under 10s
    expect(elapsed).toBeLessThan(10000);
  });

  test('RPC get_members_bulk_unpaid_totals succeeds with 200', async ({ page }) => {
    const rpcResponse = page.waitForResponse(
      (res) => res.url().includes('get_members_bulk_unpaid_totals') && res.status() === 200
    );

    await page.goto('/members');
    await page.waitForSelector('table', { timeout: 30000 });

    // Trigger balance filter
    await page.locator('text=All Balances').click();
    await page.waitForTimeout(300);
    await page.locator('[role="option"]').filter({ hasText: 'Negative Balance' }).click();

    const response = await rpcResponse;
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('no per-member get_member_total_due RPC calls', async ({ page }) => {
    const rpcCalls: string[] = [];
    page.on('response', (res) => {
      if (res.url().includes('/rpc/')) {
        rpcCalls.push(res.url());
      }
    });

    await page.goto('/members');
    await page.waitForSelector('table', { timeout: 30000 });

    const totalDueCalls = rpcCalls.filter(u => u.includes('get_member_total_due'));
    const unpaidCalls = rpcCalls.filter(u => u.includes('get_member_unpaid_case_obligations'));
    expect(totalDueCalls.length).toBe(0);
    expect(unpaidCalls.length).toBe(0);
  });
});
