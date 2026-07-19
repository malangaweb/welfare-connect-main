import { chromium } from 'playwright';

const now = Math.floor(Date.now() / 1000);
const token = `header.${Buffer.from(JSON.stringify({ exp: now + 3600 })).toString('base64url')}.signature`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
const page = await context.newPage();

await page.addInitScript(({ appToken }) => {
  localStorage.setItem('app_token', appToken);
  localStorage.setItem('token', appToken);
  localStorage.setItem('currentUser', JSON.stringify({
    id: 'mobile-audit-user', username: 'mobile-audit', name: 'Mobile Audit', role: 'super_admin', isActive: true,
  }));
}, { appToken: token });

await page.goto('http://127.0.0.1:4173/members', { waitUntil: 'domcontentloaded' });
await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

const inspect = () => page.evaluate(() => {
  const main = document.querySelector('main');
  const metric = (element) => element && ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
    overflowY: getComputedStyle(element).overflowY,
  });
  return {
    window: { innerHeight: window.innerHeight, scrollY: window.scrollY },
    html: metric(document.documentElement),
    body: metric(document.body),
    root: metric(document.getElementById('root')),
    main: metric(main),
  };
});

console.log('before', JSON.stringify(await inspect()));
await page.locator('main').hover();
await page.mouse.wheel(0, 5000);
console.log('after-wheel-scroll', JSON.stringify(await inspect()));
await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
console.log('after-document-scroll', JSON.stringify(await inspect()));
await page.screenshot({ path: '/tmp/mobile-members-scroll-bottom.png' });

await context.close();
await browser.close();
