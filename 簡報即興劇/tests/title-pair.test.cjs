'use strict';
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.route('**/firebase-config.js**', route => route.fulfill({ contentType: 'application/javascript', body: "window.SHOW_CONFIG={mode:'local',room:'title-pair-test',firebase:{}};" }));
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:8766/stage.html');
    await page.locator('.cast-card').nth(0).click();
    await page.locator('.cast-card').nth(1).click();
    await page.locator('#start').click();
    assert.equal(await page.locator('#titlePair img').count(), 2);
    assert.deepEqual(await page.locator('#titlePair img').evaluateAll(images => images.map(img => img.alt)), ['兔子', '柏文']);
    assert.equal((await page.locator('#titlePair').textContent()).trim(), '');
    assert.equal(await page.locator('#titleScreen h1').textContent(), '看我戀愛');
    await page.screenshot({ path: '/tmp/title-pair-moving.png' });
    await page.keyboard.press('1');
    assert.equal(await page.locator('#titleScreen').isVisible(), false);
    assert.equal(await page.locator('#actorName').textContent(), '兔子');
    await page.keyboard.press('h');
    await page.waitForFunction(() => [...document.querySelectorAll('#titlePair img')].every(img => img.complete && img.naturalWidth));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: '/tmp/title-pair-settled.png' });
    for (const viewport of [{ width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      assert(await page.locator('#titlePair').evaluate(el => [...el.children].every(card => {
        const r = card.getBoundingClientRect(), stage = document.querySelector('#viewport').getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth && r.bottom <= stage.bottom && r.top >= stage.top;
      })));
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.locator('.title-pair-card').first().evaluate(el => getComputedStyle(el).animationName), 'none');
    await page.keyboard.press('s');
    await page.locator('.cast-card').nth(2).click();
    await page.locator('.cast-card').nth(8).click();
    await page.locator('#start').click();
    assert.deepEqual(await page.locator('#titlePair img').evaluateAll(images => images.map(img => img.alt)), ['又又', '林靖']);
    console.log('PASS：配對雙照片、無額外文案、動畫中切換、重新選角、響應式及減少動態');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
