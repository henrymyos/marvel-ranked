// Sync data.js from the "Marvel Ranked" Google Sheet.
//
//   node scripts/fetch-sheet.mjs              fetch the sheet and rewrite data.js
//   node scripts/fetch-sheet.mjs --from x.csv parse a downloaded CSV export instead
//
// Fetching anonymously needs the sheet shared as "Anyone with the link: Viewer"
// (Share button, top right). Until then, download it yourself via
// File > Download > CSV and pass it with --from.
//
// Sheet layout (single tab, gid 0):
//   A/B  every title (movies + shows interleaved) in release order + rating;
//        unwatched shows are unrated rows in their release slots; announced
//        titles and the legacy-TV block sit below the last rated row
//   D/E  phase averages, then franchise names + their rating lists
//   H    movies best -> worst ("Overall")     K  shows best -> worst
//
// Phase and year are NOT in the sheet — they are merged from the existing
// data.js, so new titles get nulls and a warning until filled in by hand.
import { readFileSync, writeFileSync } from "node:fs";

const SHEET_ID = "1-3oeBoGQcb41boRSuKK7dNIwyNLwTf-JehLraKr6XbU";
const DATA_PATH = new URL("../data.js", import.meta.url);

async function loadCsv() {
  const flag = process.argv.indexOf("--from");
  if (flag !== -1) return readFileSync(process.argv[flag + 1], "utf8");
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;
  const res = await fetch(url, { redirect: "follow" });
  const body = await res.text();
  if (!res.ok || body.trimStart().startsWith("<")) {
    console.error(
      "Could not fetch the sheet anonymously (it is probably not link-shared).\n" +
      "Either set sharing to \"Anyone with the link: Viewer\", or download it\n" +
      "(File > Download > CSV) and run: node scripts/fetch-sheet.mjs --from file.csv");
    process.exit(1);
  }
  return body;
}

// Minimal CSV parser: quoted fields, embedded commas/quotes/newlines.
function parseCsv(text) {
  const rows = [[]];
  let field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { rows.at(-1).push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      rows.at(-1).push(field); field = "";
      rows.push([]);
    } else field += c;
  }
  rows.at(-1).push(field);
  if (rows.at(-1).every((f) => f === "")) rows.pop();
  return rows;
}

const grid = parseCsv(await loadCsv());
const cell = (row, col) => (grid[row]?.[col] ?? "").trim();
const column = (col) =>
  grid.map((_, r) => ({ row: r, value: cell(r, col) })).filter((c) => c.value);

// Columns move as the sheet evolves, so locate everything by content instead
// of position. Column A is the single master release-order list (movies and
// shows interleaved, ratings in B, unwatched shows unrated); the two
// "Overall" headers mark the rank columns; "Phase 1" marks the averages.
const [A, B] = [0, 1];
const colCount = Math.max(...grid.map((r) => r.length));
const overallCols = [];
for (let c = 0; c < colCount; c++) if (cell(0, c) === "Overall") overallCols.push(c);
const [H, K] = overallCols;
if (K == null) { console.error("could not find the two Overall rank columns"); process.exit(1); }

const movieRank = column(H).map((c) => c.value).filter((v) => v !== "Overall");
const showRank = column(K).map((c) => c.value).filter((v) => v !== "Overall");
const isMovie = new Set(movieRank), isShow = new Set(showRank);

let D = -1;
outer: for (let c = 0; c < colCount; c++)
  for (let r = 0; r < grid.length; r++)
    if (cell(r, c) === "Phase 1") { D = c; break outer; }
if (D === -1) { console.error("could not locate the phase-averages column"); process.exit(1); }
const E = D + 1;

// The legacy-TV block is a closed set (the pre-Disney+ era is over), so tail
// titles are classified by membership in the previous data.js legacy list —
// no reliance on blank-row gaps, which get reshuffled in the sheet.
const prevSrc = readFileSync(DATA_PATH, "utf8");
const old = new Function(`${prevSrc}; return { MOVIES, SHOWS, UNWATCHED_SHOWS, LEGACY_SHOWS };`)();
const oldLegacySet = new Set((old.LEGACY_SHOWS ?? []).map((e) => (typeof e === "object" ? e.title : e)));

