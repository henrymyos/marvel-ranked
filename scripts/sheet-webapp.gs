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

const COLS = { A: 1, B: 2, D: 4, E: 5, F: 6, H: 8, K: 11, O: 15, P: 16 };

function sheet_() { return SpreadsheetApp.getActive().getSheets()[0]; }

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
  return json_({
    ok: true,
    movies: movieRank.map(function (t) { return { t: t, r: overall[t] != null ? overall[t] : null }; }),
    shows: showRank.map(function (t) {
      return { t: t, r: showRating[t] != null ? showRating[t] : (overall[t] != null ? overall[t] : null) };
    }),
    unwatched: unwatched,
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
    const aRow = {}, oRow = {};
    colValues_(sh, COLS.A).forEach(function (c) { aRow[c.value] = c.row; });
    colValues_(sh, COLS.O).forEach(function (c) { oRow[c.value] = c.row; });
    (body.movies || []).forEach(function (m) {
      if (aRow[m.t]) sh.getRange(aRow[m.t], COLS.B).setValue(m.r);
    });
    (body.shows || []).forEach(function (s) {
      if (oRow[s.t]) sh.getRange(oRow[s.t], COLS.P).setValue(s.r);
      if (aRow[s.t]) sh.getRange(aRow[s.t], COLS.B).setValue(s.r);
    });
    (body.unwatched || []).forEach(function (t) {
      if (oRow[t]) sh.getRange(oRow[t], COLS.P).clearContent();
      if (aRow[t]) sh.getRange(aRow[t], COLS.B).clearContent();
    });
    writeRank_(sh, COLS.H, (body.movies || []).map(function (m) { return m.t; }));
    writeRank_(sh, COLS.K, (body.shows || []).map(function (s) { return s.t; }));
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
