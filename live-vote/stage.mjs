import {
  DEFAULT_TEAMS,
  ROSTER,
  member,
  validateTeams,
  outcome,
  chartScale,
  acceptsSnapshot,
  canHandleKey,
} from "./core.mjs";
import { createStore, modeFromUrl, readLocal, writeLocal } from "./store.mjs";
import {
  $,
  escapeHtml as esc,
  membersMarkup,
  hydratePortraits,
  applyTeamColor,
  showConnection,
  resultLabel,
  toast,
  drawQr,
  celebrate,
  unlockAudio,
  stopSound,
  playCheer,
} from "./ui.mjs";

const mode = modeFromUrl();
let store,
  state,
  sync,
  isAdmin = false,
  busy = false,
  teamSignature = "",
  connected = false;
let lastLeader = null,
  lastOvertakeAt = 0,
  pendingTransition = null,
  lastTransitionAt = 0;
const defaults = {
  font: 100,
  top: 45,
  volume: 30,
  sound: false,
  effects: true,
  reduced: false,
  qr: true,
};
let prefs = { ...defaults };
let editorTeams = structuredClone(DEFAULT_TEAMS);

/** Load one explicit session; invalid links never create a replacement show. */
async function init() {
  try {
    prefs = { ...defaults, ...readLocal("preferences", {}) };
    applyPreferences();
    $("#mode-label").textContent =
      mode === "demo" ? "排練・模擬票數" : "LIVE VOTE";
    $("#mode-label").classList.toggle("demo", mode === "demo");
    $("#demo-controls").hidden = mode !== "demo";
    $("#rehearsal-section").hidden = mode !== "demo";
    store = await createStore(mode);
    isAdmin = await store.admin();
    let id = new URL(location.href).searchParams.get("session");
    if (!id && mode === "demo") {
      id = readLocal("last-demo-session");
      if (!id) id = (await store.create()).id;
    }
    if (id) await loadSession(id);
    else {
      $("#status-text").textContent = "尚未選擇場次";
      $("#status-detail").textContent = "按 C 登入管理員，再建立新場次。";
    }
    $("#operator-note").textContent =
      mode === "demo"
        ? "排練只在這個瀏覽器同步，不接受其他手機投票。按 1／2 加票，Enter 開始或結束。"
        : "Enter 開放／截止 · F 全螢幕 · C 控制台 · Q QR · M 音效";
  } catch (error) {
    $("#status-text").textContent = "尚未準備完成";
    $("#status-detail").textContent = error.message;
    toast(error.message);
  } finally {
    updateControls();
    requestAnimationFrame(() => $("#stage").scrollIntoView({ block: "start" }));
  }
}

/** Switching to a historical session stops the prior subscription first. */
async function loadSession(id) {
  const initial = await store.read(id);
  sync?.stop();
  state = null;
  teamSignature = "";
  lastLeader = null;
  pendingTransition = null;
  const url = new URL(location.href);
  url.searchParams.set("mode", mode);
  url.searchParams.set("session", id);
  history.replaceState(null, "", url);
  render(initial);
  updateQr();
  sync = store.subscribe(id, render, (status) => {
    connected = status !== "error";
    showConnection(status);
    updateControls();
  });
}

/** Apply versioned server snapshots; counters remain exact integers throughout animation. */
function render(next) {
  if (!acceptsSnapshot(state, next)) return;
  const previous = state;
  state = next;
  if (next.status === pendingTransition) pendingTransition = null;
  const signature = JSON.stringify(next.teams);
  if (signature !== teamSignature) {
    renderTeams();
    teamSignature = signature;
  }
  const scale = chartScale(next.counts, next.expected),
    winner = outcome(next.counts);
  next.teams.forEach((team, i) => {
    const root = $(`#team-${i}`);
    root.querySelector(".score-value").textContent = next.counts[i];
    root
      .querySelector(".chart")
      .setAttribute(
        "aria-label",
        `${team.name} ${next.counts[i]} 票，共同刻度 ${scale}`,
      );
    root.querySelector(".bar").style.transform =
      `scaleY(${next.counts[i] / scale})`;
    root.querySelector(".scale-value").textContent = `共同刻度 ${scale}`;
    root.classList.toggle(
      "winner",
      next.status === "closed" && (winner === i || winner === "tie"),
    );
    root.classList.toggle(
      "loser",
      next.status === "closed" && typeof winner === "number" && winner !== i,
    );
    root.querySelector(".team-status").textContent =
      next.status === "closed"
        ? winner === i
          ? "WINNER"
          : winner === "tie"
            ? "平手"
            : "FINAL"
        : next.status === "open" && winner === i
          ? "暫時領先"
          : "CHALLENGER";
    if (previous && previous.counts[i] !== next.counts[i]) {
      root.querySelector(".score").classList.remove("pop");
      requestAnimationFrame(() =>
        root.querySelector(".score").classList.add("pop"),
      );
    }
  });
  showOvertake(winner);
  renderStatus();
  updateControls();
  if (previous?.status === "open" && next.status === "closed") {
    celebrate(next, prefs);
    if (winner !== "empty") playCheer(prefs);
  }
}

