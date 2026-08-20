const $ = (sel) => document.querySelector(sel);

const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const fmt = (n) => (Math.round(n * 100) / 100).toFixed(2).replace(/0$/, "").replace(/\.0$/, "");

// Everything starts unranked: the ranked lists begin empty and every title
// sits in an "unranked" pool in release order, waiting to be dragged in.
// The ratings baked into data.js are metadata for the sheet scripts, never
// applied here — an account's pack (Henry's is the sheet itself) is the
// only thing that fills the ranked lists.
const MOVIE_META = new Map(MOVIES.map(({ rating, ...m }, i) => [m.title, { ...m, type: "movie", release: m.release ?? i + 1 }]));
const SHOW_META = new Map(SHOWS.map(({ rating, ...s }, i) => [s.title, { ...s, type: "show", release: s.release ?? i + 1 }]));
const UNWATCHED_META = new Map(UNWATCHED_SHOWS.map((u) => [u.title, { ...u, type: "show", release: u.release ?? null }]));
// Pre-Disney+ seasons are a watchlist, not a ranking: they stay out of both
// pools until they're added by hand from the Legacy TV tab. They are real
// show titles though, so a saved pack may carry them. LEGACY_SHOWS is in
// release order and every one of them predates WandaVision, hence the
// negative release numbers — added, they sit at the left of release-order
// views where they belong rather than at the end.
const LEGACY_META = new Map(LEGACY_SHOWS.map((s, i) =>
  [s.title, { ...s, type: "show", year: s.year ?? null, release: i - LEGACY_SHOWS.length }]));
const ALL_SHOW_TITLES = new Set([...SHOW_META.keys(), ...UNWATCHED_META.keys(), ...LEGACY_META.keys()]);

const byRelease = (metas) => [...metas]
  .sort((a, b) => (a.release ?? Infinity) - (b.release ?? Infinity))
  .map((m) => m.title);

const movies = [];
let unrankedMovies = byRelease([...MOVIE_META.values()]);
const shows = [];
let unwatchedShows = byRelease([...SHOW_META.values(), ...UNWATCHED_META.values()]);

// Edits live in this browser (a cache of the account copy while signed in).
// The ".v2" keys date from the accounts era: v1 caches were written back
// when the site was single-user, so a device that visited before accounts
// existed would otherwise show those rankings to a signed-out visitor.
const EDITS_KEY = "marvelRankedEdits.v2";
localStorage.removeItem("marvelRankedEdits");
localStorage.removeItem("marvelRankedGuesses");

// Promoted legacy seasons ride in the guesses store: title -> rating, or
// null while the season is still in the pool. The sheet keeps the legacy
// block below its last rated row, and only that row's position tells it
// what counts as unwatched — so it can't say which legacy seasons were
// added by hand, and a pooled one has nothing to come back from. The
// guesses store is saved and restored whole, so it carries that instead.
const LEGACY_STORE = "__legacy";
let legacyPromoted = {};

// A show dragged into the rankings keeps its metadata if it ever had any;
// otherwise phase/year stay null and phase- and year-based views skip it.
const promotedShow = (title) => {
  const meta = SHOW_META.get(title) ?? UNWATCHED_META.get(title) ?? LEGACY_META.get(title);
  return meta ? { ...meta } : { title, type: "show", phase: null, year: null, release: null };
};

// Apply a rankings pack ({movies, shows, unwatched} in best-to-worst order)
// from localStorage or the sheet web app. Ranked entries may be any unique
// subset of the known titles; everything left over returns to the unranked
// pools. Unknown titles reject that list wholesale (a stale pack from
// before a rename must not half-apply). Returns whether anything applied.
function applyPack(saved) {
  if (!saved) return false;
  let applied = false;

  if (Array.isArray(saved.movies)) {
    if (new Set(saved.movies.map((e) => e.t)).size === saved.movies.length &&
        saved.movies.every((e) => MOVIE_META.has(e.t) && Number.isInteger(e.r) && e.r >= 0 && e.r <= 10)) {
      movies.length = 0;
      saved.movies.forEach((e, i) => movies.push({ ...MOVIE_META.get(e.t), rating: e.r, rank: i + 1 }));
      const ranked = new Set(saved.movies.map((e) => e.t));
      unrankedMovies = byRelease([...MOVIE_META.values()].filter((m) => !ranked.has(m.title)));
      applied = true;
    }
  }

  // The saved unwatched list carries movie titles too (the web app keeps one
  // clear-these-ratings list); only real show titles count here.
  if (Array.isArray(saved.shows)) {
    // A rating the sheet couldn't store comes back empty; fill it from the
    // legacy store before judging the list, or one promoted season would
    // reject every show ranking with it.
    const packedShows = saved.shows.map((e) =>
      e.r == null && Number.isInteger(legacyPromoted[e.t]) ? { ...e, r: legacyPromoted[e.t] } : e);
    // The sheet's unwatched list is every unrated row above the last rated
    // one, and the legacy block sits at the bottom of the sheet — so ranking
    // a legacy season drags every legacy row above it in as "unwatched". The
    // legacy store, not the sheet, says which seasons were actually added.
    const packedUn = (Array.isArray(saved.unwatched) ? saved.unwatched : [])
      .filter((t) => ALL_SHOW_TITLES.has(t) && (!LEGACY_META.has(t) || t in legacyPromoted));
    const union = [...packedShows.map((e) => e.t), ...packedUn];
    if (new Set(union).size === union.length && union.every((t) => ALL_SHOW_TITLES.has(t)) &&
        packedShows.every((e) => Number.isInteger(e.r) && e.r >= 0 && e.r <= 10)) {
      shows.length = 0;
      packedShows.forEach((e, i) => shows.push({ ...promotedShow(e.t), rating: e.r, rank: i + 1 }));
      const seen = new Set(union);
      // Same reason: a legacy season sitting in the pool has no sheet row to
      // come back from, so the store is what remembers it.
      const pooledLegacy = Object.keys(legacyPromoted)
        .filter((t) => legacyPromoted[t] == null && LEGACY_META.has(t) && !seen.has(t));
      unwatchedShows = [...pooledLegacy, ...packedUn,
        ...byRelease([...SHOW_META.values(), ...UNWATCHED_META.values()].filter((s) => !seen.has(s.title)))];
      applied = true;
    }
  }
  return applied;
}

// Expected ratings for the Coming Up slate, also browser-local. Titles with
// "Season" (plus known series) count as shows; everything else is a movie.
// Loaded before the cached edits: applyPack reads the legacy store to decide
// which legacy seasons belong in the pool.
const GUESS_KEY = "marvelRankedGuesses.v2";
let guesses = {};
try { guesses = JSON.parse(localStorage.getItem(GUESS_KEY)) || {}; } catch {}
legacyPromoted = guesses[LEGACY_STORE] ?? {};

(function loadEdits() {
  try { applyPack(JSON.parse(localStorage.getItem(EDITS_KEY))); } catch {}
})();

// Accounts are just a username — no password, it's not that serious. The
// signed-in name is kept in this browser; sync only runs while signed in,
// and each username gets its own server-side copy (the owner account
// "Henry" IS the sheet). Signed out, edits stay in this browser only.
const USER_KEY = "marvelRankedUser";
let account = null;
try { account = localStorage.getItem(USER_KEY) || null; } catch {}
const VALID_USER = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,23}$/;
if (account && !VALID_USER.test(account)) account = null;

const syncOn = typeof SYNC !== "undefined" && SYNC.url && !!account;

// A shared link should land on a board with something on it. A first-time
// visitor — no account, nothing ranked in this browser yet — gets an example
// top 10, so the rankings, stats and comparison tabs all have something to
// show instead of an empty grid. It is never saved: the first edit makes the
// board theirs, and "start from scratch" empties it for good.
//
// It reads as somebody's board — a filled top 10 like any other, no source
// named — because that is what a visitor should be looking at. Underneath,
// the ten titles and their scores come from the IMDb snapshot rather than
// anyone's real opinions: nobody's taste is on display, and the list needs
// no upkeep of its own. Each score is stretched onto this site's 0–10 scale
// first (IMDb's range across these films is only 5.4–8.4, so the raw numbers
// would land as a flat row of 7s and 8s) — the same adjustment the
// "vs IMDb & RT" tab makes.
const DEMO_SIZE = 10;
let demoMode = false;

function exampleTopTen() {
  const scored = [...MOVIE_META.keys()]
    .map((t) => ({ t, s: IMDB[t]?.rating }))
    .filter((x) => x.s != null)
    .sort((a, b) => b.s - a.s);
  if (scored.length < DEMO_SIZE) return [];
  const lo = Math.min(...scored.map((x) => x.s)), hi = Math.max(...scored.map((x) => x.s));
  return scored.slice(0, DEMO_SIZE).map(({ t, s }) => ({ t, r: Math.round(((s - lo) / (hi - lo)) * 10) }));
}

if (!account && localStorage.getItem(EDITS_KEY) === null) {
  demoMode = applyPack({ movies: exampleTopTen() });
}

// The showcase is the first thing a shared link shows; the banner belongs to
// the working board behind it, so only one of the two is ever up.
let showcase = demoMode;

// Ends the example — called from saveEdits, so every path that writes a
// ranking (a drag, an undo, "start from scratch") lands here exactly once.
function endDemo() {
  if (!demoMode) return;
  demoMode = false;
  renderDemoBanner();
  updateBalanceAlert();
}

function renderDemoBanner() {
  const existing = document.querySelector(".demo-banner");
  if (!demoMode || showcase) { existing?.remove(); return; }
  if (existing) return;
  const el = document.createElement("div");
  el.className = "demo-banner";
  el.innerHTML = `👋&nbsp;<strong>Example board</strong> Someone else's top 10, so there's something here
    on a first visit. Drag a movie to make this board yours, or
    <button id="demo-clear">start from scratch</button>.`;
  document.querySelector("nav.tabs").after(el);
  el.querySelector("#demo-clear").addEventListener("click", clearDemo);
}

function clearDemo() {
  movies.length = 0;
  unrankedMovies = byRelease([...MOVIE_META.values()]);
  saveEdits(); // ends the example and remembers the empty board across reloads
  views[currentView]();
}

// Apps Script answers through a redirect that sometimes serves an error page
// instead of the JSON, so reads retry and writes are verified by re-reading.
function fetchLive(retries = 3) {
  return fetch(`${SYNC.url}?token=${encodeURIComponent(SYNC.token)}&user=${encodeURIComponent(account)}`)
    .then((r) => r.text())
    .then((t) => JSON.parse(t))
    .catch((err) => retries > 0
      ? new Promise((res) => setTimeout(res, 2500)).then(() => fetchLive(retries - 1))
      : Promise.reject(err));
}

let saveSeq = 0;

