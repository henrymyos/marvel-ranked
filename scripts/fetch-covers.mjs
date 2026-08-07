// Fetch poster thumbnails for each title from Wikipedia's pageimages API
// and emit covers.js mapping site title -> image URL.
import { writeFileSync } from "node:fs";

const WIKI = {
  "Iron Man": "Iron Man (2008 film)",
  "The Incredible Hulk": "The Incredible Hulk (film)",
  "Iron Man 2": "Iron Man 2",
  "Thor": "Thor (film)",
  "Captain America: The First Avenger": "Captain America: The First Avenger",
  "The Avengers": "The Avengers (2012 film)",
  "Iron Man 3": "Iron Man 3",
  "Thor: The Dark World": "Thor: The Dark World",
  "Captain America: The Winter Soldier": "Captain America: The Winter Soldier",
  "Guardians of the Galaxy": "Guardians of the Galaxy (film)",
  "Avengers: Age of Ultron": "Avengers: Age of Ultron",
  "Ant-Man": "Ant-Man (film)",
  "Captain America: Civil War": "Captain America: Civil War",
  "Doctor Strange": "Doctor Strange (2016 film)",
  "Guardians of the Galaxy Vol. 2": "Guardians of the Galaxy Vol. 2",
  "Spider-Man: Homecoming": "Spider-Man: Homecoming",
  "Thor: Ragnarok": "Thor: Ragnarok",
  "Black Panther": "Black Panther (film)",
  "Avengers: Infinity War": "Avengers: Infinity War",
  "Ant-Man and the Wasp": "Ant-Man and the Wasp",
  "Captain Marvel": "Captain Marvel (film)",
  "Avengers: Endgame": "Avengers: Endgame",
  "Spider-Man: Far From Home": "Spider-Man: Far From Home",
  "Black Widow": "Black Widow (2021 film)",
  "Shang-Chi and The Legend of the Ten Rings": "Shang-Chi and the Legend of the Ten Rings",
  "Eternals": "Eternals (film)",
  "Spider-Man: No Way Home": "Spider-Man: No Way Home",
  "Doctor Strange in the Multiverse of Madness": "Doctor Strange in the Multiverse of Madness",
  "Thor: Love and Thunder": "Thor: Love and Thunder",
  "Black Panther: Wakanda Forever": "Black Panther: Wakanda Forever",
  "Ant-Man and the Wasp: Quantumania": "Ant-Man and the Wasp: Quantumania",
  "Guardians of the Galaxy Vol. 3": "Guardians of the Galaxy Vol. 3",
  "The Marvels": "The Marvels",
  "Deadpool and Wolverine": "Deadpool & Wolverine",
  "Captain America: Brave New World": "Captain America: Brave New World",
  "Thunderbolts*": "Thunderbolts*",
  "The Fantastic Four: First Steps": "The Fantastic Four: First Steps",
  "Spider-Man: Brand New Day": "Spider-Man: Brand New Day",
  "WandaVision": "WandaVision",
  "The Falcon and the Winter Soldier": "The Falcon and the Winter Soldier",
  "Loki Season 1": "Loki (season 1)",
  "What If Season 1": "What If...? (season 1)",
  "Hawkeye": "Hawkeye (TV series)",
  "Moon Knight": "Moon Knight (TV series)",
  "Ms. Marvel": "Ms. Marvel (TV series)",
  "I Am Groot Season 1": "I Am Groot",
  "She-Hulk: Attorney at Law": "She-Hulk: Attorney at Law",
  "Werewolf By Night": "Werewolf by Night (TV special)",
  "Guardians Holiday Special": "The Guardians of the Galaxy Holiday Special",
  "Secret Invasion": "Secret Invasion (TV series)",
  "I Am Groot Season 2": "I Am Groot",
  "Loki Season 2": "Loki (season 2)",
  "What If Season 2": "What If...? (season 2)",
  "Echo": "Echo (TV series)",
  "Ironheart": "Ironheart (TV series)",
  "Wonder Man": "Wonder Man (TV series)",
  "Agatha All Along": "Agatha All Along",
  "What If Season 3": "What If...? (season 3)",
  "Daredevil: Born Again Season 1": "Daredevil: Born Again",
  "Eyes of Wakanda": "Eyes of Wakanda",
  "Marvel Zombies": "Marvel Zombies (TV series)",
  "Daredevil: Born Again Season 2": "Daredevil: Born Again",
  "The Punisher: One Last Kill": "The Punisher (special presentation)",
  "X-Men '97 Season 1": "X-Men '97",
  "Your Friendly Neighborhood Spider-Man": "Your Friendly Neighborhood Spider-Man",
  "Agents of SHIELD Season 1": "Agents of S.H.I.E.L.D. season 1",
  "Agents of SHIELD Season 2": "Agents of S.H.I.E.L.D. season 2",
  "Agents of SHIELD Season 3": "Agents of S.H.I.E.L.D. season 3",
  "Agents of SHIELD Season 4": "Agents of S.H.I.E.L.D. season 4",
  "Agents of SHIELD Season 5": "Agents of S.H.I.E.L.D. season 5",
  "Agents of SHIELD Season 6": "Agents of S.H.I.E.L.D. season 6",
  "Agents of SHIELD Season 7": "Agents of S.H.I.E.L.D. season 7",
  "Agent Carter Season 1": "Agent Carter season 1",
  "Agent Carter Season 2": "Agent Carter season 2",
  "Daredevil Season 1": "Daredevil season 1",
  "Daredevil Season 2": "Daredevil season 2",
  "Daredevil Season 3": "Daredevil season 3",
  "Jessica Jones Season 1": "Jessica Jones season 1",
  "Jessica Jones Season 2": "Jessica Jones season 2",
  "Jessica Jones Season 3": "Jessica Jones season 3",
  "Luke Cage Season 1": "Luke Cage season 1",
  "Luke Cage Season 2": "Luke Cage season 2",
  "Iron Fist Season 1": "Iron Fist season 1",
  "Iron Fist Season 2": "Iron Fist season 2",
  "The Defenders Season 1": "The Defenders (miniseries)",
  "Inhumans Season 1": "Inhumans (TV series)",
  "The Punisher Season 1": "The Punisher season 1",
  "The Punisher Season 2": "The Punisher season 2",
  "Runaways Season 1": "Runaways (TV series)",
  "Runaways Season 2": "Runaways season 2",
  "Runaways Season 3": "Runaways (TV series)",
  "Cloak & Dagger Season 1": "Cloak & Dagger season 1",
  "Cloak & Dagger Season 2": "Cloak & Dagger season 2",
};