function renderTeams() {
  state.teams.forEach((team, i) => {
    const root = $(`#team-${i}`);
    applyTeamColor(root, team);
    root.dataset.side = i ? "02" : "01";
    root.innerHTML = `<div class="team-topline"><span>TEAM ${i ? "02 / RIGHT" : "01 / LEFT"}</span><span class="team-status">CHALLENGER</span></div><h2 class="team-name ${team.name.length > 5 ? "long-name" : ""}">${esc(team.name)}</h2>${membersMarkup(team.members)}<div class="chart" role="img" aria-label="${esc(team.name)}得票數"><div class="bar-track"></div><div class="bar"></div><div class="score"><span class="score-value">0</span><small>票</small></div></div><div class="chart-foot"><span>你的笑聲，他們的分數。</span><span class="scale-value"></span></div>`;
    hydratePortraits(root);
  });
}

function showOvertake(winner) {
  if (state.status !== "open" || typeof winner !== "number") return;
  if (
    lastLeader !== null &&
    lastLeader !== winner &&
    Date.now() - lastOvertakeAt > 5000 &&
    prefs.effects
  ) {
    const root = $(`#team-${winner}`);
    root.classList.add("overtake");
    root.querySelector(".team-status").textContent = "反超！";
    lastOvertakeAt = Date.now();
    setTimeout(() => {
      root.classList.remove("overtake");
      if (state.status === "open") renderStatus();
    }, 2200);
  }
  lastLeader = winner;
}

function renderStatus() {
  if (!state) return;
  const total = state.counts.reduce((a, b) => a + b, 0);
  $("#status-tag").textContent =
    state.status === "open"
      ? "VOTING LIVE"
      : state.status === "closed"
        ? "FINAL RESULT"
        : "READY TO LAUGH";
  $("#status-text").textContent =
    pendingTransition === "closed"
      ? "正在確認最終票數⋯"
      : pendingTransition === "open"
        ? "正在開放投票⋯"
        : state.status === "closed"
          ? resultLabel(state)
          : state.status === "open"
            ? "投票開始，笑了就投！"
            : "等待開放投票";
  $("#status-detail").textContent =
    state.status === "ready"
      ? "先選好你的笑點，等主持人一聲令下。"
      : `已收到 ${total} 票${state.status === "closed" ? " · 本場投票已截止" : " · 你的這一票，可能就是關鍵。"}`;
}

function updateControls() {
  const button = $("#toggle-vote");
  button.disabled =
    !store ||
    !isAdmin ||
    !state ||
    busy ||
    !connected ||
    state.status === "closed";
  button.innerHTML = `<kbd>Enter</kbd> ${busy ? "正在確認⋯" : state?.status === "open" ? "截止並揭曉" : state?.status === "closed" ? "投票已結束" : "開放投票"}`;
  document.querySelectorAll("[data-sim],[data-batch]").forEach((b) => {
    b.disabled = !state || state.status !== "open" || busy;
  });
}

