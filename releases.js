// Release dates for the Upcoming tab, kept by hand (fetch-sheet.mjs never
// touches this file). Release info only: rankings stay in the sheet.
// date: "YYYY-MM-DD" exact, "YYYY-MM" or "YYYY" for an announced window,
// null for TBA. Only official dates; a reported-but-unconfirmed month counts
// as TBA within its year. Titles in UPCOMING (from the sheet) use the sheet's
// exact spelling so both lists match. Checked 2026-11-24.
const RELEASES = [
  // Disney/Marvel date; first trailer (Jul 2026) kept it. Variety, Digital Trends, Jul 2026.
  { title: "Avengers: Doomsday", type: "movie", date: "2026-12-18" },
  // Marvel Television/Animation NYCC panel, Oct 8 2026 (Laughing Place). Moved from fall 2026.
  { title: "Your Friendly Neighborhood Spider-Man Season 2", type: "show", date: "2027-01-13" },
  // Filmed, in post; Marvel says 2027 (NYCC Oct 2026). "March 2027" is press guesswork, not official.
  { title: "Daredevil: Born Again Season 3", type: "show", date: "2027" },
  // Marvel Animation NYCC Oct 2026: Halloween specials, one a year.
  { title: "Marvel Zombies: The Winter Soldier", type: "show", date: "2027-10" },
  // Disney date (moved from May 7 2027 in 2025); Wikipedia MCU films list, Nov 2026.
  { title: "Avengers: Secret Wars", type: "movie", date: "2027-12-17" },
  // Disney 2028 slate, D23 Aug 2026 (Variety, Dark Horizons).
  { title: "X-Men", type: "movie", date: "2028-05-05" },
  { title: "Ghost Rider", type: "movie", date: "2028-07-28" },
  { title: "Black Panther 3", type: "movie", date: "2028-12-15" },
  // Marvel Television NYCC Oct 2026: live-action spy series, filming spring 2027.
  { title: "Zodiac", type: "show", date: "2028" },
  { title: "Marvel Zombies: The Fist of Khonshu", type: "show", date: "2028-10" },
  { title: "Marvel Zombies: The Last Guardian", type: "show", date: "2029-10" },
  // Announced or in development, no date yet.
  { title: "X-Men '97 Season 3", type: "show", date: null },
  { title: "Shang Chi 2", type: "movie", date: null },
  { title: "Nova", type: "movie", date: null },
  // On the sheet's coming-up list; no Marvel release date announced.
  { title: "Deadpool 4", type: "movie", date: null },
  { title: "Spider Man 5", type: "movie", date: null },
];

const RELEASES_CHECKED = "2026-11-24";

// Sort key: a window sorts after every exact date inside it, TBA sorts last.
const releaseKey = (d) => (d == null ? "9999" : d.length === 10 ? d : `${d}-99`);

// RELEASES plus any sheet UPCOMING title not listed here (as TBA), minus
// anything whose date or window has passed, soonest first. today: "YYYY-MM-DD".
function upcomingReleases(sheetTitles, today, isShow) {
  const known = new Set(RELEASES.map((r) => r.title));
  const extra = sheetTitles.filter((t) => !known.has(t))
    .map((t) => ({ title: t, type: isShow(t) ? "show" : "movie", date: null }));
  return [...RELEASES, ...extra]
    .filter((r) => releaseKey(r.date) >= today)
    .sort((a, b) => releaseKey(a.date).localeCompare(releaseKey(b.date)));
}

function releaseLabel(d) {
  if (d == null) return "TBA";
  if (d.length === 4) return d;
  const opts = d.length === 10 ? { month: "short", day: "numeric", year: "numeric" } : { month: "short", year: "numeric" };
  return new Date(`${d.length === 7 ? `${d}-01` : d}T00:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}

// Only exact dates get a countdown; windows and TBA return null.
function releaseCountdown(d, today) {
  if (d == null || d.length !== 10) return null;
  const days = Math.round((Date.parse(d) - Date.parse(today)) / 864e5);
  if (days <= 0) return "Out today";
  if (days === 1) return "Tomorrow";
  if (days < 60) return `In ${days} days`;
  return `In ${Math.round(days / 30.44)} months`;
}
