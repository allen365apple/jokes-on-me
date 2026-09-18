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
  function createDeck(random = Math.random) {
    const used = new Map();
    return {
      draw(key, records, eligible = () => true) {
        const pool = records.filter(eligible);
        if (!pool.length) return null;
        let seen = used.get(key) || new Set();
        let available = pool.filter(r => !seen.has(r.id));
        if (!available.length) { seen = new Set(); available = pool; }
        const choice = available[Math.floor(random() * available.length)];
        seen.add(choice.id); used.set(key, seen);
        return choice;
      },
      reset() { used.clear(); }
    };
  }
  const api = { fields, names, limits, valid, createDeck };
  root.ShowCore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
