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
// The app only touches ratings (columns B and P) and the two Overall rank
// columns (H and K). Release order, phases, franchises, and upcoming rows
// are left alone. The sheet's revision history covers any mishap.

const TOKEN = "change-me";

function sheet_() { return SpreadsheetApp.getActive().getSheets()[0]; }

// Columns move as the sheet evolves, so locate them by content on each call:
// the two "Overall" headers mark the rank columns, the shows release column
// is the one dominated by show titles, and "Phase 1" marks the averages.
function cols_(sh) {
  var last = sh.getLastColumn();
  var header = sh.getRange(1, 1, 1, last).getValues()[0].map(function (v) { return String(v).trim(); });
  var overall = [];
  for (var c = 0; c < last; c++) if (header[c] === "Overall") overall.push(c + 1);
  var H = overall[0], K = overall[1];
  var kSet = {};
  colValues_(sh, K).forEach(function (x) { if (x.value !== "Overall") kSet[x.value] = true; });
  var kCount = Object.keys(kSet).length;
  var O = -1, bestHits = 0;
  for (var c2 = 1; c2 <= last; c2++) {
    if (c2 === 1 || c2 === H || c2 === K) continue;
    var vals = colValues_(sh, c2);
    if (!vals.length) continue;
    var hits = vals.filter(function (x) { return kSet[x.value]; }).length;
    if (hits >= kCount / 2 && hits / vals.length >= 0.5 && hits > bestHits) { bestHits = hits; O = c2; }
  }
  var D = -1;
  for (var c3 = 1; c3 <= last && D === -1; c3++) {
    if (colValues_(sh, c3).some(function (x) { return x.value === "Phase 1"; })) D = c3;
  }
  return { A: 1, B: 2, D: D, E: D + 1, F: D + 2, H: H, K: K, O: O, P: O + 1 };
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
  const pVals = sh.getRange(1, COLS.P, sh.getLastRow(), 1).getValues();
  const showRating = {};
  const unwatched = [];
  colValues_(sh, COLS.O).forEach(function (c) {
    const v = String(pVals[c.row - 1][0]).trim();
    if (v !== "") showRating[c.value] = Number(v);
    else unwatched.push(c.value);
  });
  const movieRank = colValues_(sh, COLS.H).map(function (c) { return c.value; })
    .filter(function (v) { return v !== "Overall"; });
  const showRank = colValues_(sh, COLS.K).map(function (c) { return c.value; })
    .filter(function (v) { return v !== "Overall"; });
  var guesses = {};
  try { guesses = JSON.parse(PropertiesService.getScriptProperties().getProperty("guesses") || "{}"); } catch (err) {}
  return json_({
    ok: true,
    movies: movieRank.map(function (t) { return { t: t, r: overall[t] != null ? overall[t] : null }; }),
    shows: showRank.map(function (t) {
      return { t: t, r: showRating[t] != null ? showRating[t] : (overall[t] != null ? overall[t] : null) };
    }),
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
    const aRow = {}, oRow = {};
    colValues_(sh, COLS.A).forEach(function (c) { aRow[c.value] = c.row; });
    colValues_(sh, COLS.O).forEach(function (c) { oRow[c.value] = c.row; });
    // Only touch ratings and rank columns when the payload actually carries
    // them — a partial save must never clear the Overall lists.
    if (Array.isArray(body.movies) && body.movies.length) {
      body.movies.forEach(function (m) {
        if (aRow[m.t]) sh.getRange(aRow[m.t], COLS.B).setValue(m.r);
      });
      writeRank_(sh, COLS.H, body.movies.map(function (m) { return m.t; }));
    }
    if (Array.isArray(body.shows) && body.shows.length) {
      body.shows.forEach(function (s) {
        if (oRow[s.t]) sh.getRange(oRow[s.t], COLS.P).setValue(s.r);
        if (aRow[s.t]) sh.getRange(aRow[s.t], COLS.B).setValue(s.r);
      });
      writeRank_(sh, COLS.K, body.shows.map(function (s) { return s.t; }));
    }
    (body.unwatched || []).forEach(function (t) {
      if (oRow[t]) sh.getRange(oRow[t], COLS.P).clearContent();
      if (aRow[t]) sh.getRange(aRow[t], COLS.B).clearContent();
    });
    if (body.guesses && typeof body.guesses === "object") {
      PropertiesService.getScriptProperties().setProperty("guesses", JSON.stringify(body.guesses));
    }
    // Keep the per-phase movie rating list (E) and average (F) in step. The
    // site computes them, since phases only exist in data.js.
    (body.phases || []).forEach(function (ph) {
      var row = colValues_(sh, COLS.D).filter(function (c) { return c.value === ph.label; })[0];
      if (row) {
        sh.getRange(row.row, COLS.E).setValue(String(ph.list));
        sh.getRange(row.row, COLS.F).setValue(Number(ph.avg));
      }
    });
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true });
}

function writeRank_(sh, col, titles) {
  const header = colValues_(sh, col).filter(function (c) { return c.value === "Overall"; })[0];
  const first = header ? header.row + 1 : 2;
  const clearRows = Math.max(sh.getLastRow() - first + 1, titles.length);
  if (clearRows > 0) sh.getRange(first, col, clearRows, 1).clearContent();
  if (titles.length) {
    sh.getRange(first, col, titles.length, 1)
      .setValues(titles.map(function (t) { return [t]; }));
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
