// releases.js is kept by hand: check its shape and the Upcoming tab's date logic.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const ctx = vm.createContext({});
vm.runInContext(read("data.js") + "\n" + read("releases.js") +
  ";globalThis.r = { RELEASES, UPCOMING, upcomingReleases, releaseLabel, releaseCountdown };", ctx);
const { RELEASES, UPCOMING, upcomingReleases, releaseLabel, releaseCountdown } = ctx.r;
const plain = (x) => JSON.parse(JSON.stringify(x));

test("every release has a unique title, a type and a valid date or null", () => {
  const titles = RELEASES.map((r) => r.title);
  assert.equal(new Set(titles).size, titles.length);
  for (const r of RELEASES) {
    assert.ok(["movie", "show"].includes(r.type), `${r.title} type ${r.type}`);
    assert.ok(r.date === null || /^\d{4}(-\d{2}(-\d{2})?)?$/.test(r.date), `${r.title} date ${r.date}`);
    if (r.date?.length === 10) assert.ok(!Number.isNaN(Date.parse(r.date)), `${r.title} date ${r.date}`);
  }
});

test("every sheet UPCOMING title has a releases.js entry (add one, null = TBA)", () => {
  const known = new Set(RELEASES.map((r) => r.title));
  assert.deepEqual(plain(UPCOMING.filter((t) => !known.has(t))), []);
});

test("upcomingReleases sorts soonest first, windows after exact dates, TBA last, drops past ones", () => {
  const list = plain(upcomingReleases(["Unlisted Thing", "New Show Season 1"], "2027-10-15", (t) => /season\b/i.test(t)));
  const keys = list.map((r) => r.date);
  assert.ok(!keys.includes("2026-12-18"), "a passed exact date drops out");
  assert.ok(keys.includes("2027-10") && keys.includes("2027"), "a window stays until it ends");
  assert.ok(keys.indexOf("2027-12-17") < keys.indexOf("2027"), "year window sorts after its exact dates");
  assert.ok(keys.indexOf("2027-10") < keys.indexOf("2027-12-17"));
  assert.deepEqual(list.slice(-2), [
    { title: "Unlisted Thing", type: "movie", date: null },
    { title: "New Show Season 1", type: "show", date: null },
  ]);
  const later = plain(upcomingReleases([], "2028-01-01", () => false)).map((r) => r.date);
  assert.ok(!later.includes("2027") && !later.includes("2027-10"), "windows drop once they end");
});

test("labels and countdowns", () => {
  assert.equal(releaseLabel("2026-12-18"), "Dec 18, 2026");
  assert.equal(releaseLabel("2027-10"), "Oct 2027");
  assert.equal(releaseLabel("2028"), "2028");
  assert.equal(releaseLabel(null), "TBA");
  assert.equal(releaseCountdown("2026-12-18", "2026-12-18"), "Out today");
  assert.equal(releaseCountdown("2026-12-18", "2026-12-17"), "Tomorrow");
  assert.equal(releaseCountdown("2026-12-18", "2026-11-24"), "In 24 days");
  assert.equal(releaseCountdown("2027-12-17", "2026-11-24"), "In 13 months");
  assert.equal(releaseCountdown("2027-10", "2026-11-24"), null);
  assert.equal(releaseCountdown(null, "2026-11-24"), null);
});
