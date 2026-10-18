import assert from "node:assert/strict";
import { currentStreak, bestStreak, solvedByDay, focusMinByDay, lastDays, weeklySummary, fmtMinutes } from "../src/stats";
import { defaults, tapTag, load, importJSON, exportJSON } from "../src/store";
import type { Problem } from "../src/store";

// Minimal localStorage stand-in so store.ts runs under Node.
const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
};

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const prob = (when: number, status: "Solved" | "Stuck" = "Solved", difficulty: any = "Medium"): Problem => ({
  id: String(Math.random()), at: when, name: "p", difficulty, status, minutes: 20,
});

let n = 0;
const test = (name: string, fn: () => void) => { fn(); n++; console.log("ok -", name); };

const now = at(2026, 10, 16, 9);

test("streak counts back from today", () => {
  const p = [prob(at(2026, 10, 16)), prob(at(2026, 10, 15)), prob(at(2026, 10, 14))];
  assert.equal(currentStreak(p, now), 3);
});
test("streak survives a day with nothing logged yet", () => {
  const p = [prob(at(2026, 10, 15)), prob(at(2026, 10, 14))];
  assert.equal(currentStreak(p, now), 2);
});
test("streak breaks after a missed day", () => {
  const p = [prob(at(2026, 10, 14)), prob(at(2026, 10, 13))];
  assert.equal(currentStreak(p, now), 0);
});
test("stuck problems do not count toward streak", () => {
  assert.equal(currentStreak([prob(at(2026, 10, 16), "Stuck")], now), 0);
});
test("two problems on one day count as one streak day", () => {
  const p = [prob(at(2026, 10, 16, 8)), prob(at(2026, 10, 16, 20))];
  assert.equal(currentStreak(p, now), 1);
  assert.equal(solvedByDay(p).get("2026-10-16"), 2);
});
test("best streak finds the longest run, across the DST change", () => {
  const p = [at(2026, 10, 22), at(2026, 10, 23), at(2026, 10, 24), at(2026, 10, 25), at(2026, 10, 26), at(2026, 10, 28)].map((t) => prob(t));
  assert.equal(bestStreak(p), 5);
});
test("lastDays returns 7 days oldest first, ending today", () => {
  const d = lastDays(7, now);
  assert.equal(d.length, 7);
  assert.equal(d[6].key, "2026-10-16");
  assert.equal(d[0].key, "2026-10-10");
});
test("fmtMinutes", () => {
  assert.equal(fmtMinutes(25), "25m");
  assert.equal(fmtMinutes(60), "1h");
  assert.equal(fmtMinutes(125), "2h 05m");
});

test("tag toggle: start, double-tap ignored, stop logs minutes", () => {
  const t0 = at(2026, 10, 16, 9);
  assert.equal(tapTag("focus", t0, true).type, "started");
  assert.equal(tapTag("focus", t0 + 1500, true).type, "ignored"); // iOS double open
  const r = tapTag("focus", t0 + 26 * 60_000, true);
  assert.equal(r.type, "stopped");
  if (r.type === "stopped") assert.equal(r.session.minutes, 26);
  assert.equal(load().active, null);
});
test("accidental tap under a minute is discarded, not logged", () => {
  const t0 = at(2026, 10, 16, 10);
  tapTag("focus", t0, true);
  const r = tapTag("focus", t0 + 10_000, true);
  assert.equal(r.type, "discarded");
  assert.equal(load().sessions.length, 1);
});
test("tapping break while focusing logs focus and starts the break", () => {
  const t0 = at(2026, 10, 16, 11);
  tapTag("focus", t0, true);
  const r = tapTag("break", t0 + 30 * 60_000, true);
  assert.equal(r.type, "switched");
  assert.equal(load().active?.kind, "break");
  assert.equal(load().sessions.length, 2);
  tapTag("break", t0 + 40 * 60_000, true); // stop the break
});
test("focus minutes are summed per day and breaks are excluded", () => {
  const m = focusMinByDay(load().sessions);
  assert.equal([...m.values()].reduce((a, b) => a + b, 0), 26 + 30);
});
test("weekly summary mentions the numbers", () => {
  const d = defaults();
  d.problems = [prob(at(2026, 10, 16), "Solved", "Easy"), prob(at(2026, 10, 15), "Solved", "Hard"), prob(at(2026, 10, 15), "Stuck")];
  const s = weeklySummary(d, now);
  assert.match(s, /2 solved \(1 easy, 0 medium, 1 hard\), 1 still stuck/);
  assert.match(s, /Streak: 2 days/);
});
test("export then import round-trips; junk is rejected", () => {
  const json = exportJSON();
  importJSON(json);
  assert.equal(load().sessions.length, 3); // two focus sessions + the stopped break
  assert.throws(() => importJSON('{"hello":1}'));
  assert.throws(() => importJSON("not json"));
});

console.log(`\n${n} tests passed`);
