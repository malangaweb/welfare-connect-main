import { chromium } from 'playwright';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4173';
const viewport = { width: Number(process.env.MOBILE_WIDTH || 375), height: 812 };
const now = Math.floor(Date.now() / 1000);
const token = `header.${Buffer.from(JSON.stringify({ exp: now + 3600 })).toString('base64url')}.signature`;
const user = {
  id: 'mobile-audit-user',
  username: 'mobile-audit',
  name: 'Mobile Audit',
  role: 'super_admin',
  isActive: true,
};

const routes = [
  { name: 'login', path: '/login', authenticated: false },
  { name: 'dashboard', path: '/dashboard', authenticated: true },
  { name: 'members', path: '/members', authenticated: true },
  { name: 'cases', path: '/cases', authenticated: true },
  { name: 'transactions', path: '/transactions', authenticated: true },
  { name: 'accounts', path: '/accounts', authenticated: true },
  { name: 'reports', path: '/reports', authenticated: true },
  { name: 'fiscal-reports', path: '/reports/fiscal', authenticated: true },
  { name: 'compliance-reports', path: '/reports/compliance', authenticated: true },
  { name: 'settings', path: '/settings', authenticated: true },
  { name: 'users', path: '/users', authenticated: true },
  { name: 'member-dashboard', path: '/member/dashboard', member: true },
  { name: 'member-summary', path: '/member/summary', member: true },
  { name: 'member-cases', path: '/member/cases', member: true },
  { name: 'member-transactions', path: '/member/transactions', member: true },
  { name: 'member-report', path: '/member/report', member: true },
  { name: 'member-dependants', path: '/member/dependants', member: true },
];

const browser = await chromium.launch({ headless: true });
const report = [];

for (const route of routes) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();

  if (route.authenticated || route.member) {
    await page.addInitScript(({ token: appToken, user: currentUser }) => {
      localStorage.setItem('app_token', appToken);
      localStorage.setItem('token', appToken);
      localStorage.setItem('currentUser', JSON.stringify(currentUser));
      localStorage.setItem('member_member_id', 'mobile-audit-member');
      localStorage.setItem('member_name', 'Mobile Audit Member');
    }, { token, user });
  }

  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto(`${baseUrl}${route.path}`, { waitUntil: 'domcontentloaded' });
  await page.locator('body').waitFor({ state: 'visible' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.screenshot({ path: `/tmp/mobile-${route.name}.png`, fullPage: true });

  const analysis = await page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const documentWidth = document.documentElement.scrollWidth;
    const overflowing = Array.from(document.querySelectorAll('body *'))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return {
          tag: element.tagName.toLowerCase(),
          text: (element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100),
          className: typeof element.className === 'string' ? element.className.slice(0, 160) : '',
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          overflowX: style.overflowX,
        };
      })
      .filter((item) => item.width > 0 && item.right > viewportWidth + 1 && item.left >= -1)
      .slice(0, 30);

    const tabLists = Array.from(document.querySelectorAll('[role="tablist"]')).map((tabList) => ({
      text: (tabList.textContent || '').trim().replace(/\s+/g, ' '),
      clientWidth: tabList.clientWidth,
      scrollWidth: tabList.scrollWidth,
      overflows: tabList.scrollWidth > tabList.clientWidth + 1,
    }));

    const fixedElements = Array.from(document.querySelectorAll('body *'))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return {
          tag: element.tagName.toLowerCase(),
          id: element.id,
          className: typeof element.className === 'string' ? element.className.slice(0, 160) : '',
          src: element instanceof HTMLImageElement ? element.src : '',
          position: style.position,
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      })
      .filter((item) => item.position === 'fixed' && item.width > 0 && item.height > 0);

    return {
      title: document.title,
      path: window.location.pathname,
      viewportWidth,
      documentWidth,
      bodyWidth: document.body.scrollWidth,
      horizontalOverflow: documentWidth > viewportWidth + 1,
      overflowing,
      tabLists,
      fixedElements,
    };
  });

  report.push({ route: route.name, ...analysis, consoleErrors });
  await context.close();
}

await browser.close();
console.log(JSON.stringify(report, null, 2));
