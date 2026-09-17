'use strict';
window.ShowStore = (() => {
  const config = window.SHOW_CONFIG;
  const key = 'astra-v1:' + config.room;
  let records = [], open = true, db = null, sdk = null;
  const listeners = new Set();
  let status = '本機彩排';
  const live = config.mode === 'firebase';
  function publish() { listeners.forEach(fn => fn({ records: records.slice(), open, status, live })); }
  function readLocal() {
    const data = JSON.parse(localStorage.getItem(key) || '{"records":[],"open":true}');
    records = Array.isArray(data.records) ? data.records : [];
    open = data.open !== false;
  }
  function saveLocal() { localStorage.setItem(key, JSON.stringify({ records, open })); publish(); }
  /** 初始化本機彩排或獨立 Firebase；不會連到原始專案。 */
  async function init() {
    if (!live) {
      try { readLocal(); } catch (_) { status = '本機儲存不可用'; }
      publish(); return;
    }
    const f = config.firebase;
    if (!f.databaseURL || f.projectId === 'conte-affair') {
      status = '請設定獨立 Firebase 專案'; publish(); return;
    }
    try {
      const app = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
      sdk = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');
      db = sdk.getDatabase(app.initializeApp(f));
      sdk.onValue(sdk.ref(db, 'rooms/' + config.room + '/responses'), snap => {
        records = Object.entries(snap.val() || {}).map(([id, r]) => ({ ...r, id })); publish();
      }, () => { status = '讀取遭拒，請確認權限'; publish(); });
      sdk.onValue(sdk.ref(db, 'rooms/' + config.room + '/control/submitOpen'), snap => { open = snap.val() === true; publish(); });
      sdk.onValue(sdk.ref(db, '.info/connected'), snap => { status = snap.val() ? '已連線' : '離線：使用已載入答案'; publish(); });
    } catch (_) { status = '連線失敗：使用已載入答案'; publish(); }
  }
  addEventListener('storage', e => {
    if (e.key !== key) return;
    try { readLocal(); publish(); } catch (_) {}
  });
  return {
    live, key, init,
    subscribe(fn) { listeners.add(fn); publish(); },
    async toggle() {
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