function saveEdits() {
  endDemo();
  const pack = (xs) => [...xs].sort((a, b) => a.rank - b.rank).map((i) => ({ t: i.title, r: i.rating }));
  legacyPromoted = Object.fromEntries([
    ...shows.filter((s) => LEGACY_META.has(s.title)).map((s) => [s.title, s.rating]),
    ...unwatchedShows.filter((t) => LEGACY_META.has(t)).map((t) => [t, null]),
  ]);
  if (Object.keys(legacyPromoted).length) guesses[LEGACY_STORE] = legacyPromoted;
  else delete guesses[LEGACY_STORE];
  // The store lives in the guesses, so this save has to leave their local
  // copy in step — otherwise a promoted season's rating is only in the pack.
  localStorage.setItem(GUESS_KEY, JSON.stringify(guesses));
  // The sheet keeps a per-phase movie rating list and average (D/E/F rows);
  // recompute them here so the web app can keep those cells in step.
  const phases = [1, 2, 3, 4, 5, 6].map((p) => {
    const xs = movies.filter((m) => m.phase === p)
      .sort((a, b) => (a.release ?? Infinity) - (b.release ?? Infinity))
      .map((m) => m.rating);
    return xs.length ? { label: `Phase ${p}`, list: xs.join(", "), avg: fmt(avg(xs)) } : null;
  }).filter(Boolean);
  // Franchise rows (same D/E/F block) update the same way, from the members
  // the site derives by title.
  const franchises = FRANCHISES.map((f) => {
    const ratings = franchiseRatings(f.name);
    return ratings.length ? { label: f.name, list: ratings.join(", "), avg: fmt(avg(ratings)) } : null;
  }).filter(Boolean);
  // Guesses ride along on every save; the web app parks them in its own
  // key-value store (they have no sensible home in the sheet's cells).
  // The unwatched list carries unranked movies too: for the owner's sheet
  // it's "clear these ratings", and applyPack rebuilds both pools from it.
  const body = { movies: pack(movies), shows: pack(shows), unwatched: [...unwatchedShows, ...unrankedMovies], phases, franchises, guesses };
  localStorage.setItem(EDITS_KEY, JSON.stringify({
    movies: body.movies, shows: body.shows, unwatched: body.unwatched,
  }));
  if (!syncOn) return;
  const seq = ++saveSeq;
  // The POST's own response is unreliable; what matters is what a fresh read
  // of the sheet says. Skip verification if a newer save started meanwhile.
  fetch(SYNC.url, { method: "POST", body: JSON.stringify({ token: SYNC.token, user: account, ...body }) })
    .catch(() => {})
    .then(() => new Promise((r) => setTimeout(r, 2000)))
    .then(() => fetchLive())
    .then((live) => {
      if (seq !== saveSeq) return;
      // Legacy seasons are left out of the comparison: the sheet's unwatched
      // list is derived from row positions, so it can disagree with the
      // legacy store about them without the save having failed.
      const compare = (p) => JSON.stringify({
        movies: p.movies,
        shows: (p.shows || []).filter((e) => !LEGACY_META.has(e.t)),
        unwatched: (p.unwatched || []).filter((t) => !LEGACY_META.has(t)),
      });
      const stored = compare(live), sent = compare(body);
      if (stored !== sent)
        console.warn("sheet sync: the sheet does not match the last save — edit may not have stuck");
    })
    .catch((err) => console.warn("sheet sync: could not verify save —", err));
}

// Guesses sync on their own so a guess never drags a rankings pack along
// with it — important when data.js is behind the sheet and the in-memory
// rankings are stale. (The web app ignores absent fields.)
function pushGuesses() {
  localStorage.setItem(GUESS_KEY, JSON.stringify(guesses));
  if (!syncOn) return;
  fetch(SYNC.url, { method: "POST", body: JSON.stringify({ token: SYNC.token, user: account, guesses }) })
    .catch(() => {});
}

// One-level undo: every change snapshots the state it replaced and offers
// an Undo button for 5 seconds. Undoing restores the snapshot (rankings,
// pools, and guesses — which carry the roster orders too) and saves it
// like any other edit, so a synced account undoes on the server as well.
let undoState = null;
let undoTimer = null;

const undoBar = document.createElement("div");
undoBar.className = "undobar";
undoBar.innerHTML = `<button type="button">↩ Undo</button>`;
document.body.appendChild(undoBar);
undoBar.querySelector("button").addEventListener("click", () => performUndo());

function snapshotState() {
  const pack = (xs) => [...xs].sort((a, b) => a.rank - b.rank).map((i) => ({ t: i.title, r: i.rating }));
  return {
    movies: pack(movies),
    shows: pack(shows),
    unwatched: [...unwatchedShows, ...unrankedMovies],
    guesses: JSON.parse(JSON.stringify(guesses)),
  };
}

function offerUndo(snapshot) {
  undoState = snapshot;
  undoBar.classList.add("show");
  clearTimeout(undoTimer);
  undoTimer = setTimeout(dismissUndo, 5000);
}

function dismissUndo() {
  undoState = null;
  undoBar.classList.remove("show");
}

function performUndo() {
  if (!undoState) return;
  // Save only what the undo actually rolled back: a guess-only undo must
  // not write a rankings pack (that would flag the browser as edited).
  const now = snapshotState();
  const packOf = (s) => JSON.stringify([s.movies, s.shows, s.unwatched]);
  const packChanged = packOf(now) !== packOf(undoState);
  // Guesses first: they carry the legacy store, which applyPack reads to
  // decide which promoted seasons still belong in the pool.
  guesses = undoState.guesses;
  legacyPromoted = guesses[LEGACY_STORE] ?? {};
  applyPack(undoState);
  localStorage.setItem(GUESS_KEY, JSON.stringify(guesses));
  dismissUndo();
  if (packChanged) saveEdits();
  else pushGuesses();
  views[currentView]();
  updateBalanceAlert();
}

const UPCOMING_SHOW_HINTS = ["VisionQuest"];
const isUpcomingShow = (t) => /season\b/i.test(t) || UPCOMING_SHOW_HINTS.includes(t);

// One distinct color per rating value, warm to cool: reds and yellows for
// the low end, bright green at 5, then a blue ladder — light blue 6,
// blue 7, indigo 8 — with purple at 9 and pink reserved for perfect 10s.
// Every tier boundary is a clear hue change rather than a subtle shade shift.
// Ink is chosen per step for contrast.
// A rainbow can't also run light-to-dark, so hue alone can't say "higher".
// The yellows were the brightest cells on the page at 3 and 4, shouting over
// the 9s and 10s; they're toned down so the top of the scale stays loudest.
const RATING_COLORS = [
  { bg: "#7f1d1d", ink: "#ffffff" }, // 0  dark red
  { bg: "#cf3535", ink: "#ffffff" }, // 1  red
  { bg: "#ef8146", ink: "#1a1a19" }, // 2  orange
  { bg: "#e8b84f", ink: "#1a1a19" }, // 3  yellow
  { bg: "#b8b04a", ink: "#1a1a19" }, // 4  yellow-green
  { bg: "#3cbb54", ink: "#1a1a19" }, // 5  bright green
  { bg: "#5aa7e6", ink: "#1a1a19" }, // 6  light blue
  { bg: "#2a78d6", ink: "#ffffff" }, // 7  blue
  { bg: "#5b50e0", ink: "#ffffff" }, // 8  indigo
  { bg: "#8338ec", ink: "#ffffff" }, // 9  purple
  { bg: "#dd3fa4", ink: "#ffffff" }, // 10 pink
];

// Fractional ratings (phase/franchise averages) blend between the two
// nearest stops instead of snapping to a whole-number color.
function mixHex(a, b, t) {
  const ch = (hex, i) => parseInt(hex.slice(i, i + 2), 16);
  const lerp = (x, y) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
  return `#${lerp(ch(a, 1), ch(b, 1))}${lerp(ch(a, 3), ch(b, 3))}${lerp(ch(a, 5), ch(b, 5))}`;
}

function ratingColor(rating) {
  const r = Math.max(0, Math.min(10, Number(rating)));
  const lo = Math.floor(r), hi = Math.ceil(r), t = r - lo;
  if (lo === hi) return RATING_COLORS[lo];
  return {
    bg: mixHex(RATING_COLORS[lo].bg, RATING_COLORS[hi].bg, t),
    ink: RATING_COLORS[t < 0.5 ? lo : hi].ink,
  };
}

function meterRow({ rank, title, rating, tag }) {
  const c = ratingColor(rating);
  return `<div class="row" title="${title} — ${rating}/10">
    <span class="rank">${rank ?? "–"}</span>
    <span class="cellbox" style="background:${c.bg};color:${c.ink}">
      <span class="title">${title}${tag ? `<span class="phase-tag">${tag}</span>` : ""}</span>
      <span class="val">${rating}</span>
    </span>
  </div>`;
}

// Accent color per phase, used to separate the release-order gallery.
const PHASE_COLORS = {
  1: "#e05252", 2: "#ef9f43", 3: "#e7c94c",
  4: "#2fa9a0", 5: "#4a86e8", 6: "#a05ce8",
};

function coverCard(item) {
  const src = COVERS[item.title];
  const media = src
    ? `<img src="${src}" alt="" loading="lazy" class="${src.includes("logo") ? "contain" : ""}">`
    : `<span class="noimg">${item.title.replace(/[^A-Z]/g, "").slice(0, 2) || item.title[0]}</span>`;
  const rated = item.rating != null;
  const c = rated ? ratingColor(item.rating) : null;
  return `<div class="card" data-detail="${item.title}" style="--phase:${PHASE_COLORS[item.phase] ?? "#8a8781"}"
      title="${item.title} — ${rated ? `${item.rating}/10` : "not ranked yet"}">
    ${media}
    <span class="name">${item.title}</span>
    ${item.action ?? (rated
      ? `<span class="score" style="background:${c.bg};color:${c.ink}">${item.rating}</span>`
      : `<span class="score unknown">?</span>`)}
  </div>`;
}

function releaseGallery(items, heading) {
  // The shows array is rebuilt in rank order whenever edits are applied, so
  // release views must sort by release position themselves. Titles without a
  // release position (unwatched, promoted) sit at the end of their phase.
  items = items.filter((i) => i.phase != null)
    .sort((a, b) => (a.release ?? Infinity) - (b.release ?? Infinity));
  const phases = [...new Set(items.map((i) => i.phase))];
  return `<div class="panel">
    <h2>${heading} <span class="note">release order</span></h2>
    ${phases.map((p) => `
      <section class="phase-block">
        <h3 style="--phase:${PHASE_COLORS[p]}"><span class="dot"></span>Phase ${p}</h3>
        <div class="covers">${items.filter((i) => i.phase === p).map(coverCard).join("")}</div>
      </section>`).join("")}
  </div>`;
}

const byRank = (list) => [...list].sort((a, b) => a.rank - b.rank);

// The ranked lists are editable: every row (and every tier separator below
// 10) carries a grip and can be dragged. An item's rating is the tier header
// sitting above it, so dragging across a separator re-rates the item, and
// dragging a separator re-rates everything that changes side.
function rankRow(item) {
  const c = ratingColor(item.rating);
  return `<div class="row drag" data-drag data-title="${item.title}">
    <span class="rank">${item.rank}</span>
    <span class="cellbox" style="background:${c.bg};color:${c.ink}">
      <span class="title">${item.title}</span>
      <span class="val">${item.rating}</span>
    </span>
    <span class="grip" title="drag to move">⠿</span>
  </div>`;
}

function tierRow(r) {
  const fixed = r === 10;
  return `<div class="tierrow${fixed ? " fixed" : ""}" ${fixed ? "" : "data-drag"} data-tier="${r}"
    style="--c:${RATING_COLORS[r].bg}">
    <span class="rank"></span>
    <span class="tierline"><b>${r}</b></span>
    <span class="grip"${fixed ? ` style="visibility:hidden"` : ` title="drag the tier boundary"`}>⠿</span>
  </div>`;
}

function rankSeq(items) {
  let out = "";
  for (let r = 10; r >= 0; r--) {
    out += tierRow(r);
    out += byRank(items.filter((i) => i.rating === r)).map(rankRow).join("");
  }
  return out;
}

function avgChip(items) {
  // A top-10 example averages nowhere near the 5.0 target by design; flagging
  // it would read as a problem with the visitor's board.
  if (!items.length || demoMode) return "";
  const a = avg(items.map((i) => i.rating));
  return `<span class="avgchip${a === 5 ? "" : " off"}" title="average rating — the goal is exactly 5">avg ${fmt(a)}</span>`;
}

// Re-derive ratings and ranks from the DOM order after a drop, then
// re-render. Whatever sits in the ranklist is ranked (with the tier's
// rating); whatever sits in the pool below doesn't count toward anything.
function commitMovies(rankEl, poolEl) {
  const snap = snapshotState();
  const rebuilt = [];
  let cur = 10, rank = 1;
  for (const el of rankEl.children) {
    if (el.dataset.tier !== undefined) cur = Number(el.dataset.tier);
    else if (el.dataset.title !== undefined) rebuilt.push({ ...MOVIE_META.get(el.dataset.title), rating: cur, rank: rank++ });
  }
  movies.length = 0;
  movies.push(...rebuilt);
  unrankedMovies = [...poolEl.children]
    .filter((el) => el.dataset.title !== undefined)
    .map((el) => el.dataset.title);
  saveEdits();
  offerUndo(snap);
  renderRankings();
  updateBalanceAlert();
}

