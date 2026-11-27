# Marvel Ranked

Rank every Marvel movie and show. A static site (no build step): `index.html`, `styles.css`, `app.js` and plain data files, deployed on Vercel.

## Run locally

```sh
python3 -m http.server 8080    # then open http://localhost:8080
```

## Files

| File | What it holds |
|---|---|
| `data.js` | Every title with rating, phase and year (synced from the Google Sheet) |
| `releases.js` | Release dates for the Upcoming tab, kept by hand (official dates only, `null` = TBA) |
| `covers.js` | Title -> poster URL |
| `imdb.js`, `rt.js` | IMDb ratings and Rotten Tomatoes scores per movie |
| `characters.js` | Hero and villain rosters, portraits in `art/characters/` (96 px roster thumbs in `art/characters/96/`) |
| `sync.js` | Cross-device sync through the sheet's Apps Script web app; clear its `url` to make the site browser-local |
| `art/` | Local poster art for titles without a usable Wikipedia image |

## Refresh the data

Each script rewrites one data file; review the diff before committing.

```sh
node scripts/fetch-sheet.mjs                 # data.js from the Google Sheet
node scripts/fetch-sheet.mjs --from x.csv    # ...or from a downloaded CSV export
node scripts/fetch-covers.mjs                # covers.js
node scripts/fetch-imdb.mjs                  # imdb.js
node scripts/fetch-rt.mjs                    # rt.js
node scripts/fetch-characters.mjs            # characters.js + art/characters/
```

`scripts/sheet-webapp.gs` is the Apps Script behind `sync.js`, deployed from the sheet's Apps Script editor. Layout notes for the sheet are at the top of `scripts/fetch-sheet.mjs`.

## Tests

```sh
node --test    # checks data.js after a sheet sync, characters.js after fetch-characters
```

`scripts/`, `tests/` and this README are kept out of the deploy by `.vercelignore`.
