/**
 * 看我動作片｜Drive 圖庫清單 API
 * =====================================================================
 * 功能：把 Google Drive 那個「看我動作片 圖片素材」資料夾底下，
 *      每個子資料夾（＝一個回合）裡有哪些圖片，整理成 JSON 給網頁讀。
 *
 * 部署步驟（跟工具箱編輯功能同一套）：
 *   1. 到 https://script.google.com 建立新專案，把這整份貼進去
 *   2. 右上角「部署」→「新增部署作業」→ 類型選「網頁應用程式」
 *   3. 執行身分：我自己　／　誰可以存取：「所有人」
 *   4. 部署完會給你一個 .../exec 結尾的網址
 *   5. 把那個網址填進 action-poses/drive.json 的 "url"
 *
 * 注意：這支只讀不寫，不會動到 Drive 裡的任何檔案。
 * =====================================================================
 */

/* 「看我動作片 圖片素材」資料夾 ID（網址中 /folders/ 後面那一長串） */
const ROOT_FOLDER_ID = '1_VGFhvX1W83B0_BHHiRHZ1t2AyMDOtFG';

function doGet() {
  var out = { ok: false, groups: [] };
  try {
    var root = DriveApp.getFolderById(ROOT_FOLDER_ID);
    var groups = [];

    var folders = root.getFolders();
    while (folders.hasNext()) {
      var f = folders.next();
      groups.push({ name: f.getName(), files: walk(f, '') });
    }

    /* 如果根目錄自己就直接放圖（沒有分子資料夾），也當成一個回合 */
    var loose = listImages(root, '');
    if (loose.length) groups.push({ name: root.getName(), files: loose });

    groups.sort(function (a, b) { return a.name.localeCompare(b.name, 'zh-Hant'); });
    out = { ok: true, groups: groups, time: new Date().toISOString() };
  } catch (err) {
    out = { ok: false, error: String(err) };
  }
  return ContentService
    .createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 走訪一個回合資料夾，連同底下的子資料夾（例如「雙人照」）一起收。
 * 子資料夾裡的圖會標上 sub＝子資料夾名稱，網頁會把它當成一個「類別」，
 * 控制台就能單獨調整它的出現比例。
 */
function walk(folder, prefix) {
  var files = listImages(folder, prefix);
  var subs = folder.getFolders();
  while (subs.hasNext()) {
    var s = subs.next();
    var name = prefix ? prefix + ' ' + s.getName() : s.getName();
    files = files.concat(walk(s, name));
  }
  return files;
}

function listImages(folder, sub) {
  var files = [];
  var it = folder.getFiles();
  while (it.hasNext()) {
    var file = it.next();
    var mime = file.getMimeType() || '';
    if (mime.indexOf('image/') !== 0) continue;      /* 只要圖片 */
    var item = { id: file.getId(), name: file.getName() };
    if (sub) item.sub = sub;
    files.push(item);
  }
  files.sort(function (a, b) { return a.name.localeCompare(b.name, 'zh-Hant'); });
  return files;
}

/* 在編輯器裡按「執行」跑這個，可以先確認讀得到東西（看下方紀錄） */
function 測試() {
  var r = JSON.parse(doGet().getContent());
  if (!r.ok) { Logger.log('讀取失敗：' + r.error); return; }
  Logger.log('共 ' + r.groups.length + ' 個回合');
  r.groups.forEach(function (g) {
    var subs = {};
    g.files.forEach(function (f) { var k = f.sub || '（直接放）'; subs[k] = (subs[k] || 0) + 1; });
    Logger.log('  ' + g.name + '：' + g.files.length + ' 張　' + JSON.stringify(subs));
  });
}
