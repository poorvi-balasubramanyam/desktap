import type { Data, Problem, Session } from "./store";

// Day keys use the device's local calendar day, so "today" matches what you see on your phone.
export const dayKey = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const addDays = (ts: number, n: number): number => {
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  return d.getTime();
};

export interface Day {
  key: string;
  label: string;
  ts: number;
}

/** The last n calendar days ending today, oldest first. */
export function lastDays(n: number, now: number): Day[] {
  const out: Day[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const ts = addDays(now, -i);
    out.push({ key: dayKey(ts), ts, label: new Date(ts).toLocaleDateString("en-GB", { weekday: "short" }) });
  }
  return out;
}

export function solvedByDay(problems: Problem[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of problems) {
    if (p.status !== "Solved") continue;
    const k = dayKey(p.at);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

export function focusMinByDay(sessions: Session[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of sessions) {
    if (s.kind !== "focus") continue;
    const k = dayKey(s.end);
    m.set(k, (m.get(k) ?? 0) + s.minutes);
  }
  return m;
}

/** Consecutive days with at least one solved problem. Today not yet solved doesn't break the streak. */
export function currentStreak(problems: Problem[], now: number): number {
  const days = solvedByDay(problems);
  let cursor = now;
  if (!days.has(dayKey(cursor))) cursor = addDays(cursor, -1);
  let n = 0;
  while (days.has(dayKey(cursor))) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

export function bestStreak(problems: Problem[]): number {
  const keys = [...solvedByDay(problems).keys()].sort();
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const k of keys) {
    const [y, m, d] = k.split("-").map(Number);
    const t = new Date(y, m - 1, d, 12).getTime(); // noon avoids DST edge cases
    run = prev !== null && Math.round((t - prev) / 86_400_000) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return best;
}

export const fmtMinutes = (min: number): string => {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${String(m).padStart(2, "0")}m` : `${h}h`;
};

/** A paste-ready summary of the last 7 days. */
export function weeklySummary(d: Data, now: number): string {
  const days = lastDays(7, now);
  const keys = new Set(days.map((x) => x.key));
  const solved = d.problems.filter((p) => p.status === "Solved" && keys.has(dayKey(p.at)));
  const stuck = d.problems.filter((p) => p.status === "Stuck" && keys.has(dayKey(p.at)));
  const by = (diff: string) => solved.filter((p) => p.difficulty === diff).length;
  const focus = d.sessions.filter((s) => s.kind === "focus" && keys.has(dayKey(s.end)));
  const focusMin = focus.reduce((a, s) => a + s.minutes, 0);
  const activeDays = new Set([...solved.map((p) => dayKey(p.at))]).size;
  return [
    `Weekly update (last 7 days)`,
    `- LeetCode: ${solved.length} solved (${by("Easy")} easy, ${by("Medium")} medium, ${by("Hard")} hard)` +
      (stuck.length ? `, ${stuck.length} still stuck` : ""),
    `- Streak: ${currentStreak(d.problems, now)} days (best ${bestStreak(d.problems)}), active ${activeDays}/7 days`,
    `- Deep work: ${fmtMinutes(focusMin)} across ${focus.length} focus sessions`,
  ].join("\n");
}
