# 看我笑話工作室

「看我笑話工作室」現場演出用的網頁工具集。每個企劃一個網頁，陸續增加中。

## 企劃列表

| 企劃 | 網頁 | 說明 |
|------|------|------|
| 看我摸牌 | [mahjong-draw.html](mahjong-draw.html) | 即興劇用的麻將抽牌機：按空白鍵或「摸牌」抽出一張臺灣麻將，顯示牌面與唸法，演員須將其加入臺詞 |
| 看我動作片 | [action-draw.html](action-draw.html) | 即興劇用的肢體動作抽籤機：按空白鍵抽出一個動作圖（畫面上只有圖、沒有文字），演員須將該動作融入劇情。多回合制，**一個資料夾＝一個回合**（動作／動漫／迷因⋯⋯），抽完一回合自動換下一個圖庫。圖片來源＝網站上的圖（保底）＋ Google Drive（開場對照、有新圖即時補；讀不到就略過）。沒有任何照片時用內建的 30 個火柴人。操作與檔名規則見 [action-poses/README.md](action-poses/README.md)，Drive 端程式見 [drive-images.gs](drive-images.gs) |
| 現場抽籤機 | [comment-lottery.html](comment-lottery.html) | 觀眾留言抽籤機：觀眾掃 QR Code 填 Google 表單，現場隨機抽出留言，同回合不重複 |

## 使用方式

線上入口（工具箱首頁）：https://allen365apple.github.io/jokes-on-me/

也可以直接用瀏覽器開啟對應的 HTML 檔案，不需要安裝任何東西。

## 之後新增企劃

- 單一檔案的企劃：直接放在根目錄，如 `企劃名稱.html`
- 有多個檔案（圖片、音效等）的企劃：開一個資料夾，如 `企劃名稱/index.html`
- 新增後記得回來更新上面的企劃列表
