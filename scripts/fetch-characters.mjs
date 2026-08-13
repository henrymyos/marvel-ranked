// Fetch character portraits from the Marvel Cinematic Universe Wiki and emit
// characters.js (the hero/villain rosters) plus art/characters/*.
//
// Unlike posters, these portraits are self-hosted rather than hotlinked:
// Fandom's CDN blocks hotlinking unpredictably, and same-origin images keep
// the share-card canvas exportable. Each is fetched at 320px wide (~30 KB).
//
//   node scripts/fetch-characters.mjs
//
// Columns: display name, actor, group, MCU-wiki page (defaults to the name).
import { writeFileSync, mkdirSync } from "node:fs";

const HERO_GROUPS = {
  "Avengers": "#e05252",
  "Asgard": "#4a86e8",
  "Guardians": "#a05ce8",
  "Wakanda": "#2fb6a8",
  "Street Level": "#ef9f43",
  "New Blood": "#46b17b",
  "Mutants & F4": "#d9a53b",
  "S.H.I.E.L.D.": "#8a8781",
};

const HEROES = [
  ["Iron Man", "Robert Downey Jr.", "Avengers", "Tony Stark"],
  ["Captain America", "Chris Evans", "Avengers", "Steve Rogers"],
  ["Thor", "Chris Hemsworth", "Asgard"],
  ["Hulk", "Mark Ruffalo", "Avengers", "Bruce Banner"],
  ["Black Widow", "Scarlett Johansson", "Avengers", "Natasha Romanoff"],
  ["Hawkeye", "Jeremy Renner", "Avengers", "Clint Barton"],
  ["Nick Fury", "Samuel L. Jackson", "S.H.I.E.L.D."],
  ["War Machine", "Don Cheadle", "Avengers", "James Rhodes"],
  ["Falcon", "Anthony Mackie", "Avengers", "Sam Wilson"],
  ["Winter Soldier", "Sebastian Stan", "Avengers", "Bucky Barnes"],
  ["Scarlet Witch", "Elizabeth Olsen", "Avengers", "Wanda Maximoff"],
  ["Vision", "Paul Bettany", "Avengers"],
  ["Ant-Man", "Paul Rudd", "Avengers", "Scott Lang"],
  ["The Wasp", "Evangeline Lilly", "Avengers", "Hope van Dyne"],
  ["Spider-Man", "Tom Holland", "Avengers", "Peter Parker"],
  ["Doctor Strange", "Benedict Cumberbatch", "Avengers", "Stephen Strange"],
  ["Wong", "Benedict Wong", "Avengers"],
  ["Captain Marvel", "Brie Larson", "Avengers", "Carol Danvers"],
  ["Loki", "Tom Hiddleston", "Asgard"],
  ["Valkyrie", "Tessa Thompson", "Asgard"],
  ["Sylvie", "Sophia Di Martino", "Asgard", "Sylvie Laufeydottir"],
  ["Star-Lord", "Chris Pratt", "Guardians", "Peter Quill"],
  ["Gamora", "Zoe Saldaña", "Guardians"],
  ["Rocket", "Bradley Cooper", "Guardians", "Rocket Raccoon"],
  ["Groot", "Vin Diesel", "Guardians"],
  ["Drax", "Dave Bautista", "Guardians"],
  ["Nebula", "Karen Gillan", "Guardians"],
  ["Mantis", "Pom Klementieff", "Guardians"],
  ["Yondu", "Michael Rooker", "Guardians", "Yondu Udonta"],
  ["Black Panther", "Chadwick Boseman", "Wakanda", "T'Challa"],
  ["Shuri", "Letitia Wright", "Wakanda"],
  ["Okoye", "Danai Gurira", "Wakanda"],
  ["Daredevil", "Charlie Cox", "Street Level", "Matt Murdock"],
  ["The Punisher", "Jon Bernthal", "Street Level", "Frank Castle"],
  ["Jessica Jones", "Krysten Ritter", "Street Level"],
  ["Luke Cage", "Mike Colter", "Street Level"],
  ["Iron Fist", "Finn Jones", "Street Level", "Danny Rand"],
  ["Moon Knight", "Oscar Isaac", "Street Level", "Marc Spector"],
  ["Shang-Chi", "Simu Liu", "New Blood"],
  ["Ms. Marvel", "Iman Vellani", "New Blood", "Kamala Khan"],
  ["She-Hulk", "Tatiana Maslany", "New Blood", "Jennifer Walters"],
  ["Yelena Belova", "Florence Pugh", "New Blood"],
  ["Kate Bishop", "Hailee Steinfeld", "New Blood"],
  ["Ironheart", "Dominique Thorne", "New Blood", "Riri Williams"],
  ["Echo", "Alaqua Cox", "New Blood", "Maya Lopez"],
  ["America Chavez", "Xochitl Gomez", "New Blood"],
  ["Monica Rambeau", "Teyonah Parris", "New Blood"],
  ["U.S. Agent", "Wyatt Russell", "New Blood", "John Walker"],
  ["Red Guardian", "David Harbour", "New Blood", "Alexei Shostakov"],
  ["Deadpool", "Ryan Reynolds", "Mutants & F4", "Wade Wilson"],
  ["Wolverine", "Hugh Jackman", "Mutants & F4", "James Howlett"],
  ["Mister Fantastic", "Pedro Pascal", "Mutants & F4", "Reed Richards"],
  ["Invisible Woman", "Vanessa Kirby", "Mutants & F4", "Sue Storm"],
  ["Human Torch", "Joseph Quinn", "Mutants & F4", "Johnny Storm"],
  ["The Thing", "Ebon Moss-Bachrach", "Mutants & F4", "Ben Grimm"],
  ["Peggy Carter", "Hayley Atwell", "S.H.I.E.L.D."],
  ["Phil Coulson", "Clark Gregg", "S.H.I.E.L.D."],
];