/** Failed requests never optimistically advance status; retry preserves the intended transition. */
async function transition() {
  if (
    !state ||
    !isAdmin ||
    busy ||
    !connected ||
    Date.now() - lastTransitionAt < 650 ||
    (state.status === "closed" && !pendingTransition)
  )
    return;
  lastTransitionAt = Date.now();
  unlockAudio();
  busy = true;
  pendingTransition ||= state.status === "ready" ? "open" : "closed";
  updateControls();
  renderStatus();
  try {
    const target = pendingTransition;
    const next = await store[target === "open" ? "open" : "close"](state.id);
    pendingTransition = null;
    render(next);
  } catch (error) {
    toast(`${error.message} 尚未確認完成，請確認連線後重試。`);
    sync?.refresh();
  } finally {
    busy = false;
    renderStatus();
    updateControls();
  }
}

function updateQr() {
  if (!state) return;
  const url = new URL("./vote.html", location.href);
  url.searchParams.set("mode", mode);
  url.searchParams.set("session", state.id);
  $("#audience-link").href = url.href;
  if (mode === "demo") {
    $("#qr").textContent = "DEMO\n同瀏覽器排練";
    $("#qr-title").textContent = "試投一票";
    $("#qr-caption").textContent = "僅同一瀏覽器，不跨裝置。";
  } else if (["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)) {
    $("#qr").textContent = "本機網址\n手機無法掃碼連入";
    $("#qr-title").textContent = "本機驗證";
    $("#qr-caption").textContent = "發布後自動產生正式 QR。";
  } else drawQr(url.href, $("#qr"));
}

function applyPreferences() {
  document.documentElement.style.setProperty("--scale", prefs.font / 100);
  document.documentElement.style.setProperty("--top-space", `${prefs.top}vh`);
  document.body.classList.toggle("reduced-motion", prefs.reduced);
  $("#qr-block").hidden = !prefs.qr;
  $("#mute-button").innerHTML =
    `<kbd>M</kbd> ${prefs.sound ? "音效開啟" : "音效關閉"}`;
  $("#mute-button").setAttribute("aria-pressed", String(prefs.sound));
  [
    ["font-scale", "font", "font-value", "%"],
    ["top-space", "top", "space-value", "vh"],
    ["volume", "volume", "volume-value", "%"],
  ].forEach(([id, key, out, unit]) => {
    $("#" + id).value = prefs[key];
    $("#" + out).textContent = prefs[key] + unit;
  });
  $("#sound-enabled").checked = prefs.sound;
  $("#effects-enabled").checked = prefs.effects;
  $("#motion-reduced").checked = prefs.reduced;
  if (!prefs.sound) stopSound();
}

function rememberPreferences() {
  applyPreferences();
  try {
    writeLocal("preferences", prefs);
  } catch {
    toast("瀏覽器無法儲存偏好，這次設定仍然有效。");
  }
}

function openSettings() {
  if ($("#settings-dialog").open) {
    $("#settings-dialog").close();
    return;
  }
  $("#settings-message").textContent = "";
  $("#settings-mode").textContent =
    mode === "demo"
      ? "排練模式：只有本瀏覽器的模擬資料，不會影響正式投票。"
      : "正式模式：開始、截止與修改隊伍，都由伺服器確認管理權限。";
  $("#login-section").hidden = mode === "demo" || isAdmin;
  $("#logout-button").hidden = mode === "demo" || !isAdmin;
  $("#session-form").elements.title.value = state?.title || "看我笑話・現場 PK";
  $("#session-form").elements.expected.value = state?.expected || 150;
  editorTeams = structuredClone(state?.teams || DEFAULT_TEAMS);
  renderEditors();
  const editable = isAdmin && (!state || state.status === "ready");
  $("#session-fields").disabled = !editable;
  $("#save-settings").disabled = !editable || !state;
  $("#new-session").disabled = !isAdmin || state?.status === "open";
  $("#edit-hint").textContent =
    state && state.status !== "ready"
      ? "投票開始後鎖定，請另建新場"
      : "投票開放前可修改";
  $("#settings-dialog").showModal();
  loadHistory();
}

function renderEditors() {
  $("#team-editors").innerHTML = editorTeams
    .map(
      (team, i) =>
        `<div class="team-editor" data-editor="${i}"><h4>${i ? "右隊" : "左隊"}</h4><div class="form-row"><label>隊名<input data-field="team-name" value="${esc(team.name)}" maxlength="12" required></label><label>顏色<input type="color" data-field="color" value="${esc(team.color)}"></label></div><div class="member-editors">${team.members.map((m, j) => memberEditorMarkup(m, i, j)).join("")}</div><button type="button" data-add="${i}" ${team.members.length >= 8 ? "disabled" : ""}>＋ 加入成員</button></div>`,
    )
    .join("");
}

function memberEditorMarkup(m, i, j) {
  return `<div class="member-editor" data-member="${j}"><label class="member-source">選用頭像<select data-field="source"><option value="">自訂成員／圖片</option>${ROSTER.map((name) => `<option value="${esc(name)}" ${m.avatar === member(name).avatar ? "selected" : ""}>${esc(name)}</option>`).join("")}</select></label><label>顯示名字<input data-field="name" value="${esc(m.name)}" maxlength="16" required></label><label>裁切位置<input data-field="position" type="number" min="0" max="100" value="${m.position}"></label><label class="avatar-input">圖片網址或既有路徑<input data-field="avatar" value="${esc(m.avatar)}" placeholder="無圖片時顯示名字"></label><div class="member-controls"><button type="button" data-move="${i}:${j}:-1" ${j === 0 ? "disabled" : ""}>往前</button><button type="button" data-move="${i}:${j}:1" ${j === editorTeams[i].members.length - 1 ? "disabled" : ""}>往後</button><button type="button" data-remove="${i}:${j}" ${editorTeams[i].members.length === 1 ? "disabled" : ""}>移出本隊</button></div></div>`;
}

function collectEditors() {
  return [...document.querySelectorAll("[data-editor]")].map((root) => ({
    name: root.querySelector("[data-field=team-name]").value,
    color: root.querySelector("[data-field=color]").value,
    members: [...root.querySelectorAll("[data-member]")].map((row) => ({
      name: row.querySelector("[data-field=name]").value,
      avatar: row.querySelector("[data-field=avatar]").value,
      position: Number(row.querySelector("[data-field=position]").value),
    })),
  }));
}

function settingsValue() {
  return {
    title: $("#session-form").elements.title.value,
    expected: Number($("#session-form").elements.expected.value),
    teams: validateTeams(collectEditors()),
  };
}

/** Panel actions report errors locally and serialize double clicks. */
async function panelAction(work) {
  if (busy) return;
  busy = true;
  updateControls();
  $("#settings-message").textContent = "處理中⋯";
  try {
    await work();
  } catch (error) {
    $("#settings-message").textContent = error.message;
  } finally {
    busy = false;
    updateControls();
  }
}

async function loadHistory() {
  if (!isAdmin || !store) return;
  try {
    const rows = await store.history();
    $("#history-list").innerHTML = rows
      .slice(0, 20)
      .map(
        (s) =>
          `<a href="?mode=${mode}&session=${encodeURIComponent(s.id)}">${esc(s.title)} · ${s.status === "closed" ? "已結束" : s.status === "open" ? "投票中" : "準備中"} · ${s.counts.join(" : ")} <span>↗</span></a>`,
      )
      .join("");
  } catch (error) {
    $("#settings-message").textContent = error.message;
  }
}

async function simulate(index, amount = 1) {
  if (mode !== "demo" || !state || state.status !== "open" || busy) return;
  busy = true;
  updateControls();
  try {
    render(await store.simulate(state.id, index, amount));
  } catch (error) {
    toast(error.message);
  } finally {
    busy = false;
    updateControls();
  }
}

async function fullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
    $("#stage").scrollIntoView();
  } catch {
    toast("這個瀏覽器未開放全螢幕，請使用瀏覽器全螢幕功能。");
  }
}

