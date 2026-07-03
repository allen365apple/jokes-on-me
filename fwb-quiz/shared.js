// ═══════════════════════════════════════════════════════════
// 「績效考核」互動問答 — 共用層
// Supabase 連線、時鐘校正、Realtime+輪詢同步引擎、常數
// ═══════════════════════════════════════════════════════════
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// publishable key 本來就設計成可公開，真正的保護在資料庫 RLS
export const CONFIG = {
  url: 'https://tieobkzoxmrjmnqjjrxm.supabase.co',
  anonKey: 'sb_publishable_IXeAUUpk-ODv72j_ZoZmrw_h2U00cJ1',
  joinCode: new URLSearchParams(location.search).get('code') || 'FWB520',
};

export const sb = createClient(CONFIG.url, CONFIG.anonKey);

export async function rpc(name, args = {}) {
  const { data, error } = await sb.rpc(name, args);
  if (error) throw new Error(error.message || String(error));
  return data;
}

// ── 常數（桌次依座位圖：B3-B26 圓桌 + B30 包廂）──────────────
export const TABLE_IDS = Array.from({ length: 24 }, (_, i) => 'B' + (i + 3)).concat(['B30']);
export const SHAPES = ['▲', '◆', '●', '■'];
export const LETTERS = ['A', 'B', 'C', 'D'];

// 作答後文案：8 秒內快答誇獎、8 秒後慢答吐槽
export const FAST_SEC = 8;
export const FAST_QUIPS = [
  { e: '🚀', t: '這手速，下一季直接幫你加薪！' },
  { e: '⚡', t: '反應比老闆變臉還快，優秀！' },
  { e: '💰', t: '果斷！年終先幫你預留一份' },
  { e: '👑', t: '這決策速度，根本總監等級' },
  { e: '🏎️', t: '秒答！本月 KPI 直接達標' },
];
export const SLOW_QUIPS = [
  { e: '🤔', t: '思考有點久，很謹慎喔⋯' },
  { e: '🐢', t: '深思熟慮型人才，我懂' },
  { e: '☕', t: '想這麼久，是順便泡了杯咖啡？' },
  { e: '🧐', t: '謹慎是美德，但老闆在等你喔' },
  { e: '😅', t: '再想下去就要被約談了' },
];

// ── 小工具 ──────────────────────────────────────────────────
export const $ = s => document.querySelector(s);
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const secs = ms => (ms / 1000).toFixed(1);

// ── 時鐘校正：取 3 次 server_time，採 RTT 最小的那次 ─────────
export const clock = {
  offset: 0,
  synced: false,
  async sync() {
    let best = Infinity;
    for (let i = 0; i < 3; i++) {
      const t0 = Date.now();
      try {
        const server = await rpc('server_time');
        const rtt = Date.now() - t0;
        if (rtt < best) {
          best = rtt;
          this.offset = new Date(server).getTime() + rtt / 2 - Date.now();
        }
      } catch (e) { /* 單次失敗不致命 */ }
    }
    this.synced = best < Infinity;
  },
  now() { return Date.now() + this.offset; },
};

// ── 狀態正規化：Realtime 的資料列與 RPC 的 jsonb 進同一形狀 ──
export function normalizeState(x) {
  const ts = v => (v ? new Date(v).getTime() : null);
  return {
    sessionId: x.session_id ?? x.id,
    phase: x.phase,
    qindex: x.qindex ?? x.current_question_index,
    openAt: ts(x.question_open_at),
    deadline: ts(x.question_deadline),
    phaseUntil: ts(x.phase_until),
    syncMode: x.sync_mode,
    answeredCount: x.answered_count,
    playerCount: x.player_count,     // 只有 RPC 有
    questionCount: x.question_count, // 只有 RPC 有
  };
}

// ── 同步引擎 ────────────────────────────────────────────────
// Realtime 為主；背景固定跑慢速輪詢(5s)當保命心跳。
// Realtime 連線異常 → 輪詢加速到 1.5s，並持續嘗試重連。
// 主持人可用 sync_mode 強制全場走 Realtime 或輪詢。
// 不論資料從哪條路進來，都走同一個 onState()（規格書的 applySessionState）。
export function createSync({ sessionId, onState, onConn }) {
  const SLOW = 5000, FAST = 1500;
  let last = {};
  let pollMs = SLOW, pollTimer = null, channel = null;
  let degraded = false, stopped = false, retryTimer = null;

  function deliver(partial) {
    for (const [k, v] of Object.entries(partial)) if (v !== undefined) last[k] = v;
    onState({ ...last });
    applyMode();
  }
  async function poll() {
    try { deliver(normalizeState(await rpc('get_session_state', { p_session_id: sessionId }))); }
    catch (e) { console.warn('[sync] poll 失敗', e.message); }
  }
  function schedule() { clearInterval(pollTimer); pollTimer = setInterval(poll, pollMs); }
  function setPollMs(ms) { if (ms !== pollMs) { pollMs = ms; schedule(); } }

  function applyMode() {
    if (stopped) return;
    if (last.syncMode === 'force_polling') { teardown(); setPollMs(FAST); report(); return; }
    if (!channel) setup();
    setPollMs(degraded ? FAST : SLOW);
    report();
  }
  function report() { if (onConn) onConn({ degraded, mode: last.syncMode, realtime: !!channel && !degraded }); }
  function teardown() { if (channel) { sb.removeChannel(channel); channel = null; } }
  function setup() {
    channel = sb.channel('session-' + sessionId)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions', filter: 'id=eq.' + sessionId },
        payload => { degraded = false; deliver(normalizeState(payload.new)); })
      .subscribe(status => {
        if (stopped) return;
        if (status === 'SUBSCRIBED') { degraded = false; poll(); applyMode(); }
        if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
          degraded = true; applyMode();
          clearTimeout(retryTimer);
          retryTimer = setTimeout(() => {           // 背景嘗試重連
            if (!stopped && degraded && last.syncMode !== 'force_polling') { teardown(); setup(); }
          }, 8000);
        }
      });
  }

  // 頁面切回前景 / 網路恢復時立刻補抓一次（手機常見情境）
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !stopped) poll(); });
  window.addEventListener('online', () => { if (!stopped) poll(); });

  return {
    start() { poll(); setup(); schedule(); },
    stop() { stopped = true; teardown(); clearInterval(pollTimer); clearTimeout(retryTimer); },
    refetch: poll,
    get state() { return { ...last }; },
  };
}

// ── 排名工具（與後端 get_rankings 的排序一致）────────────────
export function findMyRank(individuals, playerId) {
  const idx = individuals.findIndex(p => p.player_id === playerId);
  return { idx, me: idx >= 0 ? individuals[idx] : null, prev: idx > 0 ? individuals[idx - 1] : null };
}
