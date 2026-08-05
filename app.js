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
            <h2 class="subheading">Haven't seen <span class="note">${UNWATCHED_SHOWS.length} shows</span></h2>
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

function renderStats() {
  const all = [...movies, ...shows];
  const groupStats = (items, key) => [...new Set(items.map((i) => i[key]))].map((k) => {
    const xs = items.filter((i) => i[key] === k);
    return { key: k, average: avg(xs.map((i) => i.rating)), count: xs.length };
  }).sort((a, b) => b.average - a.average);

  const byPhase = groupStats(all, "phase");
  const byYear = groupStats(all, "year");
  const movieAvg = avg(movies.map((m) => m.rating));
  const showAvg = avg(shows.map((s) => s.rating));
  const bestPhase = byPhase[0], worstPhase = byPhase[byPhase.length - 1];
  const bestYear = byYear[0], worstYear = byYear[byYear.length - 1];
  const tiles = [
    { label: "Movie average", value: fmt(movieAvg), dotRating: movieAvg, sub: `${movies.length} films` },
    { label: "Show average", value: fmt(showAvg), dotRating: showAvg, sub: `${shows.length} shows` },
    { label: "Best phase", value: `Phase ${bestPhase.key}`, dotRating: bestPhase.average, sub: `${fmt(bestPhase.average)} average` },
    { label: "Worst phase", value: `Phase ${worstPhase.key}`, dotRating: worstPhase.average, sub: `${fmt(worstPhase.average)} average` },
    { label: "Best year", value: bestYear.key, dotRating: bestYear.average, sub: `${fmt(bestYear.average)} average` },
    { label: "Worst year", value: worstYear.key, dotRating: worstYear.average, sub: `${fmt(worstYear.average)} average` },
  ];

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
  const yearItems = filterSets[statsFilter.year]();
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

function renderPhases() {
  const franchises = FRANCHISES.map((f) => ({ ...f, average: avg(f.ratings) }))
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
    name: "Rotten Tomatoes", col: "RT", who: "Critics",
    heading: "Me vs the critics",
    xLabel: "Tomatometer ÷ 10",
    score: (m) => RT[m.title] ? RT[m.title].critics / 10 : undefined,
    display: (m) => `${RT[m.title].critics}%`,
    rowTip: (m) => `${m.title} — me ${m.rating}, Tomatometer ${RT[m.title].critics}%, audience ${RT[m.title].audience}%`,
    fineprint: () => `Rotten Tomatoes Tomatometer snapshot ${RT_SNAPSHOT} — refresh with <code>scripts/fetch-rt.mjs</code>.
      Movies only; &Delta; compares my rating with the Tomatometer &divide; 10.`,
  },
};

const vsSortState = { imdb: "theirs", rt: "theirs" };

function renderVsSource(id) {
  const cfg = VS_SOURCES[id];
  const rated = movies.filter((m) => cfg.score(m) != null);
  const pairs = rated.map((m) => ({ m, title: m.title, mine: m.rating, theirs: cfg.score(m) }));
  const mine = pairs.map((p) => p.mine), theirs = pairs.map((p) => p.theirs);
  const r = pearson(mine, theirs);
  const rho = pearson(toRanks(mine), toRanks(theirs));
  const gap = avg(theirs) - avg(mine);
  const tiles = [
    { label: "Correlation", value: r.toFixed(2), sub: `Pearson r · ${pairs.length} movies` },
    { label: "Rank agreement", value: rho.toFixed(2), sub: "Spearman ρ" },
    { label: "Tougher grader", value: `−${fmt(gap)}`, sub: `my avg ${fmt(avg(mine))} vs ${cfg.col} ${fmt(avg(theirs))}` },
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
}

const views = {
  rankings: renderRankings, phases: renderPhases,
  imdb: () => renderVsSource("imdb"), rt: () => renderVsSource("rt"),
};

document.querySelector("nav.tabs").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-view]");
  if (!btn) return;
  document.querySelectorAll("nav.tabs button").forEach((b) => b.classList.toggle("active", b === btn));
  views[btn.dataset.view]();
});

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
(function balanceCheck() {
  const issues = [["Movies", movies], ["Shows", shows]].flatMap(([label, xs]) => {
    const sum = xs.reduce((a, x) => a + x.rating, 0);
    const diff = sum - xs.length * 5;
    if (diff === 0) return [];
    return [`${label} average ${fmt(sum / xs.length)} — ${Math.abs(diff)} point${Math.abs(diff) === 1 ? "" : "s"} ${diff > 0 ? "over" : "under"}`];
  });
  if (!issues.length) return;
  const el = document.createElement("div");
  el.className = "balance-alert";
  el.innerHTML = `<strong>⚠ Averages off the 5.0 target</strong> ${issues.join(" · ")}`;
  document.querySelector("nav.tabs").after(el);
})();

$("#hero-bg").innerHTML = movies
  .map((m) => COVERS[m.title])
  .filter(Boolean)
  .map((src) => `<img src="${src}" alt="" loading="lazy">`)
  .join("");

renderRankings();
