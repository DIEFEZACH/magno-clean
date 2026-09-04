import { expect, test } from '@playwright/test';

const widths = [320, 360, 375, 390, 430, 600, 768, 820, 1024, 1280, 1366, 1440, 1920];

test('legal headings fit every certified viewport without hiding overflow', async ({ page }) => {
  // Keep this UI regression isolated: it must never reach a real backend.
  await page.route('http://api.media-b.test/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    await route.fulfill({ status: pathname.includes('/auth/') ? 401 : 200, contentType: 'application/json', body: JSON.stringify({ checkoutEnabled: false }) });
  });
  for (const [pathname, title] of [
    ['/privacidad', 'Aviso de privacidad'],
    ['/terminos', 'Términos y condiciones'],
    ['/devoluciones', 'Cambios y devoluciones'],
  ]) {
    await page.goto(pathname);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      const measured = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth, overflowX: getComputedStyle(document.documentElement).overflowX }));
      expect(measured.viewport).toBe(width);
      expect(measured.scroll, `${pathname} at ${width}px`).toBeLessThanOrEqual(width);
      expect(measured.overflowX).not.toBe('hidden');
    }
  }
});
