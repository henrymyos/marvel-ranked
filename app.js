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
const ALL_SHOW_TITLES = new Set([...SHOW_META.keys(), ...UNWATCHED_META.keys()]);

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

// A show dragged into the rankings keeps its metadata if it ever had any;
// otherwise phase/year stay null and phase- and year-based views skip it.
const promotedShow = (title) => {
  const meta = SHOW_META.get(title) ?? UNWATCHED_META.get(title);
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
    const packedUn = (Array.isArray(saved.unwatched) ? saved.unwatched : []).filter((t) => ALL_SHOW_TITLES.has(t));
    const union = [...saved.shows.map((e) => e.t), ...packedUn];
    if (new Set(union).size === union.length && union.every((t) => ALL_SHOW_TITLES.has(t)) &&
        saved.shows.every((e) => Number.isInteger(e.r) && e.r >= 0 && e.r <= 10)) {
      shows.length = 0;
      saved.shows.forEach((e, i) => shows.push({ ...promotedShow(e.t), rating: e.r, rank: i + 1 }));
      const seen = new Set(union);
      unwatchedShows = [...packedUn,
        ...byRelease([...SHOW_META.values(), ...UNWATCHED_META.values()].filter((s) => !seen.has(s.title)))];
      applied = true;
    }
  }
  return applied;
}

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
  const pack = (xs) => [...xs].sort((a, b) => a.rank - b.rank).map((i) => ({ t: i.title, r: i.rating }));
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
      const stored = JSON.stringify({ movies: live.movies, shows: live.shows, unwatched: live.unwatched });
      const sent = JSON.stringify({ movies: body.movies, shows: body.shows, unwatched: body.unwatched });
      if (stored !== sent)
        console.warn("sheet sync: the sheet does not match the last save — edit may not have stuck");
    })
    .catch((err) => console.warn("sheet sync: could not verify save —", err));
}

// Expected ratings for the Coming Up slate, also browser-local. Titles with
// "Season" (plus known series) count as shows; everything else is a movie.
const GUESS_KEY = "marvelRankedGuesses.v2";
let guesses = {};
try { guesses = JSON.parse(localStorage.getItem(GUESS_KEY)) || {}; } catch {}

// Guesses sync on their own so a guess never drags a rankings pack along
// with it — important when data.js is behind the sheet and the in-memory
// rankings are stale. (The web app ignores absent fields.)
function pushGuesses() {
  localStorage.setItem(GUESS_KEY, JSON.stringify(guesses));
  if (!syncOn) return;
  fetch(SYNC.url, { method: "POST", body: JSON.stringify({ token: SYNC.token, user: account, guesses }) })
    .catch(() => {});
}

const UPCOMING_SHOW_HINTS = ["VisionQuest"];
const isUpcomingShow = (t) => /season\b/i.test(t) || UPCOMING_SHOW_HINTS.includes(t);

// One distinct color per rating value, warm to cool: reds and yellows for
// the low end, bright green at 5, then a blue ladder — light blue 6,
// blue 7, indigo 8 — with purple at 9 and pink reserved for perfect 10s.
// Every tier boundary is a clear hue change rather than a subtle shade shift.
// Ink is chosen per step for contrast.
const RATING_COLORS = [
  { bg: "#7f1d1d", ink: "#ffffff" }, // 0  dark red
  { bg: "#cf3535", ink: "#ffffff" }, // 1  red
  { bg: "#ef8146", ink: "#1a1a19" }, // 2  orange
  { bg: "#f9cb5f", ink: "#1a1a19" }, // 3  yellow
  { bg: "#c9c353", ink: "#1a1a19" }, // 4  yellow-green
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
    ${rated
      ? `<span class="score" style="background:${c.bg};color:${c.ink}">${item.rating}</span>`
      : `<span class="score unknown">?</span>`}
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
  if (!items.length) return "";
  const a = avg(items.map((i) => i.rating));
  return `<span class="avgchip${a === 5 ? "" : " off"}" title="average rating — the goal is exactly 5">avg ${fmt(a)}</span>`;
}

