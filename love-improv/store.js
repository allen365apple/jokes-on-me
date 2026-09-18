'use strict';
window.ShowStore = (() => {
  const config = window.SHOW_CONFIG;
  const key = 'astra-v1:' + config.room;
  let records = [], open = true, db = null, sdk = null;
  let moderation = {}, auth = null, authSdk = null, user = null, canManage = !config || config.mode !== 'firebase';
  let stopPrivate = [];
  const listeners = new Set();
  let status = '本機';
  const live = config.mode === 'firebase';
  function publish() {
    const allRecords = records.map(r => ({ ...r, moderation: moderation[r.id]?.state || 'active' }));
    listeners.forEach(fn => fn({ records: allRecords.filter(r => r.moderation === 'active'), allRecords, open, status, live, user, canManage }));
  }
  function readLocal() {
    const data = JSON.parse(localStorage.getItem(key) || '{"records":[],"open":true}');
    records = Array.isArray(data.records) ? data.records : [];
    open = data.open !== false;
    moderation = data.moderation || {};
  }
  function saveLocal() { localStorage.setItem(key, JSON.stringify({ records, open, moderation })); publish(); }
  /** 登入或登出時先清除記憶體中的私人資料，再依資料庫管理員名單訂閱。 */
  function subscribePrivate(nextUser) {
    stopPrivate.forEach(stop => stop()); stopPrivate = [];
    user = nextUser; records = []; moderation = {}; canManage = false;
    status = user ? '確認中' : '請登入'; publish();
    if (!user) return;
    const denied = () => { status = '無權限'; canManage = false; records = []; moderation = {}; publish(); };
    const sharedAdmin = String(user.email || '').toLowerCase() === String(config.adminEmail || '').toLowerCase();
    if (sharedAdmin) {
      canManage = true; status = '已登入'; publish();
      subscribeManaged();
      return;
    }
    stopPrivate.push(sdk.onValue(sdk.ref(db, 'operators/' + user.uid), snap => {
      // 權限異動時取消舊訂閱，避免登出或撤權後繼續顯示舊答案。
      stopPrivate.splice(1).forEach(stop => stop()); records = []; moderation = {};
      canManage = snap.val() === true;
      status = canManage ? '已連線' : '未授權'; publish();
      if (!canManage) return;
      if (!canManage) return;
      subscribeManaged();
    }, denied));
    function subscribeManaged() {
      const base = 'rooms/' + config.room;
      let moderationReady = false, responsesReady = false, incoming = [];
      const publishReady = () => { if (moderationReady && responsesReady) { records = incoming; publish(); } };
      stopPrivate.push(sdk.onValue(sdk.ref(db, base + '/moderation'), snap => { moderation = snap.val() || {}; moderationReady = true; publishReady(); }, denied));
      stopPrivate.push(sdk.onValue(sdk.ref(db, base + '/responses'), snap => {
        incoming = Object.entries(snap.val() || {}).map(([id, r]) => ({ ...r, id })); responsesReady = true; publishReady();
      }, denied));
    }
  }
  /** 僅標記投稿狀態，不刪除或改寫原始回答；整批採一次原子更新。 */
  async function mark(ids, state) {
    if (!canManage) throw new Error('請先以管理員登入');
    if (!live) readLocal();
    const validIds = new Set(records.map(r => r.id));
    if (ids.some(id => !validIds.has(id))) throw new Error('投稿已變動，請重新整理');
    const changes = {};
    ids.forEach(id => {
      changes[id] = { state, at: live ? sdk.serverTimestamp() : Date.now(), by: user?.uid || 'local' };
    });
    if (live) await sdk.update(sdk.ref(db, 'rooms/' + config.room + '/moderation'), changes);
    else { Object.assign(moderation, changes); saveLocal(); }
  }
  /** 初始化本機彩排或獨立 Firebase；不會連到原始專案。 */
  async function init() {
    if (!live) {
      try { readLocal(); } catch (_) { status = '儲存錯誤'; }
      publish(); return;
    }
    const f = config.firebase;
    if (!f.databaseURL || f.projectId === 'conte-affair') {
      status = '未設定'; publish(); return;
    }
    try {
      const app = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
      sdk = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');
      const instance = app.initializeApp(f);
      db = sdk.getDatabase(instance);
      authSdk = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
      auth = authSdk.getAuth(instance);
      authSdk.onAuthStateChanged(auth, subscribePrivate);
      sdk.onValue(sdk.ref(db, 'rooms/' + config.room + '/control/submitOpen'), snap => { open = snap.val() === true; publish(); });
      sdk.onValue(sdk.ref(db, '.info/connected'), snap => { if(canManage)status = snap.val() ? '已連線' : '離線'; publish(); });
    } catch (_) { status = '連線失敗'; publish(); }
  }
  addEventListener('storage', e => {
    if (e.key !== key) return;
    try { readLocal(); publish(); } catch (_) {}
  });
  return {
    live, key, init,
    /** 共用後台密碼登入；Firebase 伺服器驗證，登入狀態下再次點擊則登出。 */
    async login(password) {
      if (!auth) throw new Error('登入尚未就緒，請稍後重試');
      if (user) return authSdk.signOut(auth);
      if (!config.adminEmail) throw new Error('網站版本尚未更新，請重新整理頁面');
      if (!password) throw new Error('請輸入後台密碼');
      try { await authSdk.signInWithEmailAndPassword(auth, config.adminEmail, password); }
      catch (e) { throw new Error(e.code === 'auth/invalid-credential' ? '密碼錯誤' : '登入未完成（' + e.code + '），請確認 Email／Password 登入已啟用'); }
    },
    loggedIn() { return Boolean(user); },
    setIgnored(id, ignored) { return mark([id], ignored ? 'ignored' : 'active'); },
    restore(id) { return mark([id], 'active'); },
    archive(ids) { return mark(ids, 'archived'); },
    subscribe(fn) { listeners.add(fn); publish(); },
    async toggle() {
      if (!canManage) throw new Error('請先以管理員登入');
      if (live) {
        if (!db) throw new Error('尚未連線');
        await sdk.set(sdk.ref(db, 'rooms/' + config.room + '/control/submitOpen'), !open);
      } else { readLocal(); open = !open; saveLocal(); }
    },
    async submit(record) {
      if (live) {
        const base = config.firebase.databaseURL.replace(/\/$/, '');
        if (!base || config.firebase.projectId === 'conte-affair') throw new Error('請設定獨立資料庫');
        const gate = await fetch(base + '/rooms/' + config.room + '/control/submitOpen.json');
        if (!gate.ok || await gate.json() !== true) throw new Error('投稿尚未開放');
        const res = await fetch(base + '/rooms/' + config.room + '/responses.json', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ ...record, ts: {'.sv':'timestamp'} }),
        });
        if (!res.ok) throw new Error('送出失敗，請確認網路或投稿權限');
      } else {
        readLocal();
        if (!open) throw new Error('投稿已截止');
        records.push({ ...record, id: crypto.randomUUID(), ts: Date.now() });
        saveLocal();
      }
    },
    /** 僅供本機彩排一次加入示範答案，保留原有投稿。 */
    seed(data) {
      if (live) return;
      readLocal();
      const ids = new Set(records.map(r => r.id));
      records.push(...data.filter(r => !ids.has(r.id)));
      saveLocal();
    }
  };
})();