// The shows panel commits from two lists: whatever sits in the ranklist is
// ranked (unwatched shows dropped there get promoted, with the tier's rating),
// and whatever sits in the unwatched list doesn't count toward anything.
function commitShows(rankEl, unwatchedEl) {
  const snap = snapshotState();
  const byTitle = new Map(shows.map((i) => [i.title, i]));
  const rebuilt = [];
  let cur = 10, rank = 1;
  for (const el of rankEl.children) {
    if (el.dataset.tier !== undefined) cur = Number(el.dataset.tier);
    else if (el.dataset.title !== undefined) {
      const it = byTitle.get(el.dataset.title) ?? promotedShow(el.dataset.title);
      it.rating = cur;
      it.rank = rank++;
      rebuilt.push(it);
    }
  }
  shows.length = 0;
  shows.push(...rebuilt);
  unwatchedShows = [...unwatchedEl.children]
    .filter((el) => el.dataset.title !== undefined)
    .map((el) => el.dataset.title);
  saveEdits();
  offerUndo(snap);
  renderRankings();
  updateBalanceAlert();
}

// Rows drag freely across the given containers (ranked list and, for shows,
// the unwatched list). Tier separators stay confined to the first container.
function makeDraggable(containers, onCommit) {
  containers = containers.filter(Boolean);
  for (const container of containers) {
    container.addEventListener("pointerdown", (e) => {
      const grip = e.target.closest(".grip");
      if (!grip || !container.contains(grip)) return;
      const row = grip.closest("[data-drag]");
      if (!row) return;
      e.preventDefault();
      try { grip.setPointerCapture(e.pointerId); } catch {}
      row.classList.add("dragging");
      const isTier = row.dataset.tier !== undefined;
      const onMove = (ev) => {
        // Pick the container under the pointer, then insert before the first
        // non-dragged row whose midpoint is below it. The fixed 10-header is
        // excluded, so nothing lands above it.
        const zones = isTier ? [containers[0]] : containers;
        let target = zones.find((z) => {
          const r = z.getBoundingClientRect();
          return ev.clientY >= r.top - 10 && ev.clientY <= r.bottom + 10;
        });
        if (!target) {
          target = zones.reduce((best, z) => {
            const r = z.getBoundingClientRect();
            const d = Math.min(Math.abs(ev.clientY - r.top), Math.abs(ev.clientY - r.bottom));
            return !best || d < best.d ? { z, d } : best;
          }, null).z;
        }
        const candidates = [...target.children]
          .filter((c) => c !== row && !c.classList.contains("fixed"))
          .map((c) => ({ c, b: c.getBoundingClientRect() }));
        // A list laid out in columns needs the pointer read in reading order:
        // a row further down always comes later, and within the same band the
        // one to the right does. Single-column lists have no second column to
        // confuse, so they keep the plain midpoint test.
        const columns = candidates.some(({ b }, i) => i && Math.abs(b.top - candidates[i - 1].b.top) < 2);
        const next = (candidates.find(({ b }) => columns
          ? b.top + b.height / 2 - ev.clientY > b.height / 2 ||
            (Math.abs(b.top + b.height / 2 - ev.clientY) <= b.height / 2 && b.left + b.width / 2 > ev.clientX)
          : ev.clientY < b.top + b.height / 2)?.c) ?? null;
        if (row.parentElement !== target || next !== row.nextElementSibling) target.insertBefore(row, next);
      };
      const finish = (ev) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        row.classList.remove("dragging");
        // If a re-render replaced the list mid-drag (e.g. the boot sync
        // landed), the drop would commit from a detached DOM — discard it.
        if (ev.type === "pointerup" && container.isConnected) onCommit();
        else views[currentView]();
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
    });
  }
}

// An upcoming title with a pick-your-own expected rating. The score cell is a
// button ("?" until a guess is made) that opens a color-coded picker.
function guessRow(title) {
  const g = guesses[title];
  const c = g != null ? ratingColor(g) : null;
  return `<div class="row">
    <span class="rank">–</span>
    <span class="cellbox${c ? "" : " unwatched"}"${c ? ` style="background:${c.bg};color:${c.ink}"` : ""}>
      <span class="title">${title}</span>
      <button class="guess" data-title="${title}" title="what I expect to rate it">${g ?? "?"}</button>
    </span>
  </div>`;
}

// One shared picker popup, styled like the site: a grid of rating chips in
// their scale colors, plus "?" to clear the guess.
let guessPop = null;
function closeGuessPop() { guessPop?.remove(); guessPop = null; }

function openGuessPop(btn) {
  closeGuessPop();
  const title = btn.dataset.title;
  const cur = guesses[title];
  guessPop = document.createElement("div");
  guessPop.className = "guess-pop";
  guessPop.innerHTML = Array.from({ length: 11 }, (_, i) => 10 - i).map((r) => {
    const c = RATING_COLORS[r];
    return `<button class="opt${cur === r ? " sel" : ""}" data-r="${r}"
      style="background:${c.bg};color:${c.ink}">${r}</button>`;
  }).join("") + `<button class="opt clear${cur == null ? " sel" : ""}">?</button>`;
  guessPop.addEventListener("click", (e) => {
    const opt = e.target.closest(".opt");
    if (!opt) return;
    const snap = snapshotState();
    if ("r" in opt.dataset) guesses[title] = Number(opt.dataset.r);
    else delete guesses[title];
    pushGuesses();
    offerUndo(snap);
    closeGuessPop();
    renderRankings();
  });
  document.body.appendChild(guessPop);
  const b = btn.getBoundingClientRect();
  const x = Math.max(8, Math.min(b.right - guessPop.offsetWidth, window.innerWidth - guessPop.offsetWidth - 8));
  let y = b.bottom + 6;
  if (y + guessPop.offsetHeight > window.innerHeight - 8) y = b.top - guessPop.offsetHeight - 6;
  guessPop.style.left = `${x}px`;
  guessPop.style.top = `${y}px`;
}

document.addEventListener("pointerdown", (e) => {
  if (guessPop && !guessPop.contains(e.target) && !e.target.closest("button.guess")) closeGuessPop();
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeGuessPop(); });

function comingUpPanel(titles, kind) {
  return `<div class="panel"><h2>Coming up <span class="note">${titles.length} ${kind} · pick an expected rating</span></h2>
    ${titles.map(guessRow).join("")}
  </div>`;
}

// First visit lands on the picture people actually share: the top 10 as
// covers alone, in the podium the "top 10 card" draws — #1 big in the middle,
// then rows of four and three. The working board is one click (or one tab)
// away, and any way out of here is permanent for the session.
function showcaseCell(item) {
  const src = COVERS[item.title];
  return `<figure title="${item.title}">
    ${src ? `<img src="${src}" alt="${item.title}">`
      : `<span class="noimg">${item.title.replace(/[^A-Z]/g, "").slice(0, 2) || item.title[0]}</span>`}
    <span class="badge">${item.rank}</span>
  </figure>`;
}

function renderShowcase() {
  // Nothing but the board: the tabs belong to the app the button opens.
  document.body.classList.add("showcase-on");
  const top = byRank(movies).slice(0, 10);
  const cell = (rank) => (top[rank - 1] ? showcaseCell(top[rank - 1]) : "");
  $("#view").innerHTML = `
    <div class="showcase">
      <p class="showcase-sub">MY TOP 10 MOVIES</p>
      <div class="showcase-podium">${cell(2)}${cell(1)}${cell(3)}</div>
      <div class="showcase-row">${[4, 5, 6, 7].map(cell).join("")}</div>
      <div class="showcase-row">${[8, 9, 10].map(cell).join("")}</div>
      <div class="showcase-cta"><button id="showcase-start">Make your own</button></div>
    </div>`;
  $("#showcase-start").addEventListener("click", leaveShowcase);
}

function leaveShowcase() {
  if (!showcase) return;
  showcase = false;
  document.body.classList.remove("showcase-on");
  renderDemoBanner();
  views[currentView]();
}

function renderRankings() {
  if (showcase) return renderShowcase();
  closeGuessPop();
  const edited = localStorage.getItem(EDITS_KEY) !== null;
  const upMovies = UPCOMING.filter((t) => !isUpcomingShow(t));
  const upShows = UPCOMING.filter(isUpcomingShow);
  $("#view").innerHTML = `
    <div class="split">
      <div class="release-pane">
        ${releaseGallery([...movies, ...unrankedMovies.map((t) => MOVIE_META.get(t)).filter(Boolean)], "Movies")}
        <div class="section-gap"></div>
        ${releaseGallery([...shows, ...unwatchedShows.map(promotedShow)], "Shows")}
      </div>
      <div class="rank-pane">
        <div class="grid-2">
          <div class="stack">
            <div class="panel"><h2>Movies ${avgChip(movies)}<button class="avgchip cardbtn" data-card="movies" title="make a shareable top-10 image">top 10 card</button>${movies.length ? `<button class="avgchip cardbtn" data-card="movies-all" title="make a shareable image of the whole ranked list">full list card</button>` : ""}<span class="note">${movies.length} ranked · drag to re-rank</span></h2>
              <div class="ranklist" data-kind="movies">${rankSeq(movies)}</div>
              <h2 class="subheading">Unranked <span class="note">${unrankedMovies.length} movies · drag up to rank</span></h2>
              <div class="unwatchedlist" data-kind="movie-pool">${unrankedMovies.map((t) => `<div class="row drag" data-drag data-title="${t}">
                <span class="rank">–</span>
                <span class="cellbox unwatched"><span class="title">${t}</span></span>
                <span class="grip" title="drag into the rankings">⠿</span>
              </div>`).join("")}</div>
            </div>
            ${comingUpPanel(upMovies, "movies")}
          </div>
          <div class="stack">
            <div class="panel"><h2>Shows ${avgChip(shows)}<button class="avgchip cardbtn" data-card="shows" title="make a shareable top-10 image">top 10 card</button>${shows.length ? `<button class="avgchip cardbtn" data-card="shows-all" title="make a shareable image of the whole ranked list">full list card</button>` : ""}<span class="note">${shows.length} ranked</span></h2>
              <div class="ranklist" data-kind="shows">${rankSeq(shows)}</div>
              <h2 class="subheading">Haven't seen <span class="note">${unwatchedShows.length} shows · guesses don't count · drag up to rank</span></h2>
              <div class="unwatchedlist" data-kind="show-pool">${unwatchedShows.map((t) => `<div class="row drag" data-drag data-title="${t}">
                <span class="rank">–</span>
                <span class="cellbox${guesses[t] != null ? "" : " unwatched"}"${guesses[t] != null ? ` style="background:${ratingColor(guesses[t]).bg};color:${ratingColor(guesses[t]).ink}"` : ""}>
                  <span class="title">${t}</span>
                  <button class="guess" data-title="${t}" title="what I expect to rate it">${guesses[t] ?? "?"}</button>
                </span>
                <span class="grip" title="drag into the rankings once watched">⠿</span>
              </div>`).join("")}</div>
            </div>
            ${comingUpPanel(upShows, "shows")}
          </div>
        </div>
        ${edited && !syncOn ? `<p class="fineprint">Rankings edited in this browser only — sign in (top of the page)
          to keep them on an account and get them on other devices.
          <a href="#" id="reset-edits">Start over with everything unranked</a>.</p>` : ""}
      </div>
    </div>`;
  const movieList = $("#view").querySelector('.ranklist[data-kind="movies"]');
  const moviePool = $("#view").querySelector('.unwatchedlist[data-kind="movie-pool"]');
  makeDraggable([movieList, moviePool], () => commitMovies(movieList, moviePool));
  const showList = $("#view").querySelector('.ranklist[data-kind="shows"]');
  const unwatchedList = $("#view").querySelector('.unwatchedlist[data-kind="show-pool"]');
  makeDraggable([showList, unwatchedList], () => commitShows(showList, unwatchedList));
  $("#view").querySelectorAll("button.guess").forEach((btn) =>
    btn.addEventListener("click", () => openGuessPop(btn)));
  const cards = {
    movies: () => openShareCard(movies, "MY TOP 10 MOVIES", "marvel-ranked-top10-movies.png"),
    shows: () => openShareCard(shows, "MY TOP 10 SHOWS", "marvel-ranked-top10-shows.png"),
    "movies-all": () => openShareCard(movies, `ALL ${movies.length} MOVIES, RANKED`, "marvel-ranked-all-movies.png", 10, true),
    "shows-all": () => openShareCard(shows, `ALL ${shows.length} SHOWS, RANKED`, "marvel-ranked-all-shows.png", 10, true),
  };
  $("#view").querySelectorAll("button.cardbtn").forEach((btn) =>
    btn.addEventListener("click", () => cards[btn.dataset.card]?.()));
  $("#reset-edits")?.addEventListener("click", (e) => {
    e.preventDefault();
    localStorage.removeItem(EDITS_KEY);
    location.reload();
  });
}

