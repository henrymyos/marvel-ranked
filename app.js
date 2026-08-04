const $ = (sel) => document.querySelector(sel);

const movieRank = new Map(MOVIE_RANK_ORDER.map((t, i) => [t, i + 1]));
const showRank = new Map(SHOW_RANK_ORDER.map((t, i) => [t, i + 1]));

const movies = MOVIES.map((m, i) => ({ ...m, type: "movie", release: i + 1, rank: movieRank.get(m.title) }));
const shows = SHOWS.map((s, i) => ({ ...s, type: "show", release: i + 1, rank: showRank.get(s.title) }));

const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const fmt = (n) => (Math.round(n * 100) / 100).toFixed(2).replace(/0$/, "").replace(/\.0$/, "");

// One distinct color per rating value — a multi-hue scale rather than a
// plain red→green gradient: dark red at the bottom, through orange and
// yellow, into greens, with teal at 9 and blue reserved for perfect 10s.
// Fills are the same in both themes; ink is chosen per step for contrast.
const RATING_COLORS = [
  { bg: "#7f1d1d", ink: "#ffffff" }, // 0  dark red
  { bg: "#c62f2f", ink: "#ffffff" }, // 1  red
  { bg: "#e2574b", ink: "#ffffff" }, // 2  red-orange
  { bg: "#ef8146", ink: "#1a1a19" }, // 3  orange
  { bg: "#f5a94f", ink: "#1a1a19" }, // 4  amber
  { bg: "#f9cb5f", ink: "#1a1a19" }, // 5  yellow
  { bg: "#c9c353", ink: "#1a1a19" }, // 6  yellow-green
  { bg: "#8fba55", ink: "#1a1a19" }, // 7  light green
  { bg: "#3f9e4d", ink: "#ffffff" }, // 8  green
  { bg: "#1b9e89", ink: "#ffffff" }, // 9  teal
  { bg: "#2a78d6", ink: "#ffffff" }, // 10 blue
];

function ratingColor(rating) {
  return RATING_COLORS[Math.max(0, Math.min(10, Math.round(Number(rating))))];
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

const TIER_LEGEND = `<div class="legend scale">
  ${RATING_COLORS.map((c, i) =>
    `<span class="step" style="background:${c.bg};color:${c.ink}">${i}</span>`).join("")}
</div>`;

let sortMode = "rank";

function sorted(list) {
  const copy = [...list];
  if (sortMode === "rank") return copy.sort((a, b) => a.rank - b.rank);
  if (sortMode === "release") return copy.sort((a, b) => a.release - b.release);
  return copy.sort((a, b) => a.title.localeCompare(b.title));
}

function renderRankings() {
  const rankOf = (item, i) => (sortMode === "rank" ? item.rank : item.rank ?? "–");
  $("#view").innerHTML = `
    <div class="controls">
      <div class="seg" id="sort-seg">
        <button data-sort="rank" class="${sortMode === "rank" ? "active" : ""}">Best first</button>
        <button data-sort="release" class="${sortMode === "release" ? "active" : ""}">Release order</button>
        <button data-sort="alpha" class="${sortMode === "alpha" ? "active" : ""}">A–Z</button>
      </div>
      ${TIER_LEGEND}
    </div>
    <div class="grid-2">
      <div class="panel"><h2>Movies <span class="note">${movies.length} ranked</span></h2>
        ${sorted(movies).map((m) => meterRow({ ...m, rank: rankOf(m) })).join("")}
      </div>
      <div class="panel"><h2>Shows <span class="note">${shows.length} ranked</span></h2>
        ${sorted(shows).map((s) => meterRow({ ...s, rank: rankOf(s) })).join("")}
      </div>
    </div>`;
  $("#sort-seg").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-sort]");
    if (!btn) return;
    sortMode = btn.dataset.sort;
    renderRankings();
  });
}

function renderPhases() {
  const phases = [1, 2, 3, 4, 5, 6].map((p) => {
    const ms = movies.filter((m) => m.phase === p);
    return { name: `Phase ${p}`, average: avg(ms.map((m) => m.rating)), count: ms.length };
  });
  const franchises = FRANCHISES.map((f) => ({ ...f, average: avg(f.ratings) }))
    .sort((a, b) => b.average - a.average);
  $("#view").innerHTML = `
    <div class="controls">${TIER_LEGEND}</div>
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

$("#theme-toggle").addEventListener("click", () => {
  const root = document.documentElement;
  const dark = root.dataset.theme === "dark" ||
    (!root.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
  root.dataset.theme = dark ? "light" : "dark";
});

renderRankings();
