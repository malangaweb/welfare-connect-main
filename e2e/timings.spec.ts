import { test, expect } from '@playwright/test';

test('measure each query in fetchMembers (server-side pagination path)', async ({ page }) => {
  // Login
  await page.goto('/login');
  await page.fill('input[name="username"]', 'Malingi');
  await page.fill('input[name="password"]', 'b1216170');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 20000 });

  // Capture timing of each network request
  const timings: { url: string; duration: number; status: number }[] = [];
  page.on('request', (req) => {
    (req as any)._startTime = Date.now();
  });
  page.on('response', async (res) => {
    const req = res.request();
    const start = (req as any)._startTime as number;
    if (start) {
      const duration = Date.now() - start;
      const url = res.url();
      if (url.includes('supabase.co') && (url.includes('/rest/') || url.includes('/rpc/'))) {
        timings.push({ url: url.replace(/.*supabase.co\/rest\/v1\//, ''), duration, status: res.status() });
      }
    }
  });

  await page.goto('/members');
  await page.waitForSelector('table', { timeout: 60000 });
  await page.waitForTimeout(2000);

  console.log('\n=== Network timings (initial load) ===');
  timings.sort((a, b) => b.duration - a.duration);
  for (const t of timings) {
    console.log(`  ${t.duration}ms  ${t.status}  ${t.url}`);
  }
  const total = timings.reduce((s, t) => s + t.duration, 0);
  console.log(`Total network time: ${total}ms across ${timings.length} requests`);
});

test('measure balance filter query timings', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name="username"]', 'Malingi');
  await page.fill('input[name="password"]', 'b1216170');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 20000 });

  await page.goto('/members');
  await page.waitForSelector('table', { timeout: 60000 });

  // Reset timings before triggering the filter
  const timings: { url: string; duration: number; status: number }[] = [];
  page.on('request', (req) => {
    (req as any)._startTime = Date.now();
  });
  page.on('response', async (res) => {
    const req = res.request();
    const start = (req as any)._startTime as number;
    if (start) {
      const duration = Date.now() - start;
      const url = res.url();
      if (url.includes('supabase.co') && (url.includes('/rest/') || url.includes('/rpc/'))) {
        timings.push({ url: url.replace(/.*supabase.co\/rest\/v1\//, ''), duration, status: res.status() });
      }
    }
  });

  // Trigger negative balance filter
  await page.locator('text=All Balances').click();
  await page.waitForTimeout(500);
  await page.locator('[role="option"]').filter({ hasText: 'Negative Balance' }).click();

  // Wait for table to settle (no overlay may appear if it's fast)
  await page.waitForTimeout(8000);

  console.log('\n=== Network timings (balance filter) ===');
  timings.sort((a, b) => b.duration - a.duration);
  for (const t of timings) {
    console.log(`  ${t.duration}ms  ${t.status}  ${t.url}`);
  }
  const total = timings.reduce((s, t) => s + t.duration, 0);
  console.log(`Total network time: ${total}ms across ${timings.length} requests`);
});
