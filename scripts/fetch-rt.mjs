// Fetch Rotten Tomatoes scores for every movie in data.js and emit rt.js.
// RT has no public API or dataset: each movie page embeds its scorecard as
// JSON (#media-scorecard-json), so we fetch pages by slug. Slugs are derived
// from the title, with hand-pinned overrides where RT disambiguates by year.
// Movies only, to match the IMDb tab.
import { readFileSync, writeFileSync } from "node:fs";

const dataSrc = readFileSync(new URL("../data.js", import.meta.url), "utf8");
const { MOVIES } = new Function(`${dataSrc}; return { MOVIES };`)();

const OVERRIDES = {
  "The Avengers": "marvels_the_avengers",
  "Doctor Strange": "doctor_strange_2016",
  "Black Panther": "black_panther_2018",
  "Black Widow": "black_widow_2021",
};

const slugify = (title) => title.toLowerCase()
  .replace(/&/g, "and").replace(/-/g, " ")
  .replace(/[^a-z0-9 ]/g, "").trim().replace(/ +/g, "_");

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

async function fetchScores(slug) {
  const res = await fetch(`https://www.rottentomatoes.com/m/${slug}`, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const html = await res.text();
  const m = html.match(/<script[^>]*id="media-scorecard-json"[^>]*>(.*?)<\/script>/s);
  if (!m) return null;
  const card = JSON.parse(m[1]);
  const critics = Number(card.criticsScore?.score);
  const audience = Number(card.audienceScore?.score);
  if (!Number.isFinite(critics)) return null;
  return { critics, audience: Number.isFinite(audience) ? audience : null, slug };
}

const rt = {};
const missing = [];
for (const mv of MOVIES) {
  const slug = OVERRIDES[mv.title] ?? slugify(mv.title);
  const scores = await fetchScores(slug);
  if (scores) rt[mv.title] = scores;
  else missing.push(`${mv.title} (tried /m/${slug})`);
  await new Promise((r) => setTimeout(r, 400)); // be polite
}

if (missing.length) console.log("MISSING:\n  " + missing.join("\n  "));

const date = new Date().toISOString().slice(0, 10);
const out = "// Rotten Tomatoes scores scraped from each movie page's scorecard JSON.\n" +
  "// critics = Tomatometer %, audience = Popcornmeter %.\n" +
  "// Regenerate with scripts/fetch-rt.mjs.\n" +
  `const RT_SNAPSHOT = "${date}";\n` +
  "const RT = " + JSON.stringify(rt, null, 2) + ";\n";
writeFileSync(process.argv[2] ?? new URL("../rt.js", import.meta.url), out);
console.log(`ok: wrote ${Object.keys(rt).length}/${MOVIES.length} scores (snapshot ${date})`);
