'use strict';
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.route('**/firebase-config.js**', route => route.fulfill({ contentType: 'application/javascript', body: "window.SHOW_CONFIG={mode:'local',room:'panel-design-test',firebase:{}};" }));
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:8766/stage.html');
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('4 筆'));
    await page.locator('#consoleBtn').click();
    await page.screenshot({ path: '/tmp/control-panel-redesign.png' });
    assert.equal(await page.locator('#controlPanel h3').count(), 2);
    assert.equal(await page.locator('#controlPanel #qrBtn, #controlPanel #introBtn, #controlPanel #reselect, #controlPanel #panelHome, #controlPanel .panel-shortcuts').count(), 0);
    assert.equal(await page.locator('#qrNavBtn, #homeBtn, #profileBtn').count(), 3);
    await page.locator('#poolToggle').click();
    assert.equal(await page.locator('#poolToggle').textContent(), '試玩題庫 T');
    assert(await page.locator('#controlPanel').evaluate(el => el.classList.contains('trial-mode')));
    await page.locator('#poolToggle').click();
    assert.equal(await page.locator('#poolToggle').textContent(), '現場題庫 T');
    await page.locator('#consoleBtn').click();
    const before = await page.locator('#submissionStatus').textContent();
    await page.locator('#toggleOpen').click();
    await page.waitForFunction(before => document.querySelector('#submissionStatus').textContent !== before, before);
    await page.locator('#fontScale').fill('115');
    assert.equal(await page.locator('#fontScaleValue').textContent(), '115%');
    await page.locator('.panel-advanced summary').click();
    assert(await page.locator('#resetDeck').isVisible());
    await page.locator('#resetDeck').click();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await page.locator('#controlPanel').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    }
    await page.locator('#closePanel').click();
    assert.equal(await page.locator('#controlPanel').isVisible(), false);
    console.log('PASS：控制台分區、題庫狀態、投稿開關、字級百分比、進階展開、桌機與手機無水平溢出');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