const VILLAIN_GROUPS = {
  "Multiversal": "#e62429",
  "Avengers Foes": "#e05252",
  "Cosmic": "#a05ce8",
  "Mystic": "#3fb6c4",
  "Spider-Man Foes": "#4a86e8",
  "Street Level": "#ef9f43",
  "Rogues": "#46b17b",
};

const VILLAINS = [
  ["Thanos", "Josh Brolin", "Multiversal"],
  ["Kang the Conqueror", "Jonathan Majors", "Multiversal"],
  ["He Who Remains", "Jonathan Majors", "Multiversal"],
  ["Galactus", "Ralph Ineson", "Multiversal"],
  ["Doctor Doom", "Robert Downey Jr.", "Multiversal", "Victor von Doom"],
  ["Ultron", "James Spader", "Avengers Foes"],
  ["Red Skull", "Hugo Weaving", "Avengers Foes"],
  ["Baron Zemo", "Daniel Brühl", "Avengers Foes", "Helmut Zemo"],
  ["Alexander Pierce", "Robert Redford", "Avengers Foes"],
  ["Red Hulk", "Harrison Ford", "Avengers Foes", "Thaddeus Ross"],
  ["Abomination", "Tim Roth", "Avengers Foes", "Emil Blonsky"],
  ["The Leader", "Tim Blake Nelson", "Avengers Foes", "Samuel Sterns"],
  ["Iron Monger", "Jeff Bridges", "Avengers Foes", "Obadiah Stane"],
  ["Whiplash", "Mickey Rourke", "Avengers Foes", "Ivan Vanko"],
  ["Aldrich Killian", "Guy Pearce", "Avengers Foes"],
  ["MODOK", "Corey Stoll", "Avengers Foes", "Darren Cross"],
  ["Taskmaster", "Olga Kurylenko", "Avengers Foes", "Antonia Dreykov"],
  ["Dreykov", "Ray Winstone", "Avengers Foes"],
  ["Ghost", "Hannah John-Kamen", "Avengers Foes", "Ava Starr"],
  ["Valentina de Fontaine", "Julia Louis-Dreyfus", "Avengers Foes", "Valentina Allegra de Fontaine"],
  ["Gravik", "Kingsley Ben-Adir", "Avengers Foes"],
  ["The Sentry", "Lewis Pullman", "Avengers Foes", "Robert Reynolds"],
  ["Hela", "Cate Blanchett", "Cosmic"],
  ["Malekith", "Christopher Eccleston", "Cosmic"],
  ["Gorr the God Butcher", "Christian Bale", "Cosmic", "Gorr"],
  ["Ronan the Accuser", "Lee Pace", "Cosmic", "Ronan"],
  ["Ego", "Kurt Russell", "Cosmic"],
  ["High Evolutionary", "Chukwudi Iwuji", "Cosmic"],
  ["Arishem", "David Kaye", "Cosmic"],
  ["Ikaris", "Richard Madden", "Cosmic"],
  ["Dormammu", "Benedict Cumberbatch", "Mystic"],
  ["Kaecilius", "Mads Mikkelsen", "Mystic"],
  ["Agatha Harkness", "Kathryn Hahn", "Mystic"],
  ["Arthur Harrow", "Ethan Hawke", "Mystic"],
  ["Mephisto", "Sacha Baron Cohen", "Mystic"],
  ["Green Goblin", "Willem Dafoe", "Spider-Man Foes", "Norman Osborn"],
  ["Doctor Octopus", "Alfred Molina", "Spider-Man Foes", "Otto Octavius"],
  ["Vulture", "Michael Keaton", "Spider-Man Foes", "Adrian Toomes"],
  ["Mysterio", "Jake Gyllenhaal", "Spider-Man Foes", "Quentin Beck"],
  ["Electro", "Jamie Foxx", "Spider-Man Foes", "Max Dillon"],
  ["Kingpin", "Vincent D'Onofrio", "Street Level", "Wilson Fisk"],
  ["Bullseye", "Wilson Bethel", "Street Level", "Benjamin Poindexter"],
  ["Kilgrave", "David Tennant", "Street Level"],
  ["Killmonger", "Michael B. Jordan", "Rogues", "Erik Stevens"],
  ["Namor", "Tenoch Huerta", "Rogues"],
  ["Xu Wenwu", "Tony Leung", "Rogues"],
  ["Cassandra Nova", "Emma Corrin", "Rogues"],
];

