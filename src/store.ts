// All state lives in the browser's localStorage. No server, no account.

export type Kind = "focus" | "break";
export type Difficulty = "Easy" | "Medium" | "Hard";
export type Status = "Solved" | "Stuck";

export interface Session {
  id: string;
  kind: Kind;
  start: number;
  end: number;
  minutes: number;
}

export interface Problem {
  id: string;
  at: number;
  name: string;
  difficulty: Difficulty;
  status: Status;
  minutes: number;
}

export interface Active {
  kind: Kind;
  start: number;
  targetMin: number;
}

export interface Settings {
  focusMin: number;
  breakMin: number;
  baseUrl: string;
}

export interface Data {
  sessions: Session[];
  problems: Problem[];
  active: Active | null;
  settings: Settings;
  lastTap: Record<string, number>;
}

const KEY = "desktap.v1";
const MIN_LOGGED_MS = 60_000; // anything shorter than a minute is treated as an accidental tap
const DEBOUNCE_MS = 4_000; // ignore a second tap of the same tag within this window

export const defaults = (): Data => ({
  sessions: [],
  problems: [],
  active: null,
  settings: { focusMin: 25, breakMin: 5, baseUrl: "" },
  lastTap: {},
});

let mem: Data | null = null;

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function normalize(p: any): Data {
  const d = defaults();
  if (!p || typeof p !== "object") return d;
  if (Array.isArray(p.sessions)) d.sessions = p.sessions;
  if (Array.isArray(p.problems)) d.problems = p.problems;
  if (p.active && typeof p.active.start === "number") d.active = p.active;
  if (p.settings && typeof p.settings === "object") d.settings = { ...d.settings, ...p.settings };
  if (p.lastTap && typeof p.lastTap === "object") d.lastTap = p.lastTap;
  return d;
}

export function load(): Data {
  if (mem) return mem;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) mem = normalize(JSON.parse(raw));
  } catch {
    /* storage blocked or corrupt: fall through to defaults */
  }
  if (!mem) mem = defaults();
  return mem;
}

export function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(load()));
  } catch {
    /* private mode etc.: state stays in memory for this page load */
  }
}

export function exportJSON(): string {
  return JSON.stringify(load(), null, 2);
}

export function importJSON(text: string): void {
  const parsed = JSON.parse(text);
  if (!parsed || !Array.isArray(parsed.sessions) || !Array.isArray(parsed.problems)) {
    throw new Error("That file doesn't look like a DeskTap backup.");
  }
  mem = normalize(parsed);
  save();
}

export type TapResult =
  | { type: "started"; what: Kind }
  | { type: "stopped"; session: Session }
  | { type: "switched"; session: Session | null; what: Kind }
  | { type: "discarded" }
  | { type: "ignored" };

function finish(d: Data, now: number): Session | null {
  const a = d.active;
  d.active = null;
  if (!a) return null;
  const elapsed = now - a.start;
  if (elapsed < MIN_LOGGED_MS) return null;
  const s: Session = { id: uid(), kind: a.kind, start: a.start, end: now, minutes: Math.round(elapsed / 60_000) };
  d.sessions.push(s);
  return s;
}

/**
 * A tap on the Focus or Break tag.
 * Same tag while running -> stop and log. Different tag -> log the old one, start the new one.
 * `debounce` is true for real tag taps (iOS can open a link twice) and false for on-screen buttons.
 */
export function tapTag(tag: Kind, now: number, debounce: boolean): TapResult {
  const d = load();
  if (debounce) {
    const last = d.lastTap[tag] ?? 0;
    if (now - last >= 0 && now - last < DEBOUNCE_MS) return { type: "ignored" };
    d.lastTap[tag] = now;
  }
  const target = tag === "focus" ? d.settings.focusMin : d.settings.breakMin;
  let result: TapResult;
  if (d.active && d.active.kind === tag) {
    const s = finish(d, now);
    result = s ? { type: "stopped", session: s } : { type: "discarded" };
  } else if (d.active) {
    const s = finish(d, now);
    d.active = { kind: tag, start: now, targetMin: target };
    result = { type: "switched", session: s, what: tag };
  } else {
    d.active = { kind: tag, start: now, targetMin: target };
    result = { type: "started", what: tag };
  }
  save();
  return result;
}

export function addProblem(p: Omit<Problem, "id">): void {
  load().problems.push({ id: uid(), ...p });
  save();
}

export function removeProblem(id: string): void {
  const d = load();
  d.problems = d.problems.filter((p) => p.id !== id);
  save();
}

export function removeSession(id: string): void {
  const d = load();
  d.sessions = d.sessions.filter((s) => s.id !== id);
  save();
}

export function setBaseUrl(url: string): void {
  load().settings.baseUrl = url;
  save();
}
