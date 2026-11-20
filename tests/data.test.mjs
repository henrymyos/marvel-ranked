// Checks data.js after scripts/fetch-sheet.mjs rewrites it: that script only
// warns about mismatches, so these fail loudly before a bad sync ships.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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

test("coverThumb maps Wikipedia posters to a standard-width thumbnail, others untouched", () => {
  const coverThumb = vm.runInNewContext(read("covers.js") + ";coverThumb");
  assert.equal(
    coverThumb("https://upload.wikimedia.org/wikipedia/en/0/0d/Avengers_Endgame_poster.jpg", 120),
    "https://upload.wikimedia.org/wikipedia/en/thumb/0/0d/Avengers_Endgame_poster.jpg/120px-Avengers_Endgame_poster.jpg",
  );
  const other = "https://m.media-amazon.com/images/M/x._V1_UX400_.jpg";
  assert.equal(coverThumb(other, 120), other);
  assert.equal(coverThumb(undefined, 120), undefined);
});

test("characters: unique names, known groups, portrait files exist and none are orphaned", () => {
  const c = JSON.parse(vm.runInNewContext(read("characters.js") +
    ";JSON.stringify({ HERO_GROUPS, HEROES, VILLAIN_GROUPS, VILLAINS })"));
  const all = [...c.HEROES, ...c.VILLAINS];
  // CHARACTER_ART is keyed by name, so a repeated name would silently share one portrait.
  assert.deepEqual(dupes(all.map((x) => x.name)), []);
  for (const x of c.HEROES) assert.ok(c.HERO_GROUPS[x.group], `${x.name}: unknown hero group ${x.group}`);
  for (const x of c.VILLAINS) assert.ok(c.VILLAIN_GROUPS[x.group], `${x.name}: unknown villain group ${x.group}`);
  for (const x of all) assert.ok(existsSync(new URL(`../${x.img}`, import.meta.url)), `${x.name}: ${x.img} not found`);
  const used = new Set(all.map((x) => x.img.split("/").pop()));
  const files = readdirSync(new URL("../art/characters/", import.meta.url)).filter((f) => !f.startsWith("."));
  assert.deepEqual(files.filter((f) => !used.has(f)), [], "portraits no character uses");
});
