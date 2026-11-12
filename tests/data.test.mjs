// Checks data.js after scripts/fetch-sheet.mjs rewrites it: that script only
// warns about mismatches, so these fail loudly before a bad sync ships.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
// JSON round-trip: arrays from another vm realm fail strict deepEqual.
const d = JSON.parse(vm.runInNewContext(
  ["data.js", "imdb.js", "rt.js", "covers.js"].map(read).join("\n") +
    ";JSON.stringify({ MOVIES, SHOWS, MOVIE_RANK_ORDER, SHOW_RANK_ORDER, UNWATCHED_SHOWS, UPCOMING, LEGACY_SHOWS, IMDB, RT, COVERS })",
));
const titles = (xs) => xs.map((e) => e.title);
const dupes = (xs) => xs.filter((x, i) => xs.indexOf(x) !== i);

test("rank orders list exactly the rated movies and shows", () => {
  assert.deepEqual([...d.MOVIE_RANK_ORDER].sort(), titles(d.MOVIES).sort());
  assert.deepEqual([...d.SHOW_RANK_ORDER].sort(), titles(d.SHOWS).sort());
});

test("no title appears twice across any list", () => {
  const all = [...titles(d.MOVIES), ...titles(d.SHOWS), ...titles(d.UNWATCHED_SHOWS), ...titles(d.LEGACY_SHOWS), ...d.UPCOMING];
  assert.deepEqual(dupes(all), []);
  assert.deepEqual(dupes(d.MOVIE_RANK_ORDER), []);
  assert.deepEqual(dupes(d.SHOW_RANK_ORDER), []);
});

test("rated titles have a 0-10 rating, phase, year and a unique release slot", () => {
  const rated = [...d.MOVIES, ...d.SHOWS];
  for (const e of rated) {
    assert.ok(Number.isFinite(e.rating) && e.rating >= 0 && e.rating <= 10, `${e.title} rating ${e.rating}`);
    assert.ok(Number.isInteger(e.phase), `${e.title} has no phase (fill it in by hand)`);
    assert.ok(Number.isInteger(e.year), `${e.title} has no year (fill it in by hand)`);
  }
  const slots = [...rated, ...d.UNWATCHED_SHOWS].map((e) => e.release);
  assert.ok(slots.every(Number.isInteger), "every release slot is a row number");
  assert.deepEqual(dupes(slots), []);
});

test("every movie has IMDb and Rotten Tomatoes numbers", () => {
  for (const t of titles(d.MOVIES)) {
    assert.ok(d.IMDB[t], `${t} missing from imdb.js`);
    assert.ok(d.RT[t], `${t} missing from rt.js`);
  }
});

test("every rated or unwatched show and movie has a cover", () => {
  for (const t of [...titles(d.MOVIES), ...titles(d.SHOWS), ...titles(d.UNWATCHED_SHOWS)])
    assert.ok(d.COVERS[t], `${t} missing from covers.js`);
});

test("every self-hosted cover file exists", () => {
  for (const [t, src] of Object.entries(d.COVERS))
    if (!/^https?:/.test(src)) assert.ok(existsSync(new URL(`../${src}`, import.meta.url)), `${t}: ${src} not found`);
});