// One walk down column A classifies everything. At or before the last rated
// row: H-ranked = movie, K-ranked = show, unrated & unranked = unwatched
// show. Below the last rated row: legacy TV (by the known set) or announced.
const colA = column(A);
const lastRated = colA.findLast((c) => cell(c.row, B) !== "");
const movies = [], shows = [], unwatched = [], upcoming = [], legacy = [], strays = [];
const seen = new Set(), dupes = [];
for (const { row, value: title } of colA) {
  if (seen.has(title)) { dupes.push(title); continue; }
  seen.add(title);
  if (row > lastRated.row) {
    (oldLegacySet.has(title) ? legacy : upcoming).push(title);
    continue;
  }
  const rating = cell(row, B);
  if (isMovie.has(title)) movies.push({ title, rating: Number(rating) });
  else if (isShow.has(title)) shows.push({ title, rating: Number(rating) });
  else if (rating === "") unwatched.push(title);
  else strays.push(title);
}
if (dupes.length)
  console.warn("DUPLICATE rows in column A (kept the first, delete the extra in the sheet):\n  " + dupes.join("\n  "));

// Franchises: the D/E rows below the per-phase averages. Rating lists use
// ", " between watched entries and " : " across mixed watched/planned ones.
const franchises = column(D)
  .filter((c) => !/^Phase \d+$/.test(c.value))
  .map((c) => ({
    name: c.value,
    ratings: cell(c.row, E).split(/[,:]/).map(Number),
  }));
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
franchises.sort((a, b) => avg(b.ratings) - avg(a.ratings));

// Phase and year live only in data.js — carry them over for known titles.
const meta = {};
const oldUnwatched = (old.UNWATCHED_SHOWS ?? []).filter((e) => typeof e === "object");
const oldLegacy = (old.LEGACY_SHOWS ?? []).filter((e) => typeof e === "object");
for (const e of [...old.MOVIES, ...old.SHOWS, ...oldUnwatched, ...oldLegacy]) meta[e.title] = e;
const withMeta = (e) => ({
  ...e,
  phase: meta[e.title]?.phase ?? null,
  year: meta[e.title]?.year ?? null,
});

// Sanity report before overwriting anything.
const missingMeta = [...movies, ...shows, ...[...unwatched, ...legacy].map((t) => ({ title: t }))]
  .filter((e) => !meta[e.title]);
if (missingMeta.length)
  console.warn("NEW TITLES — fill in phase/year by hand:\n  " +
    missingMeta.map((e) => e.title).join("\n  "));
if (strays.length)
  console.warn("Rated in column A but ranked nowhere:\n  " + strays.join("\n  "));
for (const list of [[movies, movieRank], [shows, showRank]])
  for (const title of list[1])
    if (!list[0].some((e) => e.title === title))
      console.warn(`"${title}" is ranked but has no release-order rating`);

// Column A holds every title — movies, shows, unwatched shows interleaved —
// in true release order, so its row number is the global release position.
const aPos = {};
colA.forEach((c) => { if (!(c.value in aPos)) aPos[c.value] = c.row; });

const entry = (e) => `  { title: ${JSON.stringify(e.title)}, rating: ${e.rating}, phase: ${e.phase}, year: ${e.year}, release: ${aPos[e.title] ?? null} },`;
const name = (t) => `  ${JSON.stringify(t)},`;
const out = `// Data synced from the "Marvel Ranked" Google Sheet by scripts/fetch-sheet.mjs.
// Ratings are 0–10. Release-order rating columns are treated as canonical.
// Phase and year are not in the sheet: the script carries them over per title,
// so fill them in here whenever it reports a new one.

const MOVIES = [
${movies.map(withMeta).map(entry).join("\n")}
];

// Best → worst, from the "Overall" column of the sheet.
const MOVIE_RANK_ORDER = [
${movieRank.map(name).join("\n")}
];

const SHOWS = [
${shows.map(withMeta).map(entry).join("\n")}
];

const SHOW_RANK_ORDER = [
${showRank.map(name).join("\n")}
];

const UNWATCHED_SHOWS = [
${unwatched.map((t) => `  { title: ${JSON.stringify(t)}, phase: ${meta[t]?.phase ?? null}, year: ${meta[t]?.year ?? null}, release: ${aPos[t] ?? null} },`).join("\n")}
];

const UPCOMING = [
${upcoming.map(name).join("\n")}
];

// Pre-Disney+ era shows (release order), parked on their own page until
// they get watched and ranked.
const LEGACY_SHOWS = [
${legacy.map((t) => `  { title: ${JSON.stringify(t)}, phase: ${meta[t]?.phase ?? null} },`).join("\n")}
];

const FRANCHISES = [
${franchises.map((f) => `  { name: ${JSON.stringify(f.name)}, ratings: [${f.ratings.join(", ")}] },`).join("\n")}
];
`;

writeFileSync(DATA_PATH, out);
console.log(`ok: ${movies.length} movies, ${shows.length} shows, ` +
  `${unwatched.length} unwatched, ${upcoming.length} upcoming, ` +
  `${legacy.length} legacy, ${franchises.length} franchises`);
