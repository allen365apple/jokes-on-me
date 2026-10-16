import { inkFor, safeAvatar, outcome } from "./core.mjs?v=2";

export const $ = (selector) => document.querySelector(selector);
/** Escape all names and other data before inserting presentational markup. */
export const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
/** Portrait fallback always retains a readable performer name. */
export function membersMarkup(members) {
  return `<div class="members">${members
    .map((m) => {
      let avatar = "";
      try {
        avatar = safeAvatar(m.avatar);
      } catch {
        /* invalid image gets name fallback */
      }
      return `<span class="member"><span class="portrait" style="--position:${Number(m.position) || 0}%"><span>${escapeHtml(m.name.slice(0, 1))}</span>${avatar ? `<img src="${escapeHtml(avatar)}" alt="" loading="eager" style="display:none">` : ""}</span><span class="member-name">${escapeHtml(m.name)}</span></span>`;
    })
    .join("")}</div>`;
}
/** Activate images without inline event handlers or broken-image icons. */
export function hydratePortraits(root) {
  root.querySelectorAll(".portrait img").forEach((img) => {
    const show = () => {
      img.style.display = "block";
      img.previousElementSibling.hidden = true;
    };
    img.addEventListener("load", show, { once: true });
    img.addEventListener(
      "error",
      () => {
        img.hidden = true;
      },
      { once: true },
    );
    if (img.complete && img.naturalWidth) show();
  });
}
/** Apply color only after hex validation; foreground follows WCAG contrast math. */
export function applyTeamColor(element, team) {
  const color = /^#[0-9a-f]{6}$/i.test(team.color) ? team.color : "#2854ed";
  element.style.setProperty("--team-color", color);
  element.style.setProperty("--team-ink", inkFor(color));
}
/** Translate transport status without implying that cached counts are current. */
export function showConnection(state) {
  const labels = {
    demo: "本機排練・不連線收票",
    live: "即時連線正常",
    polling: "備援同步中",
    error: "連線中斷，票數可能尚未更新",
  };
  $("#connection").textContent = labels[state] || "正在連線";
  $("#connection").dataset.state = state;
}
/** Final wording distinguishes ties and empty shows. */
export function resultLabel(session) {
  const winner = outcome(session.counts);
  return winner === "empty"
    ? "本場沒有有效票"
    : winner === "tie"
      ? "勢均力敵！"
      : `${session.teams[winner].name}獲勝！`;
}
let toastTimer;
/** Nonblocking message for stage operators. */
export function toast(message) {
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $("#toast").hidden = true;
  }, 6000);
}
/** Generate the QR locally, with a four-module quiet zone and no external QR service. */
export function drawQr(url, root) {
  if (!globalThis.qrcode) {
    root.textContent = "QR 載入失敗";
    return;
  }
  const qr = globalThis.qrcode(0, "M");
  qr.addData(url);
  qr.make();
  root.innerHTML = qr.createSvgTag({ cellSize: 3, margin: 12, scalable: true });
  root.querySelector("svg")?.setAttribute("aria-label", "本場觀眾投票 QR Code");
}
/** Winner particles originate at that team's bar, not over the readable scoreboard. */
export function celebrate(session, prefs) {
  const reduced =
    prefs.reduced || matchMedia("(prefers-reduced-motion: reduce)").matches;
  const winner = outcome(session.counts);
  if (!prefs.effects || reduced || winner === "empty") return;
  const root = $("#burst");
  root.replaceChildren();
  const bounds = root.getBoundingClientRect();
  const winners = winner === "tie" ? [0, 1] : [winner];
  winners.forEach((index) => {
    const bar = $(`#team-${index} .bar`).getBoundingClientRect();
    for (let n = 0; n < 36; n++) {
      const particle = document.createElement("i");
      particle.className = "confetti";
      Object.assign(particle.style, {
        left: `${bar.x + bar.width / 2 - bounds.x}px`,
        top: `${bar.y - bounds.y}px`,
        background: [session.teams[index].color, "#fff", "#e8ff8a"][n % 3],
      });
      particle.style.setProperty("--dx", `${(Math.random() - 0.5) * 440}px`);
      particle.style.setProperty("--dy", `${80 + Math.random() * 220}px`);
      particle.style.setProperty("--spin", `${Math.random() * 900}deg`);
      particle.addEventListener("animationend", () => particle.remove(), {
        once: true,
      });
      root.append(particle);
    }
  });
}
let audioContext, activeSound;
/** Unlock on an operator gesture; never try automatic audio on initial load. */
export function unlockAudio() {
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === "suspended")
      audioContext.resume().catch(() => {});
  } catch {
    /* audio is optional */
  }
}
/** Immediately stop the current celebratory sound when muted. */
export function stopSound() {
  try {
    activeSound?.disconnect();
  } catch {
    /* already stopped */
  }
}
/** Short locally synthesized crowd swell; no paid audio or external download. */
export function playCheer(prefs) {
  if (!prefs.sound || !audioContext || audioContext.state !== "running") return;
  stopSound();
  const ctx = audioContext,
    now = ctx.currentTime;
  const gain = ctx.createGain();
  activeSound = gain;
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime((prefs.volume / 100) * 0.25, now + 0.18);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2.3, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let n = 0; n < data.length; n++)
    data[n] =
      (Math.random() * 2 - 1) *
      (0.65 + 0.35 * Math.sin((n / ctx.sampleRate) * 27));
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1200;
  filter.Q.value = 0.5;
  source.connect(filter);
  filter.connect(gain);
  source.start(now);
  source.stop(now + 2.3);
}
