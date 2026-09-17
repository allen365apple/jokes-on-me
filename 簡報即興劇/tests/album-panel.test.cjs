'use strict';
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext();
    await context.route('**/firebase-config.js**', route => route.fulfill({
      contentType: 'application/javascript',
      body: "window.SHOW_CONFIG={mode:'local',room:'album-panel-test',firebase:{}};"
    }));
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:8766/stage.html');
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('4 筆'));
    await page.locator('#consoleBtn').click();
    assert(await page.locator('#controlPanel').evaluate(el => el.classList.contains('open')));
    await page.locator('#controlPanel').click({ position: { x: 8, y: 8 } });
    assert(await page.locator('#controlPanel').evaluate(el => el.classList.contains('open')));
    await page.locator('.brand').click();
    assert.equal(await page.locator('#controlPanel').evaluate(el => el.classList.contains('open')), false);
    await page.keyboard.press('c');
    assert(await page.locator('#controlPanel').evaluate(el => el.classList.contains('open')));
    await page.locator('#consoleBtn').click();
    assert.equal(await page.locator('#controlPanel').evaluate(el => el.classList.contains('open')), false);
    await page.locator('.cast-card').nth(0).click();
    await page.locator('.cast-card').nth(1).click();
    await page.locator('#start').click();
    await page.keyboard.press('7');
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }, { width: 1280, height: 720 }]) {
      await page.setViewportSize(viewport);
      for (const [width, height] of [[600, 3000], [1600, 900]]) {
        await page.locator('#albumImage').evaluate((el, size) => {
          el.src = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}"><rect width="100%" height="100%" fill="pink"/></svg>`);
          el.classList.toggle('portrait', size.height > size.width);
        }, { width, height });
        await page.waitForFunction(() => document.querySelector('#albumImage').complete);
        const bounds = await page.locator('#albumImage').evaluate(el => {
          const rect = el.getBoundingClientRect();
          const stage = document.querySelector('#viewport').getBoundingClientRect();
          const style = getComputedStyle(el);
          return { top: rect.top, bottom: rect.bottom, stageBottom: stage.bottom, fit: style.objectFit, position: style.objectPosition };
        });
        assert.equal(bounds.fit, 'contain');
        assert.equal(bounds.position, '50% 0%');
        assert(bounds.bottom <= bounds.stageBottom, JSON.stringify(bounds));
      }
    }
    console.log('PASS：直式／橫式照片完整縮放、三種桌面比例、控制台內外點擊與 C 快捷鍵');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
