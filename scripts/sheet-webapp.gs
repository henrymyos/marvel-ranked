// Marvel Ranked — Google Apps Script web app that lets the site read and
// write rankings in the sheet, so edits sync across devices.
//
// ONE-TIME SETUP
//   1. Open the Marvel Ranked sheet, then Extensions > Apps Script.
//   2. Replace the default Code.gs contents with this file.
//   3. Change TOKEN below to any random string.
//   4. Deploy > New deployment > type "Web app":
//        Execute as: Me
//        Who has access: Anyone
//      Authorize it, then copy the URL ending in /exec.
//   5. In the site's sync.js, set url to that /exec URL and token to TOKEN.
//
// The app only touches ratings (column B) and the two Overall rank
// columns (H and K). Release order, phases, franchises, and upcoming rows
// are left alone. The sheet's revision history covers any mishap.

const TOKEN = "change-me";

function sheet_() { return SpreadsheetApp.getActive().getSheets()[0]; }

// Columns move as the sheet evolves, so locate them by content on each call:
// the two "Overall" headers mark the rank columns and "Phase 1" marks the
// averages block. Column A is the master release list; ratings live in B.
function cols_(sh) {
  var last = sh.getLastColumn();
  var header = sh.getRange(1, 1, 1, last).getValues()[0].map(function (v) { return String(v).trim(); });
  var overall = [];
  for (var c = 0; c < last; c++) if (header[c] === "Overall") overall.push(c + 1);
  var H = overall[0], K = overall[1];
  var D = -1;
  for (var c3 = 1; c3 <= last && D === -1; c3++) {
    if (colValues_(sh, c3).some(function (x) { return x.value === "Phase 1"; })) D = c3;
  }
  return { A: 1, B: 2, D: D, E: D + 1, F: D + 2, H: H, K: K };
}

function colValues_(sh, col) {
  return sh.getRange(1, col, sh.getLastRow(), 1).getValues()
    .map(function (r, i) { return { row: i + 1, value: String(r[0]).trim() }; })
    .filter(function (c) { return c.value !== ""; });
}

// GET -> current rankings as JSON: { movies: [{t, r}...] best-to-worst,
// shows: [{t, r}...], unwatched: [titles] }.
function doGet(e) {
  if (((e && e.parameter.token) || "") !== TOKEN) return json_({ ok: false, error: "bad token" });
  const sh = sheet_();
  const COLS = cols_(sh);
  const bVals = sh.getRange(1, COLS.B, sh.getLastRow(), 1).getValues();
  const overall = {};
  colValues_(sh, COLS.A).forEach(function (c) {
    const v = String(bVals[c.row - 1][0]).trim();
    if (v !== "") overall[c.value] = Number(v);
  });
  const movieRank = colValues_(sh, COLS.H).map(function (c) { return c.value; })
    .filter(function (v) { return v !== "Overall"; });
  const showRank = colValues_(sh, COLS.K).map(function (c) { return c.value; })
    .filter(function (v) { return v !== "Overall"; });
  // Unwatched shows: unrated, unranked rows in A at or above the last rated
  // row (below it sit announced titles and the legacy block).
  const ranked = {};
  movieRank.concat(showRank).forEach(function (t) { ranked[t] = true; });
  const aVals = colValues_(sh, COLS.A);
  var lastRatedRow = 0;
  aVals.forEach(function (c) { if (overall[c.value] != null) lastRatedRow = Math.max(lastRatedRow, c.row); });
  const unwatched = [];
  const seenUn = {};
  aVals.forEach(function (c) {
    if (c.row <= lastRatedRow && overall[c.value] == null && !ranked[c.value] && !seenUn[c.value]) {
      seenUn[c.value] = true;
      unwatched.push(c.value);
    }
  });
  var guesses = {};
  try { guesses = JSON.parse(PropertiesService.getScriptProperties().getProperty("guesses") || "{}"); } catch (err) {}
  return json_({
    ok: true,
    movies: movieRank.map(function (t) { return { t: t, r: overall[t] != null ? overall[t] : null }; }),
    shows: showRank.map(function (t) { return { t: t, r: overall[t] != null ? overall[t] : null }; }),
    unwatched: unwatched,
    guesses: guesses,
  });
}

