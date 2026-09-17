# 看我戀愛

目前主要網站直接位於「簡報即興劇」，採用 Astra 版本並已接上 Firebase Realtime Database。從此在這個目錄修改，不再到封存版本工作。

## 開啟網站

在這個目錄執行：

```sh
python3 -m http.server 8766 --bind 127.0.0.1
```

開啟 http://127.0.0.1:8766/ 。`index.html` 會導向舞台頁。

| 入口 | 用途 | 搭配的程式 |
|---|---|---|
| `stage.html` | 開場、選角、投影、控制台 | `stage.js`、`stage.css`、`original-scenes.css` |
| `submit.html` | 觀眾投稿 | `submit.js`、`questions.js`、`forms.css` |
| `submit.html?edit=1` | 編輯題目（目前只存在該瀏覽器） | 與投稿頁共用 |
| `peek-k7x2.html` | 查看投稿答案 | `peek.js`、`forms.css` |

## 檔案關係

- **共用資料**：`firebase-config.js` 指定 Firebase 與場次，`store.js` 處理讀寫，`core.js` 負責答案驗證及抽選。
- **演員**：`cast-config.js` 定義名字、照片路徑；`profiles/` 放演員照片及限動頭像。選角頁的「設定演員」可調整每位角色照片的左右、上下裁切位置與大小，設定保存在目前瀏覽器。
- **試玩**：`trial-data.js` 搭配 `trial-photos/`，控制台切換試玩來源。
- **其他素材**：`音效/` 放音效，`vendor/` 放本機 QR Code 程式。
- **文件**：`docs/` 放 Firebase 管理設定、公開發布說明與協作紀錄。
- **測試**：`tests/` 放核心及瀏覽器測試；瀏覽器測試使用隔離本機資料，不寫 Firebase。
- **封存**：`_archive/` 保留所有舊版本、舊企劃文件、停用素材。新整理的完整副本在 `_archive/2026-09-17-consolidation/`，其中 `previous-root/` 是原主目錄，`Astra/` 是本次修改前版本。

網站用到的檔案保留原本相對路徑，避免素材、投稿或 QR 入口失效。封存與文件不是網站發布內容。

## 操作

`S` 選角、`C` 控制台、`H` 開場、`Q` 投稿 QR、`T` 切換現場／試玩題庫。選滿兩人後按 Enter 開始；`1／2` 顯示兩位主角，`3` 浪漫、`4` 聊天、`5` 地圖、`6` 限動、`7` 相簿、`8` 金句。

同來源答案抽完一輪才重抽；`R` 重設抽選進度，`F` 全螢幕，`O／E` 開頭／結尾音樂。

## 維護

每次修改先看 `docs/協作紀錄.md`，完成後追加修改內容與驗證結果。歷史規格僅供參考，以目前使用者決定、現有網站與最新紀錄為準。

```sh
node tests/core.test.js
node tests/browser.test.cjs
```

瀏覽器測試需要 Playwright、本機 Chrome 與 8766 伺服器；可設定 `PLAYWRIGHT_PATH` 指向既有套件。

正式 Firebase 連線使用 `jokes-on-me-live-2026` room；觀眾可在開放時投稿，管理員以 Firebase Email／Password 共用帳號登入後台。後台以 moderation 標記忽略或封存投稿，不刪除原始 responses。Rules 請依 `database.rules.json` 發布；密碼不放入程式或 Git。
