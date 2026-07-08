/**
 * 看我笑話工具箱｜工具清單 寫入通道
 * 部署方式見 README（或問 AI）。貼在「工具清單」試算表的 Apps Script 裡。
 */

// 工作人員密碼：自己改成團隊要用的（網頁上填的要跟這裡一樣）
const PASSWORD = '請自訂密碼';

function doPost(e) {
  const out = { ok: false };
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.password !== PASSWORD) {
      out.error = '密碼錯誤';
      return json_(out);
    }
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    const row = body.row || {};
    const values = [row['分類'], row['名稱'], row['描述'], row['網址'], row['圖示'], row['開新分頁'], row['額外說明'] || ''];

    if (body.action === 'verify') {
      out.ok = true;
    } else if (body.action === 'add') {
      sh.appendRow(values);
      out.ok = true;
    } else if (body.action === 'update') {
      const r = parseInt(body.rowIndex, 10); // 資料列（不含標題列），第 1 筆 = 試算表第 2 列
      if (!(r >= 1)) throw new Error('rowIndex 不正確');
      sh.getRange(r + 1, 1, 1, 7).setValues([values]);
      out.ok = true;
    } else if (body.action === 'delete') {
      const r = parseInt(body.rowIndex, 10);
      if (!(r >= 1)) throw new Error('rowIndex 不正確');
      sh.deleteRow(r + 1);
      out.ok = true;
    } else {
      out.error = '未知的動作';
    }
  } catch (err) {
    out.error = String(err && err.message ? err.message : err);
  }
  return json_(out);
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}