const UA = "marvel-ranked-static-site/1.0";
const WIDTH = 320;
const OUT_DIR = "art/characters";
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// name -> full-size portrait URL, via the wiki's pageimages API.
async function portraitUrls(rows) {
  const pages = rows.map(([name, , , page]) => page ?? name);
  const found = {};
  for (let i = 0; i < pages.length; i += 20) {
    const batch = pages.slice(i, i + 20);
    const url = "https://marvelcinematicuniverse.fandom.com/api.php?action=query&format=json&prop=pageimages&piprop=original&redirects=1&titles=" +
      encodeURIComponent(batch.join("|"));
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    const data = await res.json();
    const redirect = {}; // to -> from, so a redirected page answers to the name we asked for
    for (const r of data.query.redirects ?? []) redirect[r.to] = r.from;
    for (const r of data.query.normalized ?? []) redirect[r.to] ??= r.from;
    for (const page of Object.values(data.query.pages)) {
      if (!page.original) continue;
      for (const n of [page.title, redirect[page.title]].filter(Boolean)) found[n] = page.original.source;
    }
  }
  return found;
}

// The CDN content-negotiates, so a .png page image usually comes back as WebP.
const EXT = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif" };

async function download(url, name) {
  // Strip the ?cb= cache-buster before appending the thumbnailer path.
  const scaled = url.split("?")[0] + `/scale-to-width-down/${WIDTH}`;
  const res = await fetch(scaled, { headers: { "User-Agent": UA, "Accept": "image/webp,image/*" } });
  if (!res.ok) throw new Error(`${res.status} ${scaled}`);
  const ext = EXT[res.headers.get("content-type")?.split(";")[0]] ?? "jpg";
  const file = `${OUT_DIR}/${slug(name)}.${ext}`;
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

mkdirSync(OUT_DIR, { recursive: true });
const missing = [];

async function build(rows) {
  const urls = await portraitUrls(rows);
  const out = [];
  for (const [name, actor, group, page] of rows) {
    const url = urls[page ?? name];
    if (!url) { missing.push(`${name} (${page ?? name})`); continue; }
    out.push({ name, actor, group, img: await download(url, name) });
  }
  return out;
}

const heroes = await build(HEROES);
const villains = await build(VILLAINS);

const json = (x) => JSON.stringify(x, null, 2);
const body = `// MCU hero and villain rosters, with portraits from the Marvel Cinematic
// Universe Wiki self-hosted under art/characters/.
// Regenerate with scripts/fetch-characters.mjs.
const HERO_GROUPS = ${json(HERO_GROUPS)};

const HEROES = ${json(heroes)};

const VILLAIN_GROUPS = ${json(VILLAIN_GROUPS)};

const VILLAINS = ${json(villains)};

// Portrait lookup by name, for the share-card renderer.
const CHARACTER_ART = Object.fromEntries([...HEROES, ...VILLAINS].map((c) => [c.name, c.img]));
`;
writeFileSync(process.argv[2] ?? "characters.js", body);
console.log(`ok: ${heroes.length} heroes, ${villains.length} villains`);
if (missing.length) console.log("MISSING:\n  " + missing.join("\n  "));
