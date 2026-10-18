import "./style.css";
import QRCode from "qrcode";
import {
  Difficulty, Kind, Status, TapResult, addProblem, exportJSON, importJSON, load,
  removeProblem, removeSession, save, setBaseUrl, tapTag,
} from "./store";
import {
  bestStreak, currentStreak, dayKey, focusMinByDay, fmtMinutes, lastDays, solvedByDay, weeklySummary,
} from "./stats";

const app = document.getElementById("app")!;

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const mmss = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

const timeOf = (ts: number) => new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const dateOf = (ts: number) => new Date(ts).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

// ---------- toast ----------
let toast: { text: string; tone: "ok" | "info" | "warn" } | null = null;
let toastTimer: number | undefined;
function showToast(text: string, tone: "ok" | "info" | "warn" = "ok") {
  toast = { text, tone };
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast = null;
    const el = document.getElementById("toast");
    if (el) el.remove();
  }, 4500);
}
const toastHTML = () => (toast ? `<div id="toast" class="toast ${toast.tone}" role="status">${esc(toast.text)}</div>` : "");

function describe(r: TapResult): { text: string; tone: "ok" | "info" | "warn" } {
  const label = (k: Kind) => (k === "focus" ? "Focus" : "Break");
  switch (r.type) {
    case "started": return { text: `${label(r.what)} started.`, tone: "ok" };
    case "stopped": return { text: `${label(r.session.kind)} logged: ${fmtMinutes(r.session.minutes)}.`, tone: "ok" };
    case "switched":
      return { text: `${r.session ? `${label(r.session.kind)} logged (${fmtMinutes(r.session.minutes)}). ` : ""}${label(r.what)} started.`, tone: "ok" };
    case "discarded": return { text: "Under a minute, so it wasn't logged.", tone: "info" };
    case "ignored": return { text: "Tag already read a moment ago.", tone: "info" };
  }
}

// ---------- charts ----------
function bars(values: number[], labels: string[], colorVar: string, title: string, fmt: (n: number) => string): string {
  const max = Math.max(...values, 1);
  const W = 308, H = 124, base = 96, top = 18, bw = 28;
  const gap = (W - bw * values.length) / (values.length - 1);
  const parts = values.map((v, i) => {
    const h = v > 0 ? Math.max(4, (v / max) * (base - top)) : 2;
    const x = i * (bw + gap);
    const today = i === values.length - 1;
    return `
      <rect x="${x.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${bw}" height="${h.toFixed(1)}" rx="5"
        fill="var(${colorVar})" opacity="${today ? 1 : 0.55}" />
      ${v > 0 ? `<text x="${(x + bw / 2).toFixed(1)}" y="${(base - h - 5).toFixed(1)}" text-anchor="middle" class="val">${fmt(v)}</text>` : ""}
      <text x="${(x + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="lab ${today ? "today" : ""}">${labels[i]}</text>`;
  });
  const total = values.reduce((a, b) => a + b, 0);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}: ${values.map((v, i) => `${labels[i]} ${fmt(v)}`).join(", ")}; total ${fmt(total)}">${parts.join("")}</svg>`;
}

