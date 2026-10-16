import { acceptsSnapshot, outcome } from "./core.mjs";
import { createStore, modeFromUrl } from "./store.mjs";
import {
  $,
  escapeHtml as esc,
  membersMarkup,
  hydratePortraits,
  applyTeamColor,
  showConnection,
  resultLabel,
} from "./ui.mjs";

const mode = modeFromUrl(),
  id = new URL(location.href).searchParams.get("session");
let store,
  state,
  sync,
  selection = null,
  voted = null,
  busy = false,
  identityReady = false,
  connected = false,
  signature = "";

/** Restore browser identity and authoritative receipt before enabling a vote. */
async function init() {
  $("#mode-label").textContent =
    mode === "demo" ? "排練・不計正式票" : "現場投票";
  $("#mode-label").classList.toggle("demo", mode === "demo");
  try {
    if (!id) throw new Error("這個連結沒有場次，請重新掃描現場 QR Code。");
    store = await createStore(mode, true);
    render(await store.read(id));
    await restoreIdentity();
    sync = store.subscribe(id, render, (status) => {
      connected = status !== "error";
      showConnection(status);
      updateButton();
    });
  } catch (error) {
    showError(error.message);
    $("#vote-status").textContent = "暫時無法投票";
  }
}

async function restoreIdentity() {
  await store.identity();
  voted = await store.myVote(id);
  identityReady = true;
  renderReceipt();
  updateButton();
}

/** Do not reveal live counts before submission; the projector still receives them. */
function render(next) {
  if (!acceptsSnapshot(state, next)) return;
  state = next;
  const nextSignature = JSON.stringify(next.teams);
  if (signature !== nextSignature) {
    $("#vote-teams").innerHTML = next.teams
      .map(
        (team, i) =>
          `<button class="team-choice" data-team="${esc(team.id)}" type="button" aria-pressed="false"><div class="side-label">TEAM ${i ? "02 / RIGHT" : "01 / LEFT"}</div><h2 class="team-name ${team.name.length > 5 ? "long-name" : ""}">${esc(team.name)}</h2><span class="choice-indicator" aria-hidden="true"></span>${membersMarkup(team.members)}<span class="choice-score" hidden></span></button>`,
      )
      .join("");
    next.teams.forEach((team, i) =>
      applyTeamColor(document.querySelectorAll(".team-choice")[i], team),
    );
    hydratePortraits($("#vote-teams"));
    signature = nextSignature;
  }
  $("#status-tag").textContent =
    next.status === "open"
      ? "VOTING LIVE"
      : next.status === "closed"
        ? "FINAL"
        : "GET READY";
  $("#vote-status").textContent =
    next.status === "closed"
      ? resultLabel(next)
      : next.status === "open"
        ? "投票開放中，輪到你決定了。"
        : "等待主持人開放投票";
  document.querySelectorAll(".team-choice").forEach((button, i) => {
    const score = button.querySelector(".choice-score");
    score.hidden = next.status !== "closed";
    score.textContent = `${next.counts[i]} 票`;
  });
  renderReceipt();
  updateButton();
}

function renderReceipt() {
  if (!state) return;
  const team = state.teams.find((t) => t.id === voted);
  $("#receipt").hidden = !team;
  if (team)
    $("#receipt").innerHTML =
      `<strong>這一票，${esc(team.name)}收到了！</strong>謝謝你把笑聲投給他們。${state.status === "closed" ? "本場已結束，結果就在上方。" : "接下來，把掌聲留給現場。"}${mode === "demo" ? "<br>這是排練選票，不會計入正式結果。" : ""}`;
}

function updateButton() {
  const eligible =
    identityReady && connected && state?.status === "open" && !voted && !busy;
  document.querySelectorAll(".team-choice").forEach((button) => {
    button.disabled = !eligible;
    const chosen = button.dataset.team === (voted || selection);
    button.setAttribute("aria-pressed", String(chosen));
    button.querySelector(".choice-indicator").textContent = chosen ? "✓" : "";
  });
  $("#submit-vote").disabled = !eligible || !selection;
  $("#submit-vote").textContent = busy
    ? "正在確認你的選票⋯"
    : voted
      ? "已完成投票 ✓"
      : state?.status === "closed"
        ? "本場投票已結束"
        : state?.status === "ready"
          ? "等待開放投票"
          : "確認投票 ↗";
  const selected = state?.teams.find((t) => t.id === selection);
  $("#selection-label").textContent = voted
    ? "每個瀏覽器限投一次，謝謝你的參與。"
    : selected
      ? `你選擇了${selected.name}，確認送出後不能改票。`
      : "先選一隊，把笑聲變成一票。";
}

function showError(message) {
  $("#vote-error").textContent = message;
  $("#vote-error").hidden = false;
  $("#retry-button").hidden = false;
}

async function submit() {
  if (
    busy ||
    !selection ||
    voted ||
    !connected ||
    !identityReady ||
    state?.status !== "open"
  )
    return;
  busy = true;
  updateButton();
  $("#vote-error").hidden = true;
  try {
    const result = await store.vote(id, selection);
    voted = result.team;
    render(result.session);
    $("#retry-button").hidden = true;
  } catch (error) {
    showError(`${error.message} 請按「重新確認」，先查詢這一票是否已收到。`);
    // An uncertain request may have committed. Disable another submission until reconciled.
    identityReady = false;
  } finally {
    busy = false;
    renderReceipt();
    updateButton();
  }
}

async function retry() {
  if (busy) return;
  busy = true;
  updateButton();
  try {
    if (!store) {
      await init();
      return;
    }
    await restoreIdentity();
    render(await store.read(id));
    connected = true;
    if (!sync)
      sync = store.subscribe(id, render, (status) => {
        connected = status !== "error";
        showConnection(status);
        updateButton();
      });
    $("#vote-error").hidden = true;
    $("#retry-button").hidden = true;
    sync.refresh();
  } catch (error) {
    showError(error.message);
  } finally {
    busy = false;
    updateButton();
  }
}

$("#vote-teams").addEventListener("click", (e) => {
  const button = e.target.closest("[data-team]");
  if (!button || button.disabled) return;
  selection = button.dataset.team;
  updateButton();
});
$("#submit-vote").addEventListener("click", submit);
$("#retry-button").addEventListener("click", retry);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && store && identityReady && !busy)
    restoreIdentity().catch((error) => showError(error.message));
});
window.addEventListener("storage", () => {
  if (store && identityReady && !busy)
    restoreIdentity().catch((error) => showError(error.message));
});
window.addEventListener("pagehide", () => sync?.stop());
init();
