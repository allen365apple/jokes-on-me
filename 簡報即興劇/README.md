# 看我戀愛

現場即興劇的投影與觀眾投稿工具，延伸自 https://github.com/jessechen-humanoid/conte-affair 。

此公開展示版只使用本機瀏覽器資料，不連正式 Firebase，也不會跨裝置同步投稿。彩排請在控制台切換試玩題庫。發布範圍與紀錄見 `docs/公開發布.md`。

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
- **演員**：`cast-config.js` 定義名字、照片路徑；`profiles/` 放演員照片及限動頭像。
- **試玩**：`trial-data.js` 搭配 `trial-photos/`，控制台切換試玩來源。
- **其他素材**：`音效/` 放音效，`vendor/` 放本機 QR Code 程式。
- **文件**：`docs/` 放公開發布說明與更新紀錄。
- **測試**：`tests/` 放核心及瀏覽器測試；瀏覽器測試使用隔離本機資料，不寫 Firebase。
- **未發布**：封存副本、待替換原圖、正式 Firebase 設定與內部協作歷史。

網站用到的檔案保留原本相對路徑。

## 操作

`S` 選角、`C` 控制台、`H` 開場、`Q` 投稿 QR。選滿兩人後按 Enter 開始；`1／2` 顯示兩位主角，`3` 浪漫、`4` 聊天、`5` 地圖、`6` 限動、`7` 相簿、`8` 金句。

同來源答案抽完一輪才重抽；`R` 重設抽選進度，`F` 全螢幕，`B／E` 襯底／結尾音樂。

## 維護

每次修改後在 `docs/公開發布.md` 追加修改內容與驗證結果；不要提交正式連線設定與私人素材。

```sh
node tests/core.test.js
node tests/browser.test.cjs
```

瀏覽器測試需要 Playwright、本機 Chrome 與 8766 伺服器；可設定 `PLAYWRIGHT_PATH` 指向既有套件。

正式資料庫權限與跨裝置題目同步仍是待辦。不可直接將未受保護的正式 Firebase 設定放入公開版。