// POST { token, movies: [{t, r}...] best-to-worst, shows: [...], unwatched: [...] }
// -> writes ratings into B and P, rewrites the Overall columns, and clears
// ratings for shows moved back to unwatched.
function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: "bad json" }); }
  if ((body.token || "") !== TOKEN) return json_({ ok: false, error: "bad token" });
  const sh = sheet_();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const COLS = cols_(sh);
    const aRow = {};
    colValues_(sh, COLS.A).forEach(function (c) { if (!aRow[c.value]) aRow[c.value] = c.row; });
    // Only touch ratings and rank columns when the payload actually carries
    // them — a partial save must never clear the Overall lists.
    if (Array.isArray(body.movies) && body.movies.length) {
      body.movies.forEach(function (m) {
        if (aRow[m.t]) sh.getRange(aRow[m.t], COLS.B).setValue(m.r);
      });
      writeRank_(sh, COLS.H, body.movies);
    }
    if (Array.isArray(body.shows) && body.shows.length) {
      body.shows.forEach(function (s) {
        if (aRow[s.t]) sh.getRange(aRow[s.t], COLS.B).setValue(s.r);
      });
      writeRank_(sh, COLS.K, body.shows);
    }
    (body.unwatched || []).forEach(function (t) {
      if (aRow[t]) sh.getRange(aRow[t], COLS.B).clearContent();
    });
    if (body.guesses && typeof body.guesses === "object") {
      PropertiesService.getScriptProperties().setProperty("guesses", JSON.stringify(body.guesses));
    }
    // Keep the per-phase and per-franchise rating lists (E) and averages (F)
    // in step. The site computes both, since phases and franchise membership
    // only exist in data.js.
    var dRows = {};
    colValues_(sh, COLS.D).forEach(function (c) { if (!dRows[c.value]) dRows[c.value] = c.row; });
    (body.phases || []).concat(body.franchises || []).forEach(function (entry) {
      var row = dRows[entry.label];
      if (row) {
        // Plain-text format first: otherwise Sheets parses lists like
        // "8, 3, 4" as month/day/year and stores a date.
        sh.getRange(row, COLS.E).setNumberFormat("@").setValue(String(entry.list));
        sh.getRange(row, COLS.F).setNumberFormat("0.##").setValue(Number(entry.avg));
      }
    });
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true });
}

// The sheet color-codes ranked titles by rating; these are its exact fills
// (rating 0 is white-on-black). Painted together with the values so colors
// can never drift from the numbers when rows shift.
var RATING_FILLS = {
  "10": "#ff00ff", "9": "#b4a7d6", "8": "#9fc5e8", "7": "#4a86e8",
  "6": "#00ffff", "5": "#00ff00", "4": "#ffff00", "3": "#ff9900",
  "2": "#ff0000", "1": "#cc4125", "0": "#000000",
};

// Writes the ranked titles AND their ratings into the adjacent "Rating"
// column, plus the rating colors, so the trio can never drift when rows
// are inserted by hand.
function writeRank_(sh, col, entries) {
  const header = colValues_(sh, col).filter(function (c) { return c.value === "Overall"; })[0];
  const first = header ? header.row + 1 : 2;
  const clearRows = Math.max(sh.getLastRow() - first + 1, entries.length);
  if (clearRows > 0) {
    sh.getRange(first, col, clearRows, 2).clearContent();
    sh.getRange(first, col, clearRows, 1).setBackground(null).setFontColor(null);
  }
  if (entries.length) {
    sh.getRange(first, col, entries.length, 2)
      .setValues(entries.map(function (e) { return [e.t, e.r]; }));
    sh.getRange(first, col, entries.length, 1)
      .setBackgrounds(entries.map(function (e) { return [RATING_FILLS[String(e.r)] || null]; }))
      .setFontColors(entries.map(function (e) { return [e.r === 0 ? "#ffffff" : null]; }));
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
