// scripts/fetch-sheet.mjs against a tiny sheet export: a rated legacy season at
// the bottom must not turn announced titles and the legacy block into
// "unwatched", and a released show below the last rated row stays unwatched.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("fetch-sheet keeps legacy, unwatched and announced titles apart", () => {
  const dir = mkdtempSync(join(tmpdir(), "mr-sheet-"));
  mkdirSync(join(dir, "scripts"));
  copyFileSync(new URL("../scripts/fetch-sheet.mjs", import.meta.url), join(dir, "scripts/fetch-sheet.mjs"));
  writeFileSync(join(dir, "data.js"), `
const MOVIES = [{ title: "Movie A", rating: 8, phase: 1, year: 2008 }, { title: "Movie B", rating: 5, phase: 1, year: 2009 }];
const SHOWS = [{ title: "Show A", rating: 6, phase: 4, year: 2021 }];
const UNWATCHED_SHOWS = [{ title: "Show U", phase: 4, year: 2021 }, { title: "Show New", phase: 6, year: 2026 }];
const LEGACY_SHOWS = [{ title: "Legacy A", phase: 2 }, { title: "Legacy B", phase: 2, year: 2015 }];`);
  // A title, B rating, D/E phase averages, H movie ranks, K show ranks.
  const rows = [
    ["", "", "", "", "", "", "", "Overall", "", "", "Overall"],
    ["Movie A", "8", "", "Phase 1", "8, 5", "6.5", "", "Movie A", "", "", "Legacy B"],
    ["Show A", "6", "", "", "", "", "", "Movie B", "", "", "Show A"],
    ["Show U", ""],
    ["Movie B", "5"],
    ["Show New", ""],
    ["Announced X", ""],
    ["Legacy A", ""],
    ["Legacy B", "9"],
  ];
  writeFileSync(join(dir, "sheet.csv"), rows.map((r) => r.join(",")).join("\n"));
  execFileSync(process.execPath, [join(dir, "scripts/fetch-sheet.mjs"), "--from", join(dir, "sheet.csv")], { stdio: "pipe" });

  const out = new Function(readFileSync(join(dir, "data.js"), "utf8") +
    ";return { SHOWS, SHOW_RANK_ORDER, UNWATCHED_SHOWS, UPCOMING, LEGACY_SHOWS }")();
  const titles = (xs) => xs.map((e) => e.title);
  assert.deepEqual(titles(out.SHOWS), ["Show A"]);
  assert.deepEqual(out.SHOW_RANK_ORDER, ["Show A"]);
  assert.deepEqual(titles(out.UNWATCHED_SHOWS), ["Show U", "Show New"]);
  assert.deepEqual(out.UPCOMING, ["Announced X"]);
  assert.deepEqual(titles(out.LEGACY_SHOWS), ["Legacy A", "Legacy B"]);
});