// Re-derive ratings and ranks from the DOM order after a drop, then
// re-render. Whatever sits in the ranklist is ranked (with the tier's
// rating); whatever sits in the pool below doesn't count toward anything.
function commitMovies(rankEl, poolEl) {
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
  renderRankings();
  updateBalanceAlert();
}

// The shows panel commits from two lists: whatever sits in the ranklist is
// ranked (unwatched shows dropped there get promoted, with the tier's rating),
// and whatever sits in the unwatched list doesn't count toward anything.
function commitShows(rankEl, unwatchedEl) {
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
        const candidates = [...target.children].filter((c) => c !== row && !c.classList.contains("fixed"));
        const next = candidates.find((c) => {
          const b = c.getBoundingClientRect();
          return ev.clientY < b.top + b.height / 2;
        }) ?? null;
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
    if ("r" in opt.dataset) guesses[title] = Number(opt.dataset.r);
    else delete guesses[title];
    pushGuesses();
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

function renderRankings() {
  closeGuessPop();
  const edited = localStorage.getItem(EDITS_KEY) !== null;
  const upMovies = UPCOMING.filter((t) => !isUpcomingShow(t));
  const upShows = UPCOMING.filter(isUpcomingShow);
  $("#view").innerHTML = `
    <div class="split">
      <div class="release-pane">
        ${releaseGallery([...movies, ...unrankedMovies.map((t) => MOVIE_META.get(t)).filter(Boolean)], "Movies")}
        <div class="section-gap"></div>
        ${releaseGallery([...shows, ...unwatchedShows.map((t) => SHOW_META.get(t) ?? UNWATCHED_META.get(t)).filter(Boolean)], "Shows")}
      </div>
      <div class="rank-pane">
        <div class="grid-2">
          <div class="stack">
            <div class="panel"><h2>Movies ${avgChip(movies)}<button class="avgchip cardbtn" data-card="movies" title="make a shareable top-10 image">top 10 card</button><span class="note">${movies.length} ranked · drag to re-rank</span></h2>
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
            <div class="panel"><h2>Shows ${avgChip(shows)}<button class="avgchip cardbtn" data-card="shows" title="make a shareable top-10 image">top 10 card</button><span class="note">${shows.length} ranked</span></h2>
              <div class="ranklist" data-kind="shows">${rankSeq(shows)}</div>
              <h2 class="subheading">Haven't seen <span class="note">${unwatchedShows.length} shows · guesses don't count · drag up once watched</span></h2>
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
  $("#view").querySelectorAll("button.cardbtn").forEach((btn) =>
    btn.addEventListener("click", () => btn.dataset.card === "shows"
      ? openShareCard(shows, "MY TOP 10 SHOWS", "marvel-ranked-top10-shows.png")
      : openShareCard(movies, "MY TOP 10 MOVIES", "marvel-ranked-top10-movies.png")));
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

const loadCover = (title, attempt = 0) => new Promise((resolve) => {
  if (!COVERS[title]) return resolve(null);
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.referrerPolicy = "no-referrer";
  img.onload = () => resolve(img);
  // Wikipedia sometimes 429s a burst of cover requests; one spaced retry
  // (cache-busted so the browser refetches) usually clears it.
  img.onerror = () => attempt < 1
    ? setTimeout(() => loadCover(title, attempt + 1).then(resolve), 1500)
    : resolve(null);
  img.src = COVERS[title] + (attempt ? (COVERS[title].includes("?") ? "&" : "?") + "retry=" + attempt : "");
});

async function buildShareCard(items, subtitle, limit = 10) {
  const top = byRank(items).slice(0, limit);
  // Load a few covers at a time instead of all ten at once — a full burst
  // trips Wikipedia's rate limiting and random cards come back blank.
  const imgs = [];
  const queue = top.map((m, i) => [i, m.title]);
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (queue.length) {
      const [i, title] = queue.shift();
      imgs[i] = await loadCover(title);
    }
  }));
  const W = 1080, H = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const font = (size, weight = 700) => `${weight} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;

  ctx.fillStyle = "#0d0d0d";
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Red plate header, same as the site's hero.
  ctx.font = font(88, 900);
  const plateW = ctx.measureText("MARVEL RANKED").width + 100;
  ctx.fillStyle = "#e62429";
  ctx.fillRect((W - plateW) / 2, 70, plateW, 130);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("MARVEL RANKED", W / 2, 141);
  ctx.font = font(34, 600);
  ctx.fillStyle = "#898781";
  ctx.fillText(subtitle, W / 2, 300);

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
    const img = imgs[cell.rank - 1];
    const { x, y, w, h } = cell;
    ctx.save();
    roundRectPath(ctx, x, y, w, h, cell.rank === 1 ? 18 : 14);
    ctx.clip();
    if (img) {
      // Posters fill the cell; landscape logo images get letterboxed instead
      // of being cropped to a sliver. Near-square posters still fill.
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
      ctx.font = font(56, 700);
      ctx.fillText(m.title.replace(/[^A-Z]/g, "").slice(0, 2) || m.title[0], x + w / 2, y + h / 2);
    }
    ctx.restore();

    // Rank badge: red circle in the poster's top-left corner.
    const big = cell.rank === 1;
    const r = big ? 52 : 42, bx = x + r + 10, by = y + r + 10;
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fillStyle = "#e62429";
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#0d0d0d";
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = font(big ? 58 : 44, 900);
    ctx.fillText(String(cell.rank), bx, by + 3);
  }
  return canvas;
}