// ---------- views ----------
function dashboardHTML(now: number): string {
  const d = load();
  const days = lastDays(7, now);
  const solved = solvedByDay(d.problems);
  const focus = focusMinByDay(d.sessions);
  const today = dayKey(now);
  const solvedToday = solved.get(today) ?? 0;
  const focusToday = focus.get(today) ?? 0;
  const streak = currentStreak(d.problems, now);
  const best = bestStreak(d.problems);

  const a = d.active;
  const timer = a
    ? (() => {
        const elapsed = now - a.start;
        const total = a.targetMin * 60_000;
        const over = elapsed > total;
        return `
        <section class="card timer ${a.kind}">
          <div id="eyebrow" class="eyebrow">${a.kind === "focus" ? "Focus" : "Break"} ${over ? "· time's up" : "running"}</div>
          <div id="clock" class="clock">${over ? "+" + mmss(elapsed - total) : mmss(total - elapsed)}</div>
          <div class="track" aria-hidden="true"><div id="bar" class="fill" style="width:${Math.min(100, (elapsed / total) * 100).toFixed(1)}%"></div></div>
          <p class="hint">Tap the ${a.kind === "focus" ? "Focus" : "Break"} tag again, or press stop, to log it.</p>
          <button data-act="tap-${a.kind}" class="primary">Stop and log</button>
        </section>`;
      })()
    : `
        <section class="card timer idle">
          <div class="eyebrow">Idle</div>
          <div class="clock dim">00:00</div>
          <p class="hint">Tap a tag on your desk, or start one here.</p>
          <div class="row">
            <button data-act="tap-focus" class="primary">Start ${d.settings.focusMin}m focus</button>
            <button data-act="tap-break">Break ${d.settings.breakMin}m</button>
          </div>
        </section>`;

  const log = [
    ...d.sessions.filter((s) => s.kind === "focus").map((s) => ({ t: s.end, kind: "s" as const, id: s.id, text: `Focus · ${fmtMinutes(s.minutes)}`, sub: "" })),
    ...d.problems.map((p) => ({
      t: p.at, kind: "p" as const, id: p.id,
      text: `${p.name || "Untitled problem"}`,
      sub: `${p.difficulty} · ${p.status}${p.minutes ? " · " + fmtMinutes(p.minutes) : ""}`,
    })),
  ].sort((x, y) => y.t - x.t).slice(0, 12);

  return `
    <header class="top">
      <h1>Desk<span>Tap</span></h1>
      <nav><a href="#/log">+ Log problem</a><a href="#/tags">Tags</a></nav>
    </header>
    ${toastHTML()}
    ${timer}

    <section class="tiles" aria-label="Today">
      <div class="tile"><div class="num">${streak}</div><div class="cap">day streak${best > streak ? ` · best ${best}` : ""}</div></div>
      <div class="tile"><div class="num">${solvedToday}</div><div class="cap">solved today</div></div>
      <div class="tile"><div class="num">${fmtMinutes(focusToday)}</div><div class="cap">focus today</div></div>
    </section>

    <section class="card">
      <h2>Problems solved, last 7 days</h2>
      ${bars(days.map((x) => solved.get(x.key) ?? 0), days.map((x) => x.label), "--c1", "Problems solved", (n) => String(n))}
    </section>
    <section class="card">
      <h2>Focus time, last 7 days</h2>
      ${bars(days.map((x) => focus.get(x.key) ?? 0), days.map((x) => x.label), "--c2", "Focus minutes", (n) => (n >= 60 ? (n / 60).toFixed(1) + "h" : n + "m"))}
    </section>

    <section class="card">
      <h2>Recent</h2>
      ${log.length ? `<ul class="log">${log.map((e) => `
        <li>
          <div><div class="t">${esc(e.text)}</div><div class="s">${esc(dateOf(e.t))}, ${timeOf(e.t)}${e.sub ? " · " + esc(e.sub) : ""}</div></div>
          <button class="x" data-act="del-${e.kind}:${e.id}" aria-label="Delete entry">×</button>
        </li>`).join("")}</ul>` : `<p class="hint">Nothing logged yet. Tap the LeetCode tag after your next problem.</p>`}
    </section>

    <section class="card">
      <h2>Monday update</h2>
      <pre id="update" class="update">${esc(weeklySummary(d, now))}</pre>
      <div class="row">
        <button data-act="copy-update" class="primary">Copy update</button>
        <button data-act="export">Back up data</button>
        <button data-act="import">Restore</button>
        <input type="file" id="file" accept="application/json,.json" hidden />
      </div>
      <p class="hint">Safari can clear site data after weeks of inactivity, so back up now and then.</p>
    </section>`;
}

function logHTML(): string {
  return `
    <header class="top"><h1>Log <span>problem</span></h1><nav><a href="#/">Back</a></nav></header>
    <form id="logform" class="card form" autocomplete="off">
      <label>Problem
        <input name="name" placeholder="1. Two Sum" required autofocus enterkeyhint="done" />
      </label>
      <fieldset>
        <legend>Difficulty</legend>
        <div class="seg">
          ${(["Easy", "Medium", "Hard"] as Difficulty[]).map((x, i) => `<label><input type="radio" name="difficulty" value="${x}" ${i === 1 ? "checked" : ""}/><span>${x}</span></label>`).join("")}
        </div>
      </fieldset>
      <fieldset>
        <legend>Result</legend>
        <div class="seg">
          ${(["Solved", "Stuck"] as Status[]).map((x, i) => `<label><input type="radio" name="status" value="${x}" ${i === 0 ? "checked" : ""}/><span>${x}</span></label>`).join("")}
        </div>
      </fieldset>
      <label>Minutes spent <input name="minutes" type="number" inputmode="numeric" min="0" max="600" placeholder="25" /></label>
      <button class="primary" type="submit">Save</button>
      <p class="hint">Only "Solved" counts toward your streak.</p>
    </form>`;
}

