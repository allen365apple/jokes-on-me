(function (root) {
  'use strict';
  const fields = [null, 'tags', 'romanticGesture', 'awkwardLine', 'location', 'igStory', 'photo', 'awkwardLine'];
  const names = ['', '標籤', '浪漫', '聊天', '地圖', '限動', '相簿', '金句'];
  const limits = { nick: 8, tag: 10, romanticGesture: 24, awkwardLine: 24, location: 20, igStory: 30 };
  /** 驗證指定欄位，拒絕空值、超長文字與不安全的圖片來源。 */
  function valid(field, value) {
    if (field === 'tags') return Array.isArray(value) && value.length === 3 && value.every(v => typeof v === 'string' && v.trim() && [...v].length <= limits.tag);
    if (field === 'photo') return typeof value === 'string' && ((/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value) && value.length <= 512000) || /^https:\/\/images\.unsplash\.com\//.test(value) || /^trial-photos\/[\w-]+\.jpg$/.test(value));
    return typeof value === 'string' && !!value.trim() && [...value].length <= (limits[field] || 24);
  }
  /** 動態答案池：一輪不重複，容許新投稿加入；移除的答案不再抽出。 */
  function createDeck(random = Math.random, snapshot = {}, onChange = () => {}) {
    const used = new Map(Object.entries(snapshot).map(([key, values]) => [key, new Set(values)]));
    const fingerprints = new Map();
    const fingerprint = value => {
      if (fingerprints.has(value)) return fingerprints.get(value);
      const text = JSON.stringify(typeof value === 'string' ? value.normalize('NFKC').trim() : value);
      let a = 2166136261, b = 5381;
      for (const c of text) { a = Math.imul(a ^ c.charCodeAt(0), 16777619); b = Math.imul(b, 33) ^ c.charCodeAt(0); }
      const result = text.length + ':' + (a >>> 0) + ':' + (b >>> 0);
      fingerprints.set(value, result);
      return result;
    };
    return {
      draw(key, records, eligible = () => true) {
        const token = r => fingerprint(r[key] ?? r.id);
        const pool = [...new Map(records.filter(eligible).map(r => [token(r), r])).values()];
        if (!pool.length) return null;
        let seen = used.get(key) || new Set();
        let available = pool.filter(r => !seen.has(token(r)));
        if (!available.length) { seen = new Set(); available = pool; }
        const choice = available[Math.floor(random() * available.length)];
        seen.add(token(choice)); used.set(key, seen); onChange();
        return choice;
      },
      snapshot() { return Object.fromEntries([...used].map(([key, values]) => [key, [...values]])); },
      reset() { used.clear(); onChange(); }
    };
  }
  const api = { fields, names, limits, valid, createDeck };
  root.ShowCore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