// Share card: the top 10 movies drawn onto a canvas — poster, title, rating
// chip per row under the red site plate — for downloading or sharing.
// Wikimedia serves CORS headers, so covers load with crossOrigin and the
// canvas stays exportable; a failed cover falls back to an initials box.
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Posters for titles, portraits for characters — both draw onto share cards.
const artFor = (title) => COVERS[title] ?? CHARACTER_ART[title];

const loadCover = (title, attempt = 0) => new Promise((resolve) => {
  const src = artFor(title);
  if (!src) return resolve(null);
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.referrerPolicy = "no-referrer";
  img.onload = () => resolve(img);
  // Wikipedia sometimes 429s a burst of cover requests; one spaced retry
  // (cache-busted so the browser refetches) usually clears it.
  img.onerror = () => attempt < 1
    ? setTimeout(() => loadCover(title, attempt + 1).then(resolve), 1500)
    : resolve(null);
  img.src = src + (attempt ? (src.includes("?") ? "&" : "?") + "retry=" + attempt : "");
});

const cardFont = (size, weight = 700) => `${weight} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;

// Load a few covers at a time instead of all at once — a full burst trips
// Wikipedia's rate limiting and random cards come back blank.
async function loadCovers(items) {
  const imgs = [];
  const queue = items.map((m, i) => [i, m.title]);
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (queue.length) {
      const [i, title] = queue.shift();
      imgs[i] = await loadCover(title);
    }
  }));
  return imgs;
}

// Red plate header, same as the site's hero.
function drawCardHeader(ctx, W, subtitle) {
  ctx.font = cardFont(88, 900);
  const plateW = ctx.measureText("MARVEL RANKED").width + 100;
  ctx.fillStyle = "#e62429";
  ctx.fillRect((W - plateW) / 2, 70, plateW, 130);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("MARVEL RANKED", W / 2, 141);
  ctx.font = cardFont(34, 600);
  ctx.fillStyle = "#898781";
  ctx.fillText(subtitle, W / 2, 300);
}

// A poster clipped to a rounded cell. Landscape logo images get letterboxed
// instead of being cropped to a sliver; a missing cover falls back to an
// initials box.
function drawPoster(ctx, img, title, x, y, w, h, radius) {
  ctx.save();
  roundRectPath(ctx, x, y, w, h, radius);
  ctx.clip();
  if (img) {
    const wide = img.width / img.height >= 1;
    const s = wide
      ? Math.min((w - 24) / img.width, (h - 24) / img.height)
      : Math.max(w / img.width, h / img.height);
    if (wide) { ctx.fillStyle = "#1c1c24"; ctx.fillRect(x, y, w, h); }
    ctx.drawImage(img, x + (w - img.width * s) / 2, y + (h - img.height * s) / 2, img.width * s, img.height * s);
  } else {
    ctx.fillStyle = "#1c1c24";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#6b6b78";
    ctx.font = cardFont(Math.round(w * 0.23), 700);
    ctx.fillText(title.replace(/[^A-Z]/g, "").slice(0, 2) || title[0], x + w / 2, y + h / 2);
  }
  ctx.restore();
}

// Rank badge: red circle in the poster's top-left corner.
function drawRankBadge(ctx, rank, bx, by, r) {
  ctx.beginPath();
  ctx.arc(bx, by, r, 0, Math.PI * 2);
  ctx.fillStyle = "#e62429";
  ctx.fill();
  ctx.lineWidth = Math.max(3, Math.round(r / 9));
  ctx.strokeStyle = "#0d0d0d";
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = cardFont(Math.round(r * 1.1), 900);
  ctx.fillText(String(rank), bx, by + r * 0.06);
}

async function buildShareCard(items, subtitle, limit = 10) {
  const top = byRank(items).slice(0, limit);
  const imgs = await loadCovers(top);
  const W = 1080, H = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0d0d0d";
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  drawCardHeader(ctx, W, subtitle);

  // Covers only, podium layout: #1 big in the middle flanked by #2 and #3,
  // then the rest split over two centered grid rows (4/3 for a top 10,
  // 4/4 for a top 11). Rank badges carry the ordering.
  const cells = [
    { rank: 2, x: 25, y: 495, w: 310, h: 465 },
    { rank: 1, x: 360, y: 420, w: 360, h: 540 },
    { rank: 3, x: 745, y: 495, w: 310, h: 465 },
  ];
  const rest = top.length - 3;
  const rowA = Math.min(Math.ceil(rest / 2), 4);
  [[rowA, 1010], [rest - rowA, 1420]].forEach(([n, y], row) => {
    const gw = n * 240 + (n - 1) * 24;
    const x0 = (W - gw) / 2;
    for (let i = 0; i < n; i++) {
      cells.push({ rank: 4 + row * rowA + i, x: x0 + i * 264, y, w: 240, h: 360 });
    }
  });
  for (const cell of cells) {
    const m = top[cell.rank - 1];
    if (!m) continue;
    const { x, y, w, h } = cell;
    drawPoster(ctx, imgs[cell.rank - 1], m.title, x, y, w, h, cell.rank === 1 ? 18 : 14);
    const big = cell.rank === 1;
    const r = big ? 52 : 42;
    drawRankBadge(ctx, cell.rank, x + r + 10, y + r + 10, r);
  }
  return canvas;
}

// The whole ranked list on one tall card: a 5-wide grid of covers in rank
// order, each with a rank badge and a rating chip in the list's colors.
async function buildFullCard(items, subtitle) {
  const list = byRank(items);
  const imgs = await loadCovers(list);
  const W = 1080, cols = 5, margin = 36, gap = 18;
  const cw = (W - margin * 2 - gap * (cols - 1)) / cols;
  const ch = cw * 1.5;
  const rows = Math.ceil(list.length / cols);
  const top = 360;
  const H = top + rows * (ch + gap) - gap + 50;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0d0d0d";
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  drawCardHeader(ctx, W, subtitle);

  list.forEach((m, i) => {
    const x = margin + (i % cols) * (cw + gap);
    const y = top + Math.floor(i / cols) * (ch + gap);
    drawPoster(ctx, imgs[i], m.title, x, y, cw, ch, 12);
    drawRankBadge(ctx, i + 1, x + 34, y + 34, 26);
    // Rating chip, bottom-right, in the same color scale as the site.
    const c = ratingColor(m.rating);
    const pw = 52, ph = 40;
    roundRectPath(ctx, x + cw - pw - 8, y + ch - ph - 8, pw, ph, 9);
    ctx.fillStyle = c.bg;
    ctx.fill();
    ctx.fillStyle = c.ink;
    ctx.font = cardFont(26, 800);
    ctx.fillText(String(m.rating), x + cw - pw / 2 - 8, y + ch - ph / 2 - 7);
  });
  return canvas;
}

function openShareCard(items, subtitle, filename, limit = 10, full = false) {
  const modal = document.createElement("div");
  modal.className = "share-modal";
  modal.innerHTML = `<div class="share-box"><p class="fineprint">Building your card…</p></div>`;
  document.body.appendChild(modal);
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
  (full ? buildFullCard(items, subtitle) : buildShareCard(items, subtitle, limit)).then((canvas) => {
    const box = modal.querySelector(".share-box");
    let url;
    try {
      url = canvas.toDataURL("image/png");
    } catch {
      box.innerHTML = `<p class="fineprint">Couldn't render the card — cover images were blocked.</p>`;
      return;
    }
    box.innerHTML = `<img src="${url}" alt="${subtitle}">
      <div class="share-actions">
        <a class="chip" download="${filename}" href="${url}">Download</a>
        <button class="chip" data-share>Share</button>
        <button class="chip" data-close>Close</button>
      </div>`;
    box.querySelector("[data-close]").addEventListener("click", () => modal.remove());
    const shareBtn = box.querySelector("[data-share]");
    if (navigator.canShare) {
      shareBtn.addEventListener("click", () => canvas.toBlob((blob) => {
        const file = new File([blob], filename, { type: "image/png" });
        if (navigator.canShare({ files: [file] })) navigator.share({ files: [file] }).catch(() => {});
      }));
    } else {
      shareBtn.remove();
    }
  });
}

