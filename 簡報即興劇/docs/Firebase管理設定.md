# Firebase 管理設定

## 一次性設定

1. Authentication → Sign-in method 啟用 **Email/Password**。
2. Authentication → Users → Add user，建立共用帳號：`stage-admin@jokes-on-me-3437e.firebaseapp.com`。密碼只在 Firebase Console 輸入，不寫進程式；夥伴在網站只需輸入密碼。
3. 本機舞台控制台或答案後台按「管理員登入」。Firebase 會記住這台瀏覽器的登入狀態；共用演出電腦不必每場重登。
4. `allen365apple@gmail.com` 或其他 Google 帳號仍可走 operators UID 授權，但共用密碼帳號不需要另外建立 UID 名單。
5. **先檢查現有 Rules 是否供其他應用使用**，備份現行規則；將本專案 `database.rules.json` 貼入 Realtime Database → 規則並發布。範本僅開放本專案場次，其餘路徑封鎖；若有其他應用，需合併規則而非整份覆蓋。
6. 正式公開連線前確認：未登入無法讀取 responses；未授權帳號不能修改 moderation／control；登入管理員能讀取答案。觀眾僅能在開放時新增合規回答，不能讀取、覆寫或刪除既有投稿。

## 操作

- 舞台右上「現場題庫 T」：點擊或按 T 切換試玩／現場，每次載入預設現場；控制台不再重複此按鈕。
- 後台固定檢視現場資料，不跟隨舞台切換試玩。
- 忽略整筆投稿：將 moderation 狀態設為 ignored，全部回答退出抽題池；可恢復。
- 清空本場（封存）：確認後，將當下已載入、尚未封存的投稿標記 archived；新投稿不在該快照內，不受影響。原始 responses 不移動、不刪除。
- 後台可切換「可抽選／已忽略／已封存」，逐筆恢復。
- Firebase Web 設定不是管理員憑證，真正授權由 Authentication 與伺服器 Rules 執行。服務帳戶私鑰不可放入網頁。共享密碼可以管理整個後台，應只交給演出夥伴；需要個別稽核時改回每人自己的帳號。
- 此方案不增加付費服務；公開投稿的防洗版／App Check 尚未建置，演出外建議截止投稿。

每次修改請在協作紀錄留下影響與驗證。規則與管理員名單需由有 Firebase Console 權限的人完成，不能僅靠前端宣告已安全。
