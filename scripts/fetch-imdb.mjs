// Fetch IMDb ratings for every movie in data.js and emit imdb.js.
// Title -> tconst comes from IMDb's suggestion API; ratings come from the
// official daily dataset at datasets.imdbws.com (title pages block bots).
// Movies only: IMDb has no aggregate rating for individual show seasons.
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const dataSrc = readFileSync(new URL("../data.js", import.meta.url), "utf8");
const { MOVIES } = new Function(`${dataSrc}; return { MOVIES };`)();

// Suggestion-API misses or ambiguous matches, pinned by hand.
const OVERRIDES = {
  "Thunderbolts*": "tt20969586",
  "Spider-Man: Brand New Day": "tt22084616",
};

async function resolve(title, year) {
  if (OVERRIDES[title]) return OVERRIDES[title];
  const q = title.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const url = `https://v2.sg.media-imdb.com/suggestion/${q[0]}/${encodeURIComponent(q)}.json`;
  const res = await fetch(url, { headers: { "User-Agent": "marvel-ranked-static-site/1.0" } });
  if (!res.ok) return null;
  const { d = [] } = await res.json();
  const hit = d.find((e) => e.qid === "movie" && Math.abs((e.y ?? 0) - year) <= 1) ??
    d.find((e) => e.qid === "movie");
  return hit?.id ?? null;
}

const ids = {}; // title -> tconst
const unresolved = [];
for (const m of MOVIES) {
  const id = await resolve(m.title, m.year);
  if (id) ids[m.title] = id;
  else unresolved.push(m.title);
}

console.log(`resolved ${Object.keys(ids).length}/${MOVIES.length} titles`);
if (unresolved.length) console.log("UNRESOLVED:\n  " + unresolved.join("\n  "));

const res = await fetch("https://datasets.imdbws.com/title.ratings.tsv.gz");
const tsv = gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8");
const wanted = new Set(Object.values(ids));
const byId = {}; // tconst -> { rating, votes }
for (const line of tsv.split("\n")) {
  const [id, rating, votes] = line.split("\t");
  if (wanted.has(id)) byId[id] = { rating: Number(rating), votes: Number(votes) };
}

const imdb = {};
const unrated = [];
for (const m of MOVIES) {
  const id = ids[m.title];
  if (id && byId[id]) imdb[m.title] = { ...byId[id], id };
  else unrated.push(m.title);
}
if (unrated.length) console.log("NO RATING:\n  " + unrated.join("\n  "));

const date = new Date().toISOString().slice(0, 10);
const out = "// IMDb ratings from the official datasets (datasets.imdbws.com).\n" +
  "// Regenerate with scripts/fetch-imdb.mjs.\n" +
  `const IMDB_SNAPSHOT = "${date}";\n` +
  "const IMDB = " + JSON.stringify(imdb, null, 2) + ";\n";
writeFileSync(process.argv[2] ?? new URL("../imdb.js", import.meta.url), out);
console.log(`ok: wrote ${Object.keys(imdb).length} ratings (snapshot ${date})`);