function bindEvents() {
  $("#toggle-vote").addEventListener("click", transition);
  $("#settings-button").addEventListener("click", openSettings);
  $("#close-settings").addEventListener("click", () =>
    $("#settings-dialog").close(),
  );
  $("#settings-dialog").addEventListener("close", () =>
    $("#stage").focus({ preventScroll: true }),
  );
  $("#settings-dialog").addEventListener("click", (e) => {
    if (e.target === $("#settings-dialog")) {
      const r = e.target.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        e.target.close();
    }
  });
  $("#fullscreen-button").hidden = !document.fullscreenEnabled;
  $("#fullscreen-button").addEventListener("click", fullscreen);
  $("#qr-button").addEventListener("click", () => {
    prefs.qr = !prefs.qr;
    rememberPreferences();
  });
  $("#mute-button").addEventListener("click", () => {
    unlockAudio();
    prefs.sound = !prefs.sound;
    rememberPreferences();
  });
  document
    .querySelectorAll("[data-sim]")
    .forEach((b) =>
      b.addEventListener("click", () => simulate(Number(b.dataset.sim))),
    );
  document
    .querySelectorAll("[data-batch]")
    .forEach((b) =>
      b.addEventListener("click", () => simulate(Number(b.dataset.batch), 10)),
    );
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.repeat && e.target === $("#toggle-vote")) {
      e.preventDefault();
      return;
    }
    if (!canHandleKey(e, $("#settings-dialog").open, busy)) return;
    const actions = {
      Enter: transition,
      f: fullscreen,
      c: openSettings,
      q: () => $("#qr-button").click(),
      m: () => $("#mute-button").click(),
      1: () => simulate(0),
      2: () => simulate(1),
    };
    const action = actions[e.key] || actions[e.key.toLowerCase()];
    if (action) {
      e.preventDefault();
      action();
    }
  });
  bindPreferences();
  bindEditor();
  bindForms();
  window.addEventListener("pagehide", () => sync?.stop());
}

