const $ = (sel) => document.querySelector(sel);

const movieRank = new Map(MOVIE_RANK_ORDER.map((t, i) => [t, i + 1]));
const showRank = new Map(SHOW_RANK_ORDER.map((t, i) => [t, i + 1]));

const movies = MOVIES.map((m, i) => ({ ...m, type: "movie", release: i + 1, rank: movieRank.get(m.title) }));
const shows = SHOWS.map((s, i) => ({ ...s, type: "show", release: i + 1, rank: showRank.get(s.title) }));

const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const fmt = (n) => (Math.round(n * 100) / 100).toFixed(2).replace(/0$/, "").replace(/\.0$/, "");

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
  const c = ratingColor(item.rating);
  return `<div class="card" style="--phase:${PHASE_COLORS[item.phase]}" title="${item.title} — ${item.rating}/10">
    ${media}
    <span class="name">${item.title}</span>
    <span class="score" style="background:${c.bg};color:${c.ink}">${item.rating}</span>
  </div>`;
}

function releaseGallery(items, heading) {
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

function renderRankings() {
  $("#view").innerHTML = `
    <div class="split">
      <div class="release-pane">
        ${releaseGallery(movies, "Movies")}
        <div class="section-gap"></div>
        ${releaseGallery(shows, "Shows")}
      </div>
      <div class="rank-pane">
        <div class="grid-2">
          <div class="panel"><h2>Movies <span class="note">${movies.length} ranked</span></h2>
            ${byRank(movies).map(meterRow).join("")}
          </div>
          <div class="panel"><h2>Shows <span class="note">${shows.length} ranked</span></h2>
            ${byRank(shows).map(meterRow).join("")}
            <h2 class="unwatched-heading">Haven't seen <span class="note">${UNWATCHED_SHOWS.length} shows</span></h2>
            ${UNWATCHED_SHOWS.map((t) => `<div class="row">
              <span class="rank">–</span>
              <span class="cellbox unwatched"><span class="title">${t}</span></span>
            </div>`).join("")}
          </div>
        </div>
        <div class="panel section-gap"><h2>Coming up <span class="note">announced movies &amp; shows</span></h2>
          <div class="chips">${UPCOMING.map((t) => `<span class="chip">${t}</span>`).join("")}</div>
        </div>
      </div>
    </div>`;
}

function renderPhases() {
  const phases = [1, 2, 3, 4, 5, 6].map((p) => {
    const ms = movies.filter((m) => m.phase === p);
    return { name: `Phase ${p}`, average: avg(ms.map((m) => m.rating)), count: ms.length };
  });
  const franchises = FRANCHISES.map((f) => ({ ...f, average: avg(f.ratings) }))
    .sort((a, b) => b.average - a.average);
  $("#view").innerHTML = `
    <div class="grid-2">
      <div class="panel"><h2>Phase averages <span class="note">movies only</span></h2>
        ${phases.map((p) => meterRow({ rank: "", title: p.name, rating: fmt(p.average), tag: `${p.count} films` })).join("")}
      </div>
      <div class="panel"><h2>Franchise averages</h2>
        ${franchises.map((f) => meterRow({ rank: "", title: f.name, rating: fmt(f.average), tag: f.ratings.join(" · ") })).join("")}
      </div>
    </div>`;
}

const views = { rankings: renderRankings, phases: renderPhases };

document.querySelector("nav.tabs").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-view]");
  if (!btn) return;
  document.querySelectorAll("nav.tabs button").forEach((b) => b.classList.toggle("active", b === btn));
  views[btn.dataset.view]();
});

$("#hero-bg").innerHTML = movies
  .map((m) => COVERS[m.title])
  .filter(Boolean)
  .map((src) => `<img src="${src}" alt="" loading="lazy">`)
  .join("");

renderRankings();