// Cover-card detail popup: click a poster anywhere the gallery cards appear
// and get the big-poster profile — rating, rank, phase/year, and the outside
// scores for movies.
function openDetail(title) {
  const isMovie = MOVIE_META.has(title);
  const item = (isMovie ? movies : shows).find((x) => x.title === title);
  const meta = item ?? MOVIE_META.get(title) ?? SHOW_META.get(title) ?? UNWATCHED_META.get(title)
    ?? LEGACY_META.get(title);
  if (!meta) return;

  let status;
  if (item) {
    const list = isMovie ? movies : shows;
    const c = ratingColor(item.rating);
    status = `<div class="bigscore" style="background:${c.bg};color:${c.ink}">${item.rating}</div>
      <div class="rankline">#${item.rank} of ${list.length} ${isMovie ? "movies" : "shows"}</div>`;
  } else {
    const g = guesses[title];
    const legacy = LEGACY_META.has(title) && !unwatchedShows.includes(title);
    status = `<div class="bigscore unknown">?</div>
      <div class="rankline">${legacy ? "Legacy TV — not ranked" : "Not ranked yet"}${g != null ? ` · expecting a ${g}` : ""}</div>`;
  }

  const facts = [];
  if (meta.phase != null) facts.push(`Phase ${meta.phase}${meta.year != null ? ` · ${meta.year}` : ""}`);
  if (isMovie && IMDB[title]) facts.push(`IMDb ${IMDB[title].rating} · ${IMDB[title].votes.toLocaleString()} votes`);
  if (isMovie && RT[title]) facts.push(`Tomatometer ${RT[title].critics}% · audience ${RT[title].audience}%`);

  const src = COVERS[title];
  const modal = document.createElement("div");
  modal.className = "share-modal";
  modal.innerHTML = `<div class="share-box detail-box">
    ${src ? `<img class="detail-poster ${src.includes("logo") ? "contain" : ""}" src="${src}" alt="">` : ""}
    <h3>${title}</h3>
    ${status}
    ${facts.map((f) => `<div class="factline">${f}</div>`).join("")}
    <div class="share-actions"><button class="chip" data-close>Close</button></div>
  </div>`;
  document.body.appendChild(modal);
  const close = () => { modal.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  modal.querySelector("[data-close]").addEventListener("click", close);
}

document.addEventListener("click", (e) => {
  const card = e.target.closest(".card[data-detail]");
  if (card) openDetail(card.dataset.detail);
});

// Generic column chart: values are encoded by height; the rating color is a
// redundant channel on top (same scale as every other cell on the site).
// `groups` gives phase-labeled clusters; single-group charts label each column.
function columnChart({ groups, max = 10, ticks = [0, 5, 10] }) {
  const pct = (v) => (v / max) * 100;
  const bar = (c) => `<div class="colwrap" data-tip="${c.tip}">
    <div class="colbar">${c.v === 0 && c.noStub ? "" : `<i style="height:${c.v === 0 ? "3px" : pct(c.v) + "%"};background:${c.color}"></i>`}</div>
    ${c.label != null ? `<span class="xl">${c.label}</span>` : ""}
  </div>`;
  return `<div class="chart">
    <div class="yaxis">${ticks.map((t) => `<span style="top:calc(var(--h) * ${1 - t / max})">${t}</span>`).join("")}</div>
    <div class="plotarea">
      ${ticks.map((t) => `<div class="gridline ${t === 0 ? "baseline" : ""}" style="top:calc(var(--h) * ${1 - t / max})"></div>`).join("")}
      <div class="cgroups">${groups.map((g) => `
        <div class="cgroup" style="flex:${g.cols.length};${g.color ? `--phase:${g.color}` : ""}">
          <div class="cols">${g.cols.map(bar).join("")}</div>
          ${g.label ? `<div class="glabel"><span class="dot"></span>${g.label}</div>` : ""}
        </div>`).join("")}
      </div>
    </div>
  </div>`;
}

function timelineChart(items) {
  items = items.filter((i) => i.phase != null)
    .sort((a, b) => (a.release ?? Infinity) - (b.release ?? Infinity));
  const phases = [...new Set(items.map((i) => i.phase))];
  return columnChart({
    groups: phases.map((p) => ({
      label: `Phase ${p}`,
      color: PHASE_COLORS[p],
      cols: items.filter((i) => i.phase === p).map((i) => ({
        v: i.rating,
        color: ratingColor(i.rating).bg,
        tip: `${i.title} (${i.year}) — ${i.rating}/10`,
      })),
    })),
  });
}

function statTile({ label, value, dotRating, sub }) {
  const dot = dotRating != null ? `<span class="dot" style="background:${ratingColor(dotRating).bg}"></span>` : "";
  return `<div class="tile">
    <div class="label">${label}</div>
    <div class="value">${value}</div>
    <div class="sub">${dot}${sub}</div>
  </div>`;
}

// Per-chart movies/shows/both pickers on the stats page.
const statsFilter = { dist: "both", year: "both" };
const filterSets = { movies: () => movies, shows: () => shows, both: () => [...movies, ...shows] };

function segControl(chart) {
  return `<span class="seg">${Object.keys(filterSets).map((p) =>
    `<button class="segbtn${statsFilter[chart] === p ? " active" : ""}" data-chart="${chart}" data-pick="${p}">${p}</button>`).join("")}</span>`;
}

const NOTHING_RANKED = `<div class="panel"><h2>Nothing ranked yet</h2>
  <p class="fineprint">Head to the Rankings tab and drag titles out of the unranked pools —
  stats appear as soon as something has a rating.</p></div>`;

// Where the bar sits for a hot or cold run is an opinion, not a constant, so
// it's a control on the page. Golden asks for at least N, cold for at most N.
const GOLDEN_LEVELS = [3, 4, 5, 6, 7, 8, 9], COLD_LEVELS = [7, 6, 5, 4, 3, 2, 1];
const streakLevel = { golden: 7, cold: 3 };

// Every longest run of consecutive releases whose ratings all pass a test —
// all of them when several tie, since picking one would hide the rest.
// Walks every film, not just the ranked ones: an unranked film is a gap in
// the record rather than a good result or a bad one, so it breaks the run.
function releaseRuns(test) {
  const rated = new Map(movies.map((m) => [m.title, m]));
  const runs = [];
  let run = [];
  for (const title of byRelease([...MOVIE_META.values()])) {
    const m = rated.get(title);
    if (!m || !test(m.rating)) { run = []; continue; }
    run.push(m);
    if (run.length === 1) runs.push(run);
  }
  const longest = Math.max(0, ...runs.map((r) => r.length));
  return longest < 2 ? [] : runs.filter((r) => r.length === longest);
}

function runStrip(films) {
  const years = [films[0].year, films[films.length - 1].year].filter(Boolean);
  const span = years.length && years[0] !== years[1] ? `${years[0]}–${years[1]}` : years[0] ?? "";
  return `<div class="runstrip">${films.map((m) => {
    const c = ratingColor(m.rating);
    const src = COVERS[m.title];
    return `<figure title="${m.title} — ${m.rating}/10">
      ${src ? `<img src="${src}" alt="${m.title}" loading="lazy">`
        : `<span class="noimg">${m.title.replace(/[^A-Z]/g, "").slice(0, 2)}</span>`}
      <span class="score" style="background:${c.bg};color:${c.ink}">${m.rating}</span>
    </figure>`;
  }).join("")}</div>
  <p class="fineprint runspan">${films[0].title} → ${films[films.length - 1].title}${span ? ` · ${span}` : ""}</p>`;
}

// Spread: how much of the 0-10 scale someone actually uses. IMDb's ratings
// for these films sit in a narrow band, so the comparison is really "do you
// commit to an opinion" — worth saying out loud rather than implying.
const stdev = (xs) => {
  const m = avg(xs);
  return Math.sqrt(avg(xs.map((x) => (x - m) ** 2)));
};

function gradingPanel() {
  const rated = movies.filter((m) => IMDB[m.title]?.rating != null);
  if (rated.length < 3) return "";
  const mine = rated.map((m) => m.rating);
  const theirs = rated.map((m) => IMDB[m.title].rating);
  const mySpread = stdev(mine), theirSpread = stdev(theirs);
  const gap = avg(mine) - avg(theirs);
  const ratio = theirSpread ? mySpread / theirSpread : 0;
  const hottest = rated
    .map((m) => ({ m, delta: m.rating - IMDB[m.title].rating }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
  const src = COVERS[hottest.m.title];
  const c = ratingColor(hottest.m.rating);
  return `
    <div class="panel">
      <h2>How you grade <span class="note">against IMDb · ${rated.length} films</span></h2>
      <div class="gradepair">
        <div><span class="big">±${fmt(mySpread)}</span><span class="sub">your spread</span></div>
        <div><span class="big">±${fmt(theirSpread)}</span><span class="sub">IMDb voters</span></div>
      </div>
      <p class="fineprint">You swing ${fmt(ratio)}× ${ratio >= 1 ? "wider" : "narrower"} than the crowd, and rate
        ${gap === 0 ? "dead level with them" : `${fmt(Math.abs(gap))} ${gap > 0 ? "higher" : "lower"} on average`}.</p>
      <h2 class="subheading">Hottest take</h2>
      <div class="taker">
        ${src ? `<img src="${src}" alt="" loading="lazy">` : ""}
        <div class="takertext">
          <div class="takertitle">${hottest.m.title}</div>
          <div class="fineprint">you <span class="score" style="background:${c.bg};color:${c.ink}">${hottest.m.rating}</span>
            · IMDb ${IMDB[hottest.m.title].rating} ·
            ${fmt(Math.abs(hottest.delta))} apart, ${hottest.delta > 0 ? "in its favour" : "against it"}</div>
        </div>
      </div>
    </div>`;
}

function levelControl(kind, levels, label) {
  return `<span class="seg">${levels.map((n) =>
    `<button class="segbtn${streakLevel[kind] === n ? " active" : ""}" data-streak="${kind}" data-level="${n}">${label(n)}</button>`)
    .join("")}</span>`;
}

function streakSection(kind, heading, levels, label, bar, runs) {
  return `
    <h2 class="subheading">${heading} ${levelControl(kind, levels, label)}</h2>
    <p class="fineprint">${runs.length
      ? `${runs[0].length} in a row rated ${bar}${runs.length > 1 ? ` · ${runs.length} runs tied` : ""}`
      : `Nothing back to back rated ${bar}`}</p>
    ${runs.map(runStrip).join("")}`;
}

function streaksPanel() {
  const golden = releaseRuns((r) => r >= streakLevel.golden);
  const cold = releaseRuns((r) => r <= streakLevel.cold);
  // An empty section is worth showing when a different bar would fill it —
  // that's what the buttons are for. A board with no back-to-back films at
  // any setting has nothing to offer, so the panel stays away entirely.
  const anywhere = GOLDEN_LEVELS.some((n) => releaseRuns((r) => r >= n).length) ||
    COLD_LEVELS.some((n) => releaseRuns((r) => r <= n).length);
  if (!anywhere) return "";
  return `
    <div class="panel">
      <h2>Streaks <span class="note">movies in release order · an unranked film breaks the run</span></h2>
      ${streakSection("golden", "Golden run", GOLDEN_LEVELS, (n) => `${n}+`, `${streakLevel.golden}+`, golden)}
      ${streakSection("cold", "Cold streak", COLD_LEVELS, (n) => `≤${n}`, `${streakLevel.cold} or less`, cold)}
    </div>`;
}

function renderStats() {
  const groupStats = (raw, key) => {
    const items = raw.filter((i) => i[key] != null);
    return [...new Set(items.map((i) => i[key]))].map((k) => {
      const xs = items.filter((i) => i[key] === k);
      return { key: k, average: avg(xs.map((i) => i.rating)), count: xs.length };
    }).sort((a, b) => b.average - a.average);
  };

  // Phase and year tiles are movies only. A phase (or a year) is remembered
  // for its films, and the shows that landed in it would otherwise swing the
  // average around. The charts below still have their own movies/shows/both
  // pickers.
  const byPhase = groupStats(movies, "phase");
  const byYear = groupStats(movies, "year");
  const movieAvg = avg(movies.map((m) => m.rating));
  const showAvg = avg(shows.map((s) => s.rating));
  const bestPhase = byPhase[0], worstPhase = byPhase[byPhase.length - 1];
  const bestYear = byYear[0], worstYear = byYear[byYear.length - 1];
  const tiles = [
    movies.length && { label: "Movie average", value: fmt(movieAvg), dotRating: movieAvg, sub: `${movies.length} films` },
    shows.length && { label: "Show average", value: fmt(showAvg), dotRating: showAvg, sub: `${shows.length} shows` },
    bestPhase && { label: "Best phase", value: `Phase ${bestPhase.key}`, dotRating: bestPhase.average, sub: `${fmt(bestPhase.average)} average · ${bestPhase.count} film${bestPhase.count === 1 ? "" : "s"}` },
    worstPhase && { label: "Worst phase", value: `Phase ${worstPhase.key}`, dotRating: worstPhase.average, sub: `${fmt(worstPhase.average)} average · ${worstPhase.count} film${worstPhase.count === 1 ? "" : "s"}` },
    bestYear && { label: "Best year", value: bestYear.key, dotRating: bestYear.average, sub: `${fmt(bestYear.average)} average · ${bestYear.count} film${bestYear.count === 1 ? "" : "s"}` },
    worstYear && { label: "Worst year", value: worstYear.key, dotRating: worstYear.average, sub: `${fmt(worstYear.average)} average · ${worstYear.count} film${worstYear.count === 1 ? "" : "s"}` },
  ].filter(Boolean);

  // Rating distribution: how many titles landed on each 0-10 score.
  const distItems = filterSets[statsFilter.dist]();
  const counts = Array.from({ length: 11 }, (_, r) => distItems.filter((i) => i.rating === r).length);
  const maxCount = Math.max(...counts);
  const histogram = columnChart({
    max: maxCount,
    ticks: [0, Math.ceil(maxCount / 2), maxCount],
    groups: [{
      cols: counts.map((n, r) => ({
        v: n, noStub: true, label: r, color: RATING_COLORS[r].bg,
        tip: `Rated ${r} — ${n} title${n === 1 ? "" : "s"}`,
      })),
    }],
  });

  // Average rating for everything watched, per release year (gap years stay
  // as empty slots so the time axis stays linear).
  const yearItems = filterSets[statsFilter.year]().filter((i) => i.year != null);
  const years = yearItems.map((i) => i.year);
  const yearRange = [];
  for (let y = Math.min(...years); y <= Math.max(...years); y++) yearRange.push(y);
  const yearChart = columnChart({
    groups: [{
      cols: yearRange.map((y) => {
        const xs = yearItems.filter((i) => i.year === y);
        if (!xs.length) return { v: 0, noStub: true, label: `’${String(y).slice(2)}`, tip: `${y} — nothing released` };
        const a = avg(xs.map((i) => i.rating));
        return {
          v: a, color: ratingColor(a).bg, label: `’${String(y).slice(2)}`,
          tip: `${y} — ${fmt(a)} average · ${xs.length} title${xs.length === 1 ? "" : "s"}`,
        };
      }),
    }],
  });

  const streaks = streaksPanel(), grading = gradingPanel();

  return `
    <div class="tiles">${tiles.map(statTile).join("")}</div>
    <div class="panel"><h2>Ratings in release order <span class="note">movies</span></h2>
      ${timelineChart(movies)}
      <h2 class="subheading">Ratings in release order <span class="note">shows</span></h2>
      ${timelineChart(shows)}
    </div>
    <div class="grid-2 section-gap">
      <div class="panel"><h2>Rating distribution ${segControl("dist")}</h2>${histogram}</div>
      <div class="panel"><h2>Average by year ${segControl("year")}</h2>${yearChart}</div>
    </div>
    ${streaks || grading ? `<div class="grid-2 section-gap">${streaks}${grading}</div>` : ""}
    <div class="section-gap"></div>`;
}

function phaseAverages(items, unit) {
  return [1, 2, 3, 4, 5, 6]
    .map((p) => {
      const xs = items.filter((i) => i.phase === p);
      return { name: `Phase ${p}`, average: avg(xs.map((i) => i.rating)), count: xs.length };
    })
    .filter((p) => p.count > 0)
    .map((p) => meterRow({ rank: "", title: p.name, rating: fmt(p.average), tag: `${p.count} ${p.count === 1 ? unit.replace(/s$/, "") : unit}` }))
    .join("");
}

// Franchise members are derived from titles so their averages track live
// rating edits. The sheet's rating lists are only a fallback for franchises
// whose titles we fail to match.
const FRANCHISE_EXTRAS = {
  "Hulk": ["The Incredible Hulk"],
  "Captain Marvel": ["The Marvels"],
};

function franchiseRatings(name) {
  const norm = (s) => s.toLowerCase().replace(/&/g, "and");
  const n = norm(name);
  const extras = new Set(FRANCHISE_EXTRAS[name] ?? []);
  return movies.filter((m) => {
    if (extras.has(m.title)) return true;
    const t = norm(m.title);
    return t === n || t === `the ${n}` ||
      t.startsWith(`${n}:`) || t.startsWith(`${n} `) ||
      t.startsWith(`the ${n}:`) || t.startsWith(`the ${n} `);
  })
    // Release order, not rank order: the list of scores reads as the run of
    // a franchise over time, so it has to follow the films, not the board.
    .sort((a, b) => (a.release ?? Infinity) - (b.release ?? Infinity))
    .map((m) => m.rating);
}

function renderPhases() {
  if (!movies.length && !shows.length) { $("#view").innerHTML = NOTHING_RANKED; return; }
  // Franchises with no ranked member simply don't appear yet.
  const franchises = FRANCHISES.map((f) => ({ name: f.name, ratings: franchiseRatings(f.name) }))
    .filter((f) => f.ratings.length)
    .map((f) => ({ ...f, average: avg(f.ratings) }))
    .sort((a, b) => b.average - a.average);
  $("#view").innerHTML = `
    ${renderStats()}
    <div class="grid-2">
      <div class="panel"><h2>Phase averages <span class="note">movies</span></h2>
        ${phaseAverages(movies, "films")}
        <h2 class="subheading">Phase averages <span class="note">shows</span></h2>
        ${phaseAverages(shows, "shows")}
      </div>
      <div class="panel"><h2>Franchise averages</h2>
        ${franchises.map((f) => meterRow({ rank: "", title: f.name, rating: fmt(f.average), tag: f.ratings.join(" · ") })).join("")}
      </div>
    </div>`;
  $("#view").querySelectorAll(".segbtn[data-chart]").forEach((b) =>
    b.addEventListener("click", () => { statsFilter[b.dataset.chart] = b.dataset.pick; renderPhases(); }));
  $("#view").querySelectorAll(".segbtn[data-streak]").forEach((b) =>
    b.addEventListener("click", () => { streakLevel[b.dataset.streak] = +b.dataset.level; renderPhases(); }));
}

function vsRow(cfg, m) {
  const theirs10 = cfg.score(m);
  const mine = ratingColor(m.rating), theirs = ratingColor(theirs10);
  const delta = m.rating - theirs10;
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  return `<div class="vsrow" title="${cfg.rowTip(m)}">
    <span class="title">${m.title}</span>
    <span class="cell" style="background:${mine.bg};color:${mine.ink}">${m.rating}</span>
    <span class="cell" style="background:${theirs.bg};color:${theirs.ink}">${cfg.display(m)}</span>
    <span class="delta">${sign}${fmt(Math.abs(delta))}</span>
  </div>`;
}

// Pearson on the raw scores, Spearman on ranks (average ranks for ties).
function pearson(xs, ys) {
  const mx = avg(xs), my = avg(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}

function toRanks(xs) {
  const sorted = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const ranks = Array(xs.length);
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1][0] === sorted[i][0]) j++;
    for (let k = i; k <= j; k++) ranks[sorted[k][1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return ranks;
}

// Scatter of my rating against another source's, both on the 0-10 scale so
// the diagonal marks perfect agreement. Dot color repeats my rating (the
// site-wide scale); position is the real encoding.
function scatterChart(pairs, xLabel, who) {
  const W = 460, H = 430, L = 30, R = 14, T = 16, B = 34;
  const sx = (v) => L + (v / 10) * (W - L - R);
  const sy = (v) => H - B - (v / 10) * (H - T - B);
  const ticks = [0, 2, 4, 6, 8, 10];
  const grid = ticks.map((t) => `
    <line class="grid" x1="${sx(0)}" y1="${sy(t)}" x2="${sx(10)}" y2="${sy(t)}"/>
    <line class="grid" x1="${sx(t)}" y1="${sy(0)}" x2="${sx(t)}" y2="${sy(10)}"/>
    <text class="tick" x="${L - 6}" y="${sy(t)}" text-anchor="end" dominant-baseline="middle">${t}</text>
    <text class="tick" x="${sx(t)}" y="${H - B + 14}" text-anchor="middle">${t}</text>`).join("");
  const dots = pairs.map((p) => `
    <g data-tip="${p.tip}">
      <circle class="hit" cx="${sx(p.theirs)}" cy="${sy(p.mine)}" r="12" fill="transparent"/>
      <circle cx="${sx(p.theirs)}" cy="${sy(p.mine)}" r="5" fill="${ratingColor(p.mine).bg}"/>
    </g>`).join("");
  return `<svg class="vsscatter" viewBox="0 0 ${W} ${H}" role="img"
      aria-label="Scatter plot of my ratings against ${who} ratings">
    ${grid}
    <line class="diag" x1="${sx(0)}" y1="${sy(0)}" x2="${sx(10)}" y2="${sy(10)}"/>
    <text class="hint" x="${sx(1.6)}" y="${sy(8.9)}">I liked it more</text>
    <text class="hint" x="${sx(9.9)}" y="${sy(0.4)}" text-anchor="end">${who} liked it more</text>
    ${dots}
    <text class="axis" x="${(L + W - R) / 2}" y="${H - 4}" text-anchor="middle">${xLabel}</text>
    <text class="axis" x="12" y="${(T + H - B) / 2}" text-anchor="middle"
      transform="rotate(-90 12 ${(T + H - B) / 2})">My rating</text>
  </svg>`;
}

// Everything the vs-X tabs need to know about a ratings source. score() puts
// the source on my 0-10 scale; display() is what its table cell shows.
const VS_SOURCES = {
  imdb: {
    name: "IMDb", col: "IMDb", who: "IMDb",
    heading: "Me vs the crowd",
    xLabel: "IMDb rating",
    score: (m) => IMDB[m.title]?.rating,
    display: (m) => `${IMDB[m.title].rating}`,
    rowTip: (m) => `${m.title} — me ${m.rating}, IMDb ${IMDB[m.title].rating} (${IMDB[m.title].votes.toLocaleString()} votes)`,
    fineprint: () => `IMDb ratings snapshot ${IMDB_SNAPSHOT} — refresh with <code>scripts/fetch-imdb.mjs</code>.
      Shows are left out: IMDb doesn't rate individual seasons.`,
  },
  rt: {
    name: "RT Critics", col: "RT", who: "Critics",
    heading: "Me vs the critics",
    xLabel: "Tomatometer ÷ 10",
    score: (m) => RT[m.title] ? RT[m.title].critics / 10 : undefined,
    display: (m) => `${RT[m.title].critics}%`,
    rowTip: (m) => `${m.title} — me ${m.rating}, Tomatometer ${RT[m.title].critics}%, audience ${RT[m.title].audience}%`,
    fineprint: () => `Rotten Tomatoes Tomatometer snapshot ${RT_SNAPSHOT} — refresh with <code>scripts/fetch-rt.mjs</code>.
      Movies only; &Delta; compares my rating with the Tomatometer &divide; 10.`,
  },
  rtAud: {
    name: "RT Audience", col: "Aud", who: "Audience",
    heading: "Me vs the audience",
    xLabel: "Popcornmeter ÷ 10",
    score: (m) => RT[m.title]?.audience != null ? RT[m.title].audience / 10 : undefined,
    display: (m) => `${RT[m.title].audience}%`,
    rowTip: (m) => `${m.title} — me ${m.rating}, audience ${RT[m.title].audience}%, Tomatometer ${RT[m.title].critics}%`,
    fineprint: () => `Rotten Tomatoes Popcornmeter snapshot ${RT_SNAPSHOT} — refresh with <code>scripts/fetch-rt.mjs</code>.
      Movies only; &Delta; compares my rating with the Popcornmeter &divide; 10.`,
  },
};

const vsSortState = { imdb: "theirs", rt: "theirs", rtAud: "theirs" };
let vsSource = "imdb";

function renderVsSource(id) {
  const cfg = VS_SOURCES[id];
  const rated = movies.filter((m) => cfg.score(m) != null);
  if (!rated.length) {
    $("#view").innerHTML = `
      <div class="vsswitch"><span class="seg">${Object.entries(VS_SOURCES).map(([sid, s]) =>
        `<button class="segbtn${sid === id ? " active" : ""}" data-src="${sid}">${s.name}</button>`).join("")}</span></div>
      ${NOTHING_RANKED}`;
    $("#view").querySelectorAll(".vsswitch .segbtn").forEach((btn) =>
      btn.addEventListener("click", () => { vsSource = btn.dataset.src; renderVsSource(vsSource); }));
    return;
  }
  const pairs = rated.map((m) => ({ m, title: m.title, mine: m.rating, theirs: cfg.score(m) }));
  const mine = pairs.map((p) => p.mine), theirs = pairs.map((p) => p.theirs);
  const r = pearson(mine, theirs);
  const rho = pearson(toRanks(mine), toRanks(theirs));
  const gap = avg(theirs) - avg(mine);
  const tiles = [
    { label: "Correlation", value: r.toFixed(2), sub: `Pearson r · ${pairs.length} movies` },
    { label: "Rank agreement", value: rho.toFixed(2), sub: "Spearman ρ" },
    { label: gap >= 0 ? "Tougher grader" : "Softer grader", value: `${gap >= 0 ? "−" : "+"}${fmt(Math.abs(gap))}`, sub: `my avg ${fmt(avg(mine))} vs ${cfg.col} ${fmt(avg(theirs))}` },
  ];

  // Stretch the source's compressed scale onto mine: its lowest-rated movie
  // becomes a 0 and its highest a 10, everything else in proportion.
  const lo = Math.min(...theirs), hi = Math.max(...theirs);
  const adjust = (v) => ((v - lo) / (hi - lo)) * 10;
  const rawPairs = pairs.map((p) => ({ ...p, tip: `${p.title} — me ${p.mine}, ${cfg.col} ${cfg.display(p.m)}` }));
  const adjPairs = pairs.map((p) => ({
    ...p, theirs: adjust(p.theirs),
    tip: `${p.title} — me ${p.mine}, ${cfg.col} ${cfg.display(p.m)} → ${fmt(adjust(p.theirs))} adjusted`,
  }));

  const sorts = {
    me: { note: "movies sorted by my rating", key: (m) => m.rating },
    theirs: { note: `movies sorted by ${cfg.name} rating`, key: cfg.score },
    delta: { note: `movies sorted by disagreement with ${cfg.name}`, key: (m) => Math.abs(m.rating - cfg.score(m)) },
  };
  const { note, key } = sorts[vsSortState[id]];
  const rows = [...rated].sort((a, b) => key(b) - key(a));
  const head = (sid, label) =>
    `<span class="vscol${vsSortState[id] === sid ? " active" : ""}" data-sort="${sid}">${label}</span>`;
  $("#view").innerHTML = `
    <div class="vsswitch"><span class="seg">${Object.entries(VS_SOURCES).map(([sid, s]) =>
      `<button class="segbtn${sid === id ? " active" : ""}" data-src="${sid}">${s.name}</button>`).join("")}</span></div>
    <div class="tiles vstiles">${tiles.map(statTile).join("")}</div>
    <div class="grid-2 vscharts">
      <div class="panel">
        <h2>${cfg.heading} <span class="note">each dot is a movie · the line is perfect agreement</span></h2>
        ${scatterChart(rawPairs, cfg.xLabel, cfg.who)}
      </div>
      <div class="panel">
        <h2>Adjusted to my scale <span class="note">${cfg.col} stretched so its lowest is 0, highest 10</span></h2>
        ${scatterChart(adjPairs, `${cfg.xLabel}, stretched to 0–10`, cfg.who)}
      </div>
    </div>
    <div class="panel vspanel section-gap">
      <h2>Hot takes <span class="note">${note}</span></h2>
      <div class="vsrow vshead">
        <span class="title"></span>${head("me", "Me")}${head("theirs", cfg.col)}${head("delta", "&Delta;")}
      </div>
      ${rows.map((m) => vsRow(cfg, m)).join("")}
      <p class="fineprint">${cfg.fineprint()}</p>
    </div>`;
  $("#view").querySelectorAll(".vshead .vscol").forEach((el) =>
    el.addEventListener("click", () => { vsSortState[id] = el.dataset.sort; renderVsSource(id); }));
  $("#view").querySelectorAll(".vsswitch .segbtn").forEach((btn) =>
    btn.addEventListener("click", () => { vsSource = btn.dataset.src; renderVsSource(vsSource); }));
}

// The pre-Disney+ era, parked on its own page: no ratings and no effect on
// any stats until a season is added by hand. Watch one and "+ add" drops it
// into the unranked show pool, where it behaves like any other show; the
// card here then says so, and can put it back.
const legacyState = (title) =>
  shows.some((s) => s.title === title) ? "ranked"
    : unwatchedShows.includes(title) ? "added" : "off";

function addLegacy(title) {
  if (!LEGACY_META.has(title) || legacyState(title) !== "off") return;
  const snap = snapshotState();
  // At the top of the pool rather than in release order: it was just added
  // by hand, and the next thing to do is drag it into the list.
  unwatchedShows = [title, ...unwatchedShows];
  saveEdits();
  offerUndo(snap);
  renderLegacy();
}

function removeLegacy(title) {
  const snap = snapshotState();
  const at = shows.findIndex((s) => s.title === title);
  if (at >= 0) {
    shows.splice(at, 1);
    shows.forEach((s, i) => (s.rank = i + 1));
  }
  unwatchedShows = unwatchedShows.filter((t) => t !== title);
  saveEdits();
  offerUndo(snap);
  renderLegacy();
  updateBalanceAlert();
}

function renderLegacy() {
  const phases = [...new Set(LEGACY_SHOWS.map((s) => s.phase))].filter((p) => p != null);
  const added = LEGACY_SHOWS.filter((s) => legacyState(s.title) !== "off").length;
  const action = (title) => {
    const state = legacyState(title);
    if (state === "off") {
      return `<button class="legacybtn" data-add="${title}"
        title="add it to the show rankings">+ add</button>`;
    }
    const item = shows.find((s) => s.title === title);
    return `<button class="legacybtn on" data-remove="${title}"
      title="take it back out of the show rankings">${item ? `#${item.rank}` : "added"} ✓</button>`;
  };
  $("#view").innerHTML = `
    <div class="panel legacywrap">
      <h2>Legacy TV <span class="note">${LEGACY_SHOWS.length} seasons from the pre-Disney+ era —
        separate from the rankings${added ? `, ${added} added so far` : ", until you add one"}</span></h2>
      ${phases.map((p) => {
        const entries = LEGACY_SHOWS.filter((s) => s.phase === p);
        return `
        <section class="phase-block">
          <h3 style="--phase:${PHASE_COLORS[p]}"><span class="dot"></span>Phase ${p}
            <span class="note">${entries.length} season${entries.length === 1 ? "" : "s"}</span></h3>
          <div class="covers">${entries.map((s) =>
            coverCard({ title: s.title, phase: p, rating: null, action: action(s.title) })).join("")}</div>
        </section>`;
      }).join("")}
      <p class="fineprint">Added seasons join the show pool on the Rankings tab — drag one up into
        the list to score it. Nothing here counts toward any average until you do.</p>
    </div>`;
  // The whole card opens the detail popup, so the button has to keep its
  // click to itself.
  $("#view").querySelectorAll("[data-add]").forEach((b) =>
    b.addEventListener("click", (e) => { e.stopPropagation(); addLegacy(b.dataset.add); }));
  $("#view").querySelectorAll("[data-remove]").forEach((b) =>
    b.addEventListener("click", (e) => { e.stopPropagation(); removeLegacy(b.dataset.remove); }));
}

// Drag-to-rank picture lists: the Spider-Man, Heroes and Villains tabs are
// the same widget over a different roster. Each ordering is its own thing —
// separate from the MCU rankings and their zero-sum averages — and syncs
// across devices by riding in the guesses store under a reserved key (title
// lookups never collide with a leading "__").
//
// A saved order is kept even when the roster changes underneath it: known
// entries hold their places and anything new lands at the bottom, so adding
// a character never wipes a hand-made ranking.
function rosterOrder(storeKey, keys) {
  const saved = Array.isArray(guesses[storeKey]) ? guesses[storeKey] : [];
  const known = new Set(keys);
  const kept = saved.filter((k, i) => known.has(k) && saved.indexOf(k) === i);
  const held = new Set(kept);
  return [...kept, ...keys.filter((k) => !held.has(k))];
}

// cfg: { storeKey, entries: [{ key, name, sub, color, img }], heading, note,
//        cardTitle, cardFile, cardLimit, fineprint }
function renderRoster(cfg) {
  const order = rosterOrder(cfg.storeKey, cfg.entries.map((e) => e.key));
  const byKey = new Map(cfg.entries.map((e) => [e.key, e]));
  $("#view").innerHTML = `
    <div class="panel rosterwrap">
      <h2>${cfg.heading} <button class="avgchip cardbtn" id="roster-h2h"
        title="rank by picking one at a time instead of dragging">head to head</button><button class="avgchip cardbtn" id="roster-card"
        title="make a shareable top-${cfg.cardLimit} image">top ${cfg.cardLimit} card</button><span class="note">${cfg.note}</span></h2>
      <div class="rosterlist${cfg.portraits ? " portraits" : ""}">${order.map((key, i) => {
        const e = byKey.get(key);
        return `<div class="rosterrow" data-drag data-title="${key}">
          <span class="rank">${i + 1}</span>
          <div class="card" style="--phase:${e.color}">
            ${e.img ? `<img src="${e.img}" alt="" loading="lazy">` : `<span class="noimg">${e.name.slice(0, 2).toUpperCase()}</span>`}
            <span class="meta">
              <span class="name">${e.name}</span>
              <span class="era">${e.sub}</span>
            </span>
          </div>
          <span class="grip" title="drag to reorder">⠿</span>
        </div>`;
      }).join("")}</div>
      <p class="fineprint">${cfg.fineprint}</p>
    </div>`;
  const list = $("#view").querySelector(".rosterlist");
  makeDraggable([list], () => {
    const snap = snapshotState();
    guesses[cfg.storeKey] = [...list.children].filter((el) => el.dataset.title).map((el) => el.dataset.title);
    pushGuesses();
    offerUndo(snap);
    views[currentView]();
  });
  $("#roster-card")?.addEventListener("click", () =>
    openShareCard(order.map((key, i) => ({ title: key, rank: i + 1 })),
      cfg.cardTitle, cfg.cardFile, cfg.cardLimit));
  $("#roster-h2h")?.addEventListener("click", () => openHeadToHead(cfg, order));
}

// Head-to-head: dragging 57 characters into order is a slog, so this asks
// "which one?" instead. The list's current order seeds the ratings, so every
// answer refines what's there rather than starting from noise — a dozen
// matchups already move things, and there's no finish line to reach. Elo
// keeps it honest: beating something far above you is worth several places,
// beating the item below you is worth almost nothing.
const H2H_SEED_SPREAD = 8; // rating points per starting place
// Elo's K, per entry: big while an entry is new and its place is really just
// the old list's opinion, settling as it earns one of its own.
const h2hStep = (matches) => 20 + 60 / (1 + matches);

function openHeadToHead(cfg, order) {
  const byKey = new Map(cfg.entries.map((e) => [e.key, e]));
  const mid = (order.length - 1) / 2;
  const rating = new Map(order.map((k, i) => [k, 1500 + (mid - i) * H2H_SEED_SPREAD]));
  const seen = new Map(order.map((k) => [k, 0]));
  const streak = new Map(order.map((k) => [k, 0]));
  const faced = new Set();
  const pairKey = (a, b) => [a, b].sort().join("|");
  const standing = () => [...rating.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];
  let rounds = 0;
  let pair = null;

  // Ask about the least-seen entry, against a neighbour in the current
  // standing: those are the pairs whose answer actually reorders anything.
  // The window widens only when the near ones are used up.
  function nextPair() {
    const rank = standing();
    const pos = new Map(rank.map((k, i) => [k, i]));
    const fewest = Math.min(...seen.values());
    // Normally a random least-seen entry; the rest of the standings are a
    // fallback, so "no matchups left" is only reported when that is true —
    // one entry having faced everyone doesn't end the session.
    for (const a of [pick(rank.filter((k) => seen.get(k) <= fewest + 1)), ...rank]) {
      // A settled entry meets a neighbour: that's the matchup whose answer
      // isn't already implied by the list. An entry on a run of wins (or
      // losses) is in the wrong place rather than on form, so it meets
      // someone that far up — further with each win — and a badly misplaced
      // one climbs in a few taps instead of a few dozen.
      const run = streak.get(a) ?? 0;
      const target = pos.get(a) - Math.sign(run) * Math.max(0, Math.abs(run) - 1) * 9;
      const options = rank
        .filter((k) => k !== a && !faced.has(pairKey(a, k)))
        .sort((x, y) => Math.abs(pos.get(x) - target) - Math.abs(pos.get(y) - target));
      if (options.length) {
        const b = pick(options.slice(0, 4));
        return Math.random() < 0.5 ? [a, b] : [b, a];
      }
    }
    return null; // everything has faced everything
  }

  const modal = document.createElement("div");
  modal.className = "share-modal h2h-modal";
  document.body.appendChild(modal);

  function draw(flash = "") {
    const [a, b] = pair ?? [];
    modal.innerHTML = `
      <div class="share-box h2h-box">
        <h2>${cfg.h2hPrompt} <span class="note">tap the one you rate higher</span></h2>
        ${pair ? `<div class="h2h-pair">${[a, b].map((k) => {
          const e = byKey.get(k);
          return `<button class="h2hpick" data-key="${k}">
            ${e.img ? `<img src="${e.img}" alt="">` : `<span class="noimg">${e.name.slice(0, 2).toUpperCase()}</span>`}
            <span class="h2hname">${e.name}</span>
            <span class="h2hsub" style="color:${e.color}">${e.sub}</span>
          </button>`;
        }).join("")}</div>
        <button class="h2hskip">can't choose — skip</button>`
        : `<p class="fineprint h2hdone">Every matchup has been played. That order is as settled as it gets.</p>`}
        <p class="h2hflash">${flash}</p>
        <div class="share-actions">
          <button class="chip" data-apply${rounds ? "" : " disabled"}>${rounds ? `Apply — ${rounds} matchup${rounds === 1 ? "" : "s"}` : "Apply"}</button>
          <button class="chip" data-cancel>Cancel</button>
        </div>
      </div>`;
    modal.querySelectorAll(".h2hpick").forEach((btn) =>
      btn.addEventListener("click", () => choose(btn.dataset.key)));
    modal.querySelector(".h2hskip")?.addEventListener("click", () => {
      faced.add(pairKey(a, b));
      pair = nextPair();
      draw();
    });
    modal.querySelector("[data-apply]").addEventListener("click", apply);
    modal.querySelector("[data-cancel]").addEventListener("click", close);
  }

  function choose(winner) {
    const loser = pair[0] === winner ? pair[1] : pair[0];
    faced.add(pairKey(winner, loser));
    const rw = rating.get(winner), rl = rating.get(loser);
    // How surprising the result was: beating something well above you moves
    // the list; beating the entry just below you barely does.
    const surprise = 1 - 1 / (1 + 10 ** ((rl - rw) / 400));
    rating.set(loser, rl - h2hStep(seen.get(loser)) * surprise);
    // The tap is an assertion, not a data point: the winner ends up above
    // the loser, by a place at least. Elo alone would leave something you
    // just beat from thirty places down still ahead of you, which reads as
    // the answer having been ignored.
    rating.set(winner, Math.max(rw + h2hStep(seen.get(winner)) * surprise,
      rating.get(loser) + H2H_SEED_SPREAD));
    seen.set(winner, seen.get(winner) + 1);
    seen.set(loser, seen.get(loser) + 1);
    streak.set(winner, Math.max(1, (streak.get(winner) ?? 0) + 1));
    streak.set(loser, Math.min(-1, (streak.get(loser) ?? 0) - 1));
    rounds++;
    const place = standing().indexOf(winner) + 1;
    pair = nextPair();
    draw(`${byKey.get(winner).name} → #${place}`);
  }

  function apply() {
    const snap = snapshotState();
    guesses[cfg.storeKey] = standing();
    pushGuesses();
    offerUndo(snap);
    close();
    views[currentView]();
  }

  function close() {
    document.removeEventListener("keydown", onKey);
    modal.remove();
  }

  function onKey(e) {
    if (e.key === "Escape") return close();
    if (!pair) return;
    if (e.key === "ArrowLeft") choose(pair[0]);
    if (e.key === "ArrowRight") choose(pair[1]);
  }

  document.addEventListener("keydown", onKey);
  pair = nextPair();
  draw();
}

// A group legend — the color key shared by the character tabs.
const groupLegend = (groups) =>
  `<span class="rosterkey">${Object.entries(groups)
    .map(([label, color]) => `<span style="--phase:${color}">${label}</span>`).join("")}</span>`;

const SPIDERMAN_MOVIES = [
  "Spider-Man", "Spider-Man 2", "Spider-Man 3",
  "The Amazing Spider-Man", "The Amazing Spider-Man 2",
  "Spider-Man: Homecoming", "Spider-Man: Into the Spider-Verse",
  "Spider-Man: Far From Home", "Spider-Man: No Way Home",
  "Spider-Man: Across the Spider-Verse", "Spider-Man: Brand New Day",
];
const SPIDER_ERAS = {
  "Spider-Man": ["Tobey Maguire", "#e05252"],
  "Spider-Man 2": ["Tobey Maguire", "#e05252"],
  "Spider-Man 3": ["Tobey Maguire", "#e05252"],
  "The Amazing Spider-Man": ["Andrew Garfield", "#ef9f43"],
  "The Amazing Spider-Man 2": ["Andrew Garfield", "#ef9f43"],
  "Spider-Man: Homecoming": ["Tom Holland", "#4a86e8"],
  "Spider-Man: Far From Home": ["Tom Holland", "#4a86e8"],
  "Spider-Man: No Way Home": ["Tom Holland", "#4a86e8"],
  "Spider-Man: Brand New Day": ["Tom Holland", "#4a86e8"],
  "Spider-Man: Into the Spider-Verse": ["Spider-Verse", "#a05ce8"],
  "Spider-Man: Across the Spider-Verse": ["Spider-Verse", "#a05ce8"],
};

function renderSpiderman() {
  renderRoster({
    storeKey: "__spiderman",
    h2hPrompt: "Better Spider-Man movie?",
    entries: SPIDERMAN_MOVIES.map((t) => {
      const [era, color] = SPIDER_ERAS[t];
      return { key: t, name: t, sub: era, color, img: COVERS[t] };
    }),
    heading: "Spider-Man, ranked",
    note: `all ${SPIDERMAN_MOVIES.length} movies, every era · drag to reorder`,
    cardTitle: "EVERY SPIDER-MAN MOVIE, RANKED",
    cardFile: "marvel-ranked-spiderman.png",
    cardLimit: 11,
    fineprint: "A multiverse-wide ranking — separate from the MCU list, no ratings, just order.",
  });
}

// The people, not the projects: every hero and every villain who has shown up
// on screen, ranked by hand. Portraits and rosters live in characters.js.
function characterEntries(roster, groups) {
  return roster.map((c) => ({
    key: c.name, name: c.name, sub: c.actor, color: groups[c.group] ?? "#8a8781", img: c.img,
  }));
}

function renderHeroes() {
  renderRoster({
    storeKey: "__heroes",
    h2hPrompt: "Better hero?",
    entries: characterEntries(HEROES, HERO_GROUPS),
    heading: "Heroes, ranked",
    note: `all ${HEROES.length} of them · drag to reorder`,
    cardTitle: "MY TOP 10 MARVEL HEROES",
    cardFile: "marvel-ranked-heroes.png",
    cardLimit: 10,
    portraits: true,
    fineprint: `Colors by corner of the universe: ${groupLegend(HERO_GROUPS)}`,
  });
}

function renderVillains() {
  renderRoster({
    storeKey: "__villains",
    h2hPrompt: "Better villain?",
    entries: characterEntries(VILLAINS, VILLAIN_GROUPS),
    heading: "Villains, ranked",
    note: `all ${VILLAINS.length} of them · drag to reorder`,
    cardTitle: "MY TOP 10 MARVEL VILLAINS",
    cardFile: "marvel-ranked-villains.png",
    cardLimit: 10,
    portraits: true,
    fineprint: `Colors by corner of the universe: ${groupLegend(VILLAIN_GROUPS)}`,
  });
}

const views = {
  rankings: renderRankings, phases: renderPhases,
  vs: () => renderVsSource(vsSource),
  spiderman: renderSpiderman,
  heroes: renderHeroes,
  villains: renderVillains,
  legacy: renderLegacy,
};

let currentView = "rankings";

document.querySelector("nav.tabs").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-view]");
  if (!btn) return;
  document.querySelectorAll("nav.tabs button").forEach((b) => b.classList.toggle("active", b === btn));
  currentView = btn.dataset.view;
  views[currentView]();
});