const TAGS: { id: string; title: string; blurb: string }[] = [
  { id: "focus", title: "Focus", blurb: "Tap to start a focus timer, tap again to stop and log." },
  { id: "leetcode", title: "LeetCode", blurb: "Tap to open the quick log form." },
  { id: "break", title: "Break", blurb: "Tap to start a break timer." },
];

function defaultBase(): string {
  return location.href.split("#")[0];
}

function tagsHTML(): string {
  const d = load();
  const base = d.settings.baseUrl || defaultBase();
  const isLocal = /^(https?:\/\/)(localhost|127\.|192\.168\.|10\.)/.test(base);
  return `
    <header class="top"><h1>Tag <span>setup</span></h1><nav><a href="#/">Back</a></nav></header>
    <section class="card">
      <label>Public address of this app
        <input id="base" value="${esc(base)}" inputmode="url" />
      </label>
      <p class="hint">${isLocal
        ? "This looks like a local address. A tag must point at the public HTTPS address (for example your GitHub Pages URL), or it won't open from your phone."
        : "Tags will open this address. Change it here if you move the app."}</p>
    </section>
    ${TAGS.map((t) => `
      <section class="card tag" data-tag="${t.id}">
        <div class="tagtxt">
          <h2>${t.title}</h2>
          <p class="hint">${t.blurb}</p>
          <code id="u-${t.id}"></code>
          <div class="row"><button data-act="copy-url:${t.id}">Copy link</button></div>
        </div>
        <img id="q-${t.id}" class="qr" alt="QR code for the ${t.title} tag" width="120" height="120" />
      </section>`).join("")}
    <section class="card">
      <h2>Writing a tag on iPhone</h2>
      <ol class="steps">
        <li>Install the free <b>NFC Tools</b> app.</li>
        <li>Write &rarr; Add a record &rarr; <b>URL / URI</b> &rarr; paste the link above.</li>
        <li>Tap Write, then hold the top of your iPhone against the tag until it confirms.</li>
        <li>Test it by tapping the tag with the phone's screen on. A banner appears; tap it.</li>
        <li>Happy with it? Lock the tag (NFC Tools &rarr; Other &rarr; Lock tag) so it can't be rewritten. This is permanent.</li>
      </ol>
      <p class="hint">No tags yet? The QR codes do the same job. Point the camera at one.</p>
    </section>`;
}

