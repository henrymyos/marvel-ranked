// Marvel Ranked — Google Apps Script web app that lets the site read and
// write rankings, with username-only accounts.
//
// The owner account ("Henry") reads and writes the formatted sheet itself,
// exactly as before — the sheet IS that account's data. Every other
// username gets a row in a "Users" tab (created on first save) holding its
// rankings and guesses as JSON. No passwords: knowing a username is
// logging in, by design.
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
// UPDATING AN EXISTING DEPLOYMENT (keeps the same /exec URL)
//   Paste the new code, keep TOKEN as it was, then:
//   Deploy > Manage deployments > edit (pencil) > Version: New version > Deploy.
//
// For the owner account the app only touches ratings (column B) and the
// two Overall rank columns (H and K). Release order, phases, franchises,
// and upcoming rows are left alone. The sheet's revision history covers
// any mishap.

const TOKEN = "change-me";

// The account whose data lives in the formatted sheet itself.
const OWNER_KEY = "henry";
const OWNER_NAME = "Henry";

function norm_(u) { return String(u == null ? "" : u).trim(); }
function userKey_(u) { return norm_(u).toLowerCase(); }
// 1-24 chars: letters, digits, spaces, underscores, dashes. Doubles as an
// HTML-injection guard for the site, which renders the name verbatim.
function validUser_(u) { return /^[A-Za-z0-9][A-Za-z0-9 _-]{0,23}$/.test(u); }

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

// The "Users" tab: one row per non-owner account.
// Columns: key (lowercased) | name (as typed) | pack JSON | guesses JSON | updated.
function usersSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName("Users");
  if (!sh) {
    sh = ss.insertSheet("Users");
    sh.getRange(1, 1, 1, 5).setValues([["key", "name", "pack", "guesses", "updated"]]);
  }
  return sh;
}

function findUser_(key) {
  var sh = usersSheet_();
  var last = sh.getLastRow();
  if (last < 2) return null;
  var vals = sh.getRange(2, 1, last - 1, 4).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === key) return { row: i + 2, name: String(vals[i][1]), pack: String(vals[i][2]), guesses: String(vals[i][3]) };
  }
  return null;
}

// GET ?token&user -> that account's rankings as JSON: { movies: [{t, r}...]
// best-to-worst, shows: [{t, r}...], unwatched: [titles], guesses: {} }.
// An unknown username answers fresh: true so the site can seed it.
function doGet(e) {
  if (((e && e.parameter.token) || "") !== TOKEN) return json_({ ok: false, error: "bad token" });
  var user = norm_((e && e.parameter.user) || OWNER_NAME);
  if (!validUser_(user)) return json_({ ok: false, error: "bad username" });
  if (userKey_(user) === OWNER_KEY) return json_(ownerGet_());
  var found = findUser_(userKey_(user));
  if (!found) return json_({ ok: true, v: 2, user: user, fresh: true, movies: [], shows: [], unwatched: [], guesses: {} });
  var pack = {};
  try { pack = JSON.parse(found.pack || "{}"); } catch (err) {}
  var guesses = {};
  try { guesses = JSON.parse(found.guesses || "{}"); } catch (err) {}
  return json_({
    ok: true,
    v: 2,
    user: found.name || user,
    movies: pack.movies || [],
    shows: pack.shows || [],
    unwatched: pack.unwatched || [],
    guesses: guesses,
  });
}

function ownerGet_() {
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
  return {
    ok: true,
    v: 2,
    user: OWNER_NAME,
    movies: movieRank.map(function (t) { return { t: t, r: overall[t] != null ? overall[t] : null }; }),
    shows: showRank.map(function (t) { return { t: t, r: overall[t] != null ? overall[t] : null }; }),
    unwatched: unwatched,
    guesses: guesses,
  };
}

// POST { token, user, movies: [{t, r}...] best-to-worst, shows: [...],
// unwatched: [...], guesses: {} } -> saves to that account. Absent fields
// are left untouched, so a guess-only save never clears rankings.
function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: "bad json" }); }
  if ((body.token || "") !== TOKEN) return json_({ ok: false, error: "bad token" });
  var user = norm_(body.user || OWNER_NAME);
  if (!validUser_(user)) return json_({ ok: false, error: "bad username" });
  if (userKey_(user) === OWNER_KEY) return json_(ownerPost_(body));
  return json_(memberPost_(user, body));
}

function memberPost_(user, body) {
  var sh = usersSheet_();
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var key = userKey_(user);
    var found = findUser_(key);
    var row = found ? found.row : sh.getLastRow() + 1;
    var pack = {};
    if (found) { try { pack = JSON.parse(found.pack || "{}"); } catch (err) {} }
    if (Array.isArray(body.movies) && body.movies.length) pack.movies = body.movies;
    if (Array.isArray(body.shows) && body.shows.length) pack.shows = body.shows;
    if (Array.isArray(body.unwatched)) pack.unwatched = body.unwatched;
    var guesses = found ? (found.guesses || "{}") : "{}";
    if (body.guesses && typeof body.guesses === "object") guesses = JSON.stringify(body.guesses);
    // Plain-text format: Sheets must never try to parse the JSON blobs.
    sh.getRange(row, 1, 1, 5).setNumberFormat("@")
      .setValues([[key, user, JSON.stringify(pack), guesses, new Date().toISOString()]]);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, v: 2, user: user };
}

// The owner's save writes ratings into B, rewrites the Overall columns, and
// clears ratings for shows moved back to unwatched.
function ownerPost_(body) {
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
  return { ok: true, v: 2, user: OWNER_NAME };
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