// With an account signed in, the server copy is the source of truth: pull
// the live rankings on load (the localStorage copy already shown is just a
// cache).
if (syncOn) {
  fetchLive()
    .then((live) => {
      if (!live.ok) throw new Error(live.error);
      if (live.user === undefined)
        console.warn("sheet sync: the web app predates accounts — paste the new scripts/sheet-webapp.gs into Apps Script and redeploy, or every username reads the owner's sheet");
      // A brand-new account starts from whatever this browser currently
      // shows (offline edits if any, else the built-in baseline): seed the
      // server copy with it, guesses included.
      if (live.fresh) { saveEdits(); return; }
      // Server guesses win — EXCEPT when the server store is empty and this
      // device still has some: that's a device with un-migrated (or otherwise
      // unsaved) guesses, and they must seed the server, never be wiped by it.
      // They are settled before the pack is applied: they carry the ratings
      // of any promoted legacy season, which the pack needs to validate.
      const haveGuesses = live.guesses && typeof live.guesses === "object";
      if (haveGuesses) {
        if (Object.keys(live.guesses).length === 0 && Object.keys(guesses).length > 0) {
          pushGuesses();
        } else {
          guesses = live.guesses;
          legacyPromoted = guesses[LEGACY_STORE] ?? {};
          localStorage.setItem(GUESS_KEY, JSON.stringify(guesses));
        }
      }
      const packApplied = applyPack(live);
      if (packApplied) {
        // Cache what was applied rather than what arrived: a promoted legacy
        // season comes back from the sheet without its rating, and a cache
        // holding that would fail to load on the next visit.
        const cache = (xs) => [...xs].sort((a, b) => a.rank - b.rank).map((i) => ({ t: i.title, r: i.rating }));
        localStorage.setItem(EDITS_KEY, JSON.stringify({
          movies: cache(movies), shows: cache(shows), unwatched: [...unwatchedShows, ...unrankedMovies],
        }));
      }
      if (packApplied || haveGuesses) {
        views[currentView]();
        updateBalanceAlert();
      }
    })
    .catch((err) => console.warn("sheet sync: load failed —", err));
}