// ---------- routing ----------
function route() {
  const h = location.hash.replace(/^#/, "") || "/";
  const now = Date.now();

  if (h === "/t/focus" || h === "/t/break") {
    const tag: Kind = h.endsWith("focus") ? "focus" : "break";
    const r = tapTag(tag, now, true);
    const t = describe(r);
    showToast(t.text, t.tone);
    // Replace the URL so a refresh can't toggle the timer a second time.
    history.replaceState(null, "", location.pathname + location.search + "#/");
    return render("dash");
  }
  if (h === "/t/leetcode" || h === "/log") return render("log");
  if (h === "/tags") return render("tags");
  return render("dash");
}

type View = "dash" | "log" | "tags";
let view: View = "dash";

function render(v: View) {
  view = v;
  const now = Date.now();
  app.innerHTML = v === "dash" ? dashboardHTML(now) : v === "log" ? logHTML() : tagsHTML();
  window.scrollTo(0, 0);
  if (v === "tags") fillTags();
  tick();
}

function fillTags() {
  const base = load().settings.baseUrl || defaultBase();
  for (const t of TAGS) {
    const url = `${base.replace(/#.*$/, "")}#/t/${t.id}`;
    const code = document.getElementById(`u-${t.id}`);
    if (code) code.textContent = url;
    QRCode.toDataURL(url, { margin: 1, width: 240, errorCorrectionLevel: "M" })
      .then((src) => {
        const img = document.getElementById(`q-${t.id}`) as HTMLImageElement | null;
        if (img) img.src = src;
      })
      .catch(() => {});
  }
}

// Update the running clock without re-rendering (keeps scroll position and focus).
function tick() {
  const a = load().active;
  if (!a) {
    document.title = "DeskTap";
    return;
  }
  const now = Date.now();
  const elapsed = now - a.start;
  const total = a.targetMin * 60_000;
  const over = elapsed > total;
  const text = over ? "+" + mmss(elapsed - total) : mmss(total - elapsed);
  document.title = `${text} · ${a.kind === "focus" ? "Focus" : "Break"}`;
  const clock = document.getElementById("clock");
  if (clock) clock.textContent = text;
  const bar = document.getElementById("bar");
  if (bar) (bar as HTMLElement).style.width = `${Math.min(100, (elapsed / total) * 100).toFixed(1)}%`;
  // Flip the label in place. (Re-rendering here would call tick() again and loop.)
  const eyebrow = document.getElementById("eyebrow");
  if (eyebrow) eyebrow.textContent = `${a.kind === "focus" ? "Focus" : "Break"} ${over ? "· time's up" : "running"}`;
}

// ---------- events ----------
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function flash(text: string, tone: "ok" | "info" | "warn" = "ok") {
  showToast(text, tone);
  document.getElementById("toast")?.remove();
  const holder = document.querySelector(".top");
  holder?.insertAdjacentHTML("afterend", toastHTML());
}

app.addEventListener("click", async (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
  if (!el) return;
  const act = el.dataset.act!;

  if (act === "tap-focus" || act === "tap-break") {
    const t = describe(tapTag(act === "tap-focus" ? "focus" : "break", Date.now(), false));
    showToast(t.text, t.tone);
    return render("dash");
  }
  if (act === "copy-update") {
    const ok = await copyText(document.getElementById("update")?.textContent ?? "");
    return flash(ok ? "Update copied." : "Couldn't copy. Long-press the text to select it.", ok ? "ok" : "warn");
  }
  if (act.startsWith("copy-url:")) {
    const id = act.split(":")[1];
    const ok = await copyText(document.getElementById(`u-${id}`)?.textContent ?? "");
    return flash(ok ? "Link copied." : "Couldn't copy. Long-press the link to select it.", ok ? "ok" : "warn");
  }
  if (act === "export") {
    const blob = new Blob([exportJSON()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `desktap-backup-${dayKey(Date.now())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return;
  }
  if (act === "import") {
    return document.getElementById("file")?.click();
  }
  if (act.startsWith("del-")) {
    const [kind, id] = act.slice(4).split(":");
    if (!confirm("Delete this entry?")) return;
    if (kind === "p") removeProblem(id);
    else removeSession(id);
    return render("dash");
  }
});

app.addEventListener("change", async (e) => {
  const t = e.target as HTMLInputElement;
  if (t.id === "file" && t.files?.[0]) {
    try {
      importJSON(await t.files[0].text());
      showToast("Backup restored.");
    } catch (err: any) {
      showToast(err?.message || "Couldn't read that file.", "warn");
    }
    render("dash");
  }
});

app.addEventListener("input", (e) => {
  const t = e.target as HTMLInputElement;
  if (t.id === "base") {
    setBaseUrl(t.value.trim());
    fillTags();
  }
});

app.addEventListener("submit", (e) => {
  const form = e.target as HTMLFormElement;
  if (form.id !== "logform") return;
  e.preventDefault();
  const f = new FormData(form);
  const name = String(f.get("name") || "").trim();
  if (!name) return;
  const mins = Math.max(0, Math.min(600, Math.round(Number(f.get("minutes")) || 0)));
  const status = f.get("status") as Status;
  addProblem({
    at: Date.now(),
    name,
    difficulty: f.get("difficulty") as Difficulty,
    status,
    minutes: mins,
  });
  showToast(status === "Solved" ? `Logged "${name}". Streak: ${currentStreak(load().problems, Date.now())} days.` : `Logged "${name}" as stuck.`);
  history.replaceState(null, "", location.pathname + location.search + "#/");
  render("dash");
});

window.addEventListener("hashchange", route);
// Resume correctly when Safari restores the tab after the phone was locked.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") tick();
});
window.setInterval(tick, 1000);
save();
route();
