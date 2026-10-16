import { inkFor, safeAvatar, outcome } from "./core.mjs?v=8";

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
    const bar = $(`#team-${index}`).getBoundingClientRect();
    for (let n = 0; n < 240; n++) {
      const particle = document.createElement("i");
      particle.className = "confetti";
      Object.assign(particle.style, {
        left: `${bar.x + bar.width * (n % 2 ? 0.82 : 0.18) - bounds.x}px`,
        top: `${bar.y + bar.height * 0.78 - bounds.y}px`,
        background: [
          session.teams[index].color,
          "#fff",
          "#e8ff8a",
          "#ffd166",
          "#ff61bd",
        ][n % 5],
        animation: "none",
        width: `${5 + Math.random() * 8}px`,
        height: `${n % 4 === 0 ? 32 : 8 + Math.random() * 12}px`,
        borderRadius: n % 5 === 0 ? "50%" : "0",
      });
      particle.style.setProperty("--dx", `${(Math.random() - 0.5) * 440}px`);
      particle.style.setProperty("--dy", `${80 + Math.random() * 220}px`);
      particle.style.setProperty("--spin", `${Math.random() * 900}deg`);
      root.append(particle);
      const dx = (Math.random() - 0.5) * Math.max(900, bounds.width),
        rise = bar.height * (0.7 + Math.random() * 0.9),
        spin = (Math.random() - 0.5) * 2200;
      particle
        .animate(
          [
            { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
            {
              transform: `translate(${dx * 0.4}px,${-rise}px) rotate(${spin * 0.4}deg)`,
              opacity: 1,
              offset: 0.35,
            },
            {
              transform: `translate(${dx}px,${bounds.height * 0.7}px) rotate(${spin}deg)`,
              opacity: 0,
            },
          ],
          {
            duration: 3300 + Math.random() * 1700,
            delay: (n % 3) * 320 + Math.random() * 180,
            easing: "cubic-bezier(.18,.6,.45,1)",
            fill: "both",
          },
        )
        .finished.then(() => particle.remove())
        .catch(() => particle.remove());
    }
  });
}
let audioContext, activeSound;
/** Unlock on an operator gesture; never try automatic audio on initial load. */
export function unlockAudio() {
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === "suspended")
      return audioContext.resume().catch(() => {});
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
/** Play either locally synthesized victory cue without samples or noise. */
export function playCheer(prefs) {
  if (!prefs.sound || !audioContext || audioContext.state !== "running") return;
  stopSound();
  const ctx = audioContext,
    now = ctx.currentTime;
  const gain = ctx.createGain();
  activeSound = gain;
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(Math.max(0, Math.min(100, prefs.volume)) / 100, now);
  const arcade = [
    [523.25, 0, 0.12],
    [659.25, 0.14, 0.12],
    [783.99, 0.28, 0.12],
    [1046.5, 0.44, 0.22],
    [987.77, 0.7, 0.11],
    [1174.66, 0.84, 0.11],
    [1318.51, 0.98, 0.11],
    [1046.5, 1.14, 1.0],
  ];
  const stinger = [
    [392, 0, 0.36, "sawtooth", 0.12],
    [493.88, 0, 0.36, "triangle", 0.1],
    [587.33, 0, 0.36, "triangle", 0.1],
    [523.25, 0.4, 1.15, "sawtooth", 0.13],
    [659.25, 0.4, 1.15, "triangle", 0.13],
    [783.99, 0.4, 1.15, "triangle", 0.13],
    [1046.5, 0.4, 1.15, "triangle", 0.12],
  ];
  const selected =
    prefs.victoryStyle === "stinger"
      ? stinger
      : arcade
          .map(([hz, at, duration]) => [hz, at, duration, "square", 0.13])
          .concat(
            [261.63, 329.63, 392].map((hz) => [
              hz,
              1.14,
              1.15,
              "triangle",
              0.14,
            ]),
          )
          .concat(
            [
              [130.81, 0, 0.38],
              [196, 0.44, 0.6],
              [130.81, 1.14, 1.15],
            ].map(([hz, at, duration]) => [hz, at, duration, "triangle", 0.19]),
          );
  const voices = selected.map(([hz, at, duration, type, peak]) =>
    tone(hz, at, duration, type, peak),
  );
  let remaining = voices.length;
  voices.forEach(({ oscillator, envelope }) => {
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
      if (--remaining === 0) {
        gain.disconnect();
        if (activeSound === gain) activeSound = null;
      }
    };
  });
  function tone(hz, at, duration, type, peak) {
    const oscillator = ctx.createOscillator(),
      envelope = ctx.createGain(),
      start = now + at;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(hz, start);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(peak, start + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope);
    envelope.connect(gain);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
    return { oscillator, envelope };
  }
}