function bindPreferences() {
  [
    ["font-scale", "font"],
    ["top-space", "top"],
    ["volume", "volume"],
  ].forEach(([id, key]) =>
    $("#" + id).addEventListener("input", (e) => {
      prefs[key] = Number(e.target.value);
      rememberPreferences();
    }),
  );
  [
    ["sound-enabled", "sound"],
    ["effects-enabled", "effects"],
    ["motion-reduced", "reduced"],
  ].forEach(([id, key]) =>
    $("#" + id).addEventListener("change", (e) => {
      unlockAudio();
      prefs[key] = e.target.checked;
      rememberPreferences();
    }),
  );
}

function bindEditor() {
  $("#team-editors").addEventListener("change", (e) => {
    if (e.target.dataset.field !== "source") return;
    const name = e.target.value;
    if (!name) return;
    const row = e.target.closest("[data-member]"),
      m = member(name);
    row.querySelector("[data-field=name]").value = m.name;
    row.querySelector("[data-field=avatar]").value = m.avatar;
  });
  $("#team-editors").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    editorTeams = collectEditors();
    if (b.dataset.add !== undefined)
      editorTeams[Number(b.dataset.add)].members.push(member("新成員"));
    if (b.dataset.remove) {
      const [i, j] = b.dataset.remove.split(":").map(Number);
      editorTeams[i].members.splice(j, 1);
    }
    if (b.dataset.move) {
      const [i, j, delta] = b.dataset.move.split(":").map(Number);
      const list = editorTeams[i].members;
      [list[j], list[j + delta]] = [list[j + delta], list[j]];
    }
    renderEditors();
  });
}

function bindForms() {
  $("#session-form").addEventListener("submit", (e) => {
    e.preventDefault();
    panelAction(async () => {
      render(await store.save(state.id, settingsValue()));
      $("#settings-message").textContent =
        "已儲存，本場投影與手機畫面會同步更新。";
    });
  });
  $("#new-session").addEventListener("click", () =>
    panelAction(async () => {
      const settings =
        state && state.status !== "ready"
          ? { title: state.title, expected: state.expected, teams: state.teams }
          : settingsValue();
      const next = await store.create(settings);
      await loadSession(next.id);
      $("#settings-dialog").close();
      toast("已建立新場次，舊場紀錄仍然保留。");
    }),
  );
  $("#login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    panelAction(async () => {
      const form = e.target;
      try {
        await store.login(
          form.elements.email.value,
          form.elements.password.value,
        );
      } finally {
        form.elements.password.value = "";
      }
      isAdmin = await store.admin();
      $("#settings-dialog").close();
      openSettings();
    });
  });
  $("#logout-button").addEventListener("click", () =>
    panelAction(async () => {
      await store.logout();
      isAdmin = false;
      $("#settings-dialog").close();
      toast("已登出；投影仍維持唯讀顯示。");
    }),
  );
}

bindEvents();
init();