const uniq = [...new Set(Object.values(WIKI))];
const thumbs = {}; // wiki title -> url

for (let i = 0; i < uniq.length; i += 50) {
  const batch = uniq.slice(i, i + 50);
  const url = "https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=thumbnail&pilicense=any&pithumbsize=400&redirects=1&titles=" +
    encodeURIComponent(batch.join("|"));
  const res = await fetch(url, { headers: { "User-Agent": "marvel-ranked-static-site/1.0" } });
  const data = await res.json();
  const redirect = {}; // to -> from(s)
  for (const r of data.query.redirects ?? []) redirect[r.to] = r.from;
  for (const r of data.query.normalized ?? []) redirect[r.to] ??= r.from;
  for (const page of Object.values(data.query.pages)) {
    const names = [page.title, redirect[page.title]].filter(Boolean);
    if (page.thumbnail) for (const n of names) thumbs[n] = page.thumbnail.source;
  }
}

// Pages with no poster in their infobox — hand-picked title logos instead.
const OVERRIDES = {
  "Hawkeye": "https://upload.wikimedia.org/wikipedia/en/7/7a/Hawkeye_%28miniseries%29_logo.png",
  "Wonder Man": "https://upload.wikimedia.org/wikipedia/en/b/bd/Wonder_Man_%28TV_series%29_logo.png",
};

const covers = { ...OVERRIDES };
const missing = [];
for (const [key, wiki] of Object.entries(WIKI)) {
  // Strip the API's utm_ tracking params — some content blockers stall on them.
  if (thumbs[wiki]) covers[key] ??= thumbs[wiki].replace(/\?utm_source=.*$/, "");
  else if (!covers[key]) missing.push(`${key} (${wiki})`);
}

const out = "// Poster thumbnails hotlinked from Wikipedia (pageimages API).\n" +
  "// Regenerate with scripts/fetch-covers.mjs if titles change.\n" +
  "const COVERS = " + JSON.stringify(covers, null, 2) + ";\n";
writeFileSync(process.argv[2] ?? "covers.js", out);
console.log(`ok: ${Object.keys(covers).length}/${Object.keys(WIKI).length}`);
if (missing.length) console.log("MISSING:\n  " + missing.join("\n  "));