function openShareCard(items, subtitle, filename, limit = 10) {
  const modal = document.createElement("div");
  modal.className = "share-modal";
  modal.innerHTML = `<div class="share-box"><p class="fineprint">Building your card…</p></div>`;
  document.body.appendChild(modal);
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
  buildShareCard(items, subtitle, limit).then((canvas) => {
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
    ?? LEGACY_SHOWS.find((l) => l.title === title);
  if (!meta) return;

  let status;
  if (item) {
    const list = isMovie ? movies : shows;
    const c = ratingColor(item.rating);
    status = `<div class="bigscore" style="background:${c.bg};color:${c.ink}">${item.rating}</div>
      <div class="rankline">#${item.rank} of ${list.length} ${isMovie ? "movies" : "shows"}</div>`;
  } else {
    const g = guesses[title];
    const legacy = !isMovie && !ALL_SHOW_TITLES.has(title);
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

function renderStats() {
  const all = [...movies, ...shows];
  const groupStats = (raw, key) => {
    const items = raw.filter((i) => i[key] != null);
    return [...new Set(items.map((i) => i[key]))].map((k) => {
      const xs = items.filter((i) => i[key] === k);
      return { key: k, average: avg(xs.map((i) => i.rating)), count: xs.length };
    }).sort((a, b) => b.average - a.average);
  };

  const byPhase = groupStats(all, "phase");
  const byYear = groupStats(all, "year");
  const movieAvg = avg(movies.map((m) => m.rating));
  const showAvg = avg(shows.map((s) => s.rating));
  const bestPhase = byPhase[0], worstPhase = byPhase[byPhase.length - 1];
  const bestYear = byYear[0], worstYear = byYear[byYear.length - 1];
  const tiles = [
    movies.length && { label: "Movie average", value: fmt(movieAvg), dotRating: movieAvg, sub: `${movies.length} films` },
    shows.length && { label: "Show average", value: fmt(showAvg), dotRating: showAvg, sub: `${shows.length} shows` },
    bestPhase && { label: "Best phase", value: `Phase ${bestPhase.key}`, dotRating: bestPhase.average, sub: `${fmt(bestPhase.average)} average` },
    worstPhase && { label: "Worst phase", value: `Phase ${worstPhase.key}`, dotRating: worstPhase.average, sub: `${fmt(worstPhase.average)} average` },
    bestYear && { label: "Best year", value: bestYear.key, dotRating: bestYear.average, sub: `${fmt(bestYear.average)} average` },
    worstYear && { label: "Worst year", value: worstYear.key, dotRating: worstYear.average, sub: `${fmt(worstYear.average)} average` },
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
  }).map((m) => m.rating);
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
  $("#view").querySelectorAll(".segbtn").forEach((b) =>
    b.addEventListener("click", () => { statsFilter[b.dataset.chart] = b.dataset.pick; renderPhases(); }));
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

// The pre-Disney+ era, parked on its own page: no ratings, no effect on any
// stats — the watchlist in release order, split by phase, until a decision
// is made.
function renderLegacy() {
  const phases = [...new Set(LEGACY_SHOWS.map((s) => s.phase))].filter((p) => p != null);
  $("#view").innerHTML = `
    <div class="panel legacywrap">
      <h2>Legacy TV <span class="note">${LEGACY_SHOWS.length} seasons from the pre-Disney+ era —
        parked here until they're watched &amp; ranked</span></h2>
      ${phases.map((p) => {
        const entries = LEGACY_SHOWS.filter((s) => s.phase === p);
        return `
        <section class="phase-block">
          <h3 style="--phase:${PHASE_COLORS[p]}"><span class="dot"></span>Phase ${p}
            <span class="note">${entries.length} season${entries.length === 1 ? "" : "s"}</span></h3>
          <div class="covers">${entries.map((s) => coverCard({ title: s.title, phase: p, rating: null })).join("")}</div>
        </section>`;
      }).join("")}
    </div>`;
}

// Every theatrical Spider-Man, ranked across the eras. This ordering is its
// own thing — separate from the MCU rankings and their zero-sum averages.
// It syncs across devices by riding in the guesses store under a reserved
// key (title lookups never collide with "__spiderman").
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

function spidermanOrder() {
  const saved = guesses.__spiderman;
  if (Array.isArray(saved) && saved.length === SPIDERMAN_MOVIES.length &&
      new Set(saved).size === saved.length && saved.every((t) => SPIDERMAN_MOVIES.includes(t)))
    return [...saved];
  return [...SPIDERMAN_MOVIES];
}

function renderSpiderman() {
  const order = spidermanOrder();
  $("#view").innerHTML = `
    <div class="panel spiderwrap">
      <h2>Spider-Man, ranked <button class="avgchip cardbtn" id="spider-card" title="make a shareable top-11 image">top 11 card</button><span class="note">all ${order.length} movies, every era · drag to reorder</span></h2>
      <div class="spiderlist">${order.map((t, i) => {
        const [era, color] = SPIDER_ERAS[t];
        const src = COVERS[t];
        return `<div class="spiderrow" data-drag data-title="${t}">
          <span class="rank">${i + 1}</span>
          <div class="card" style="--phase:${color}">
            ${src ? `<img src="${src}" alt="" loading="lazy">` : `<span class="noimg">SM</span>`}
            <span class="name">${t}</span>
            <span class="era" style="color:${color}">${era}</span>
          </div>
          <span class="grip" title="drag to reorder">⠿</span>
        </div>`;
      }).join("")}</div>
      <p class="fineprint">A multiverse-wide ranking — separate from the MCU list, no ratings, just order.</p>
    </div>`;
  const list = $("#view").querySelector(".spiderlist");
  makeDraggable([list], () => {
    guesses.__spiderman = [...list.children].filter((el) => el.dataset.title).map((el) => el.dataset.title);
    pushGuesses();
    renderSpiderman();
  });
  $("#spider-card")?.addEventListener("click", () =>
    openShareCard(spidermanOrder().map((t, i) => ({ title: t, rank: i + 1 })),
      "EVERY SPIDER-MAN MOVIE, RANKED", "marvel-ranked-spiderman.png", 11));
}

const views = {
  rankings: renderRankings, phases: renderPhases,
  vs: () => renderVsSource(vsSource),
  spiderman: renderSpiderman,
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
      const packApplied = applyPack(live);
      if (packApplied) {
        localStorage.setItem(EDITS_KEY, JSON.stringify({
          movies: live.movies, shows: live.shows, unwatched: live.unwatched,
        }));
      }
      // Server guesses win — EXCEPT when the server store is empty and this
      // device still has some: that's a device with un-migrated (or otherwise
      // unsaved) guesses, and they must seed the server, never be wiped by it.
      const haveGuesses = live.guesses && typeof live.guesses === "object";
      if (haveGuesses) {
        if (Object.keys(live.guesses).length === 0 && Object.keys(guesses).length > 0) {
          pushGuesses();
        } else {
          guesses = live.guesses;
          localStorage.setItem(GUESS_KEY, JSON.stringify(guesses));
        }
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
  const issues = [["Movies", movies], ["Shows", shows]].flatMap(([label, xs]) => {
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
