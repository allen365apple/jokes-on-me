'use strict';
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const context=await browser.newContext();
    await context.route('**/firebase-config.js**',route=>route.fulfill({contentType:'application/javascript',body:"window.SHOW_CONFIG={mode:'local',room:'moderation-test',firebase:{}};"}));
    const stage=await context.newPage();await stage.goto('http://127.0.0.1:8766/stage.html');
    await stage.waitForFunction(()=>document.querySelector('#status').textContent.includes('4 筆'));
    assert.equal(await stage.locator('#poolToggle').textContent(),'現場題庫 T');
    await stage.keyboard.press('t');assert.equal(await stage.locator('#poolToggle').textContent(),'試玩題庫 T');
    await stage.keyboard.press('t');assert.equal(await stage.locator('#poolToggle').textContent(),'現場題庫 T');
    const peek=await context.newPage();await peek.goto('http://127.0.0.1:8766/peek-k7x2.html');
    await peek.waitForFunction(()=>document.querySelectorAll('#answers .answer-row').length===4);
    await peek.getByRole('button',{name:'忽略'}).first().click();
    await stage.waitForFunction(()=>document.querySelector('#poolStatus').textContent.includes('3 筆'));
    await peek.locator('[data-filter="ignored"]').click();
    assert.equal(await peek.locator('#answers .answer-row').count(),1);
    await peek.getByRole('button',{name:'恢復'}).click();
    await stage.waitForFunction(()=>document.querySelector('#poolStatus').textContent.includes('4 筆'));
    peek.once('dialog',d=>d.dismiss());await peek.locator('#archiveAll').click();
    assert.equal(await peek.evaluate(()=>JSON.parse(localStorage.getItem(ShowStore.key)).records.length),4);
    peek.once('dialog',d=>d.accept());await peek.locator('#archiveAll').click();
    await stage.waitForFunction(()=>document.querySelector('#poolStatus').textContent.includes('0 筆'));
    const snapshot=await peek.evaluate(()=>JSON.parse(localStorage.getItem(ShowStore.key)));
    assert.equal(snapshot.records.length,4);assert.equal(Object.values(snapshot.moderation).filter(m=>m.state==='archived').length,4);
    await peek.evaluate(async()=>{const r=JSON.parse(localStorage.getItem(ShowStore.key)).records[0];await ShowStore.submit({...r,nick:'新投稿'});});
    await stage.waitForFunction(()=>document.querySelector('#poolStatus').textContent.includes('1 筆'));
    await peek.locator('[data-filter="archived"]').click();assert.equal(await peek.locator('.answer-row').count(),4);
    await peek.getByRole('button',{name:'恢復'}).first().click();
    await stage.waitForFunction(()=>document.querySelector('#poolStatus').textContent.includes('2 筆'));
    await stage.keyboard.press('t');await stage.reload();
    await stage.waitForFunction(()=>document.querySelector('#poolStatus').textContent.includes('2 筆'));
    assert.equal(await stage.locator('#poolToggle').textContent(),'現場題庫 T');
    console.log('PASS：T 切換與現場預設、跨頁忽略／恢復、封存取消／確認、原始資料保留、新投稿不受影響');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