// One shared tooltip for every [data-tip] mark. pointerover covers both
// mouse hover and touch taps (a tap fires pointerover before pointerdown);
// tapping or hovering anything without a data-tip hides it again.
const tooltip = document.createElement("div");
tooltip.className = "tooltip";
document.body.appendChild(tooltip);
let tipFor = null;

document.addEventListener("pointerover", (e) => {
  const el = e.target.closest("[data-tip]");
  if (el === tipFor) return;
  tipFor = el;
  if (!el) { tooltip.classList.remove("show"); return; }
  tooltip.textContent = el.dataset.tip;
  tooltip.classList.add("show");
  const mark = el.querySelector("i") || el; // anchor to the bar fill, not the full column slot
  const r = mark.getBoundingClientRect();
  const x = Math.max(8, Math.min(r.left + r.width / 2 - tooltip.offsetWidth / 2,
    window.innerWidth - tooltip.offsetWidth - 8));
  const above = r.top - tooltip.offsetHeight - 8;
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${above >= 8 ? above : r.bottom + 8}px`;
});
window.addEventListener("scroll", () => { tipFor = null; tooltip.classList.remove("show"); }, true);

// The rating scale is zero-sum by design: movie and show averages must both
// stay at exactly 5. If an edit breaks that, flag it above every tab with the
// exact number of points to give back or hand out.
function updateBalanceAlert() {
  // The example board is someone else's list, not an edit to answer for.
  if (demoMode) { document.querySelector(".balance-alert")?.remove(); return; }
  const issues =[["Movies", movies], ["Shows", shows]].flatMap(([label, xs]) => {
    const sum = xs.reduce((a, x) => a + x.rating, 0);
    const diff = sum - xs.length * 5;
    if (diff === 0) return [];
    return [`${label} average ${fmt(sum / xs.length)} — ${Math.abs(diff)} point${Math.abs(diff) === 1 ? "" : "s"} ${diff > 0 ? "over" : "under"}`];
  });
  let el = document.querySelector(".balance-alert");
  if (!issues.length) { el?.remove(); return; }
  if (!el) {
    el = document.createElement("div");
    el.className = "balance-alert";
    document.querySelector("nav.tabs").after(el);
  }
  el.innerHTML = `<strong>⚠ Averages off the 5.0 target</strong> ${issues.join(" · ")}`;
}
updateBalanceAlert();
renderDemoBanner();

$("#hero-bg").innerHTML = byRelease([...MOVIE_META.values()])
  .map((t) => COVERS[t])
  .filter(Boolean)
  .map((src) => `<img src="${src}" alt="" loading="lazy">`)
  .join("");

// Account chip in the header. Signing in (or out) reloads: the whole app —
// syncOn, the pulled pack, the guesses — keys off the account at boot.
// Signing out clears the local caches so the site falls back to the
// built-in baseline rankings rather than the departed account's copy.
const accountBox = $("#account");

function showSignin() {
  accountBox.innerHTML = `<form id="signin-form">
    <input id="signin-name" maxlength="24" placeholder="username" autocomplete="username"
      spellcheck="false" title="letters, numbers, spaces, - and _">
    <button>Sign in</button>
  </form>`;
  const input = $("#signin-name");
  input.focus();
  $("#signin-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!VALID_USER.test(name)) { input.classList.add("bad"); input.focus(); return; }
    localStorage.setItem(USER_KEY, name);
    location.reload();
  });
}

function renderAccount() {
  if (!accountBox) return;
  if (account) {
    accountBox.innerHTML = `<span class="who" title="rankings save to this account">${account}</span>
      <button id="signout" title="back to the default rankings">sign out</button>`;
    $("#signout").addEventListener("click", () => {
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(EDITS_KEY);
      localStorage.removeItem(GUESS_KEY);
      location.reload();
    });
  } else {
    accountBox.innerHTML = `<button id="signin" title="a username is all it takes — your rankings sync to it">Sign in</button>`;
    $("#signin").addEventListener("click", showSignin);
  }
}
renderAccount();

renderRankings();
