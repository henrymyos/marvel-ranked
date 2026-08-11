// Cross-device sync through the Google Sheet, one copy per signed-in
// username (the "Henry" account is the sheet itself; the rest live in its
// Users tab). The web app (scripts/sheet-webapp.gs) is deployed from the
// sheet's Apps Script editor; this is its /exec URL and shared token.
// Clear url to make the whole site browser-local, accounts included.
const SYNC = {
  url: "https://script.google.com/macros/s/AKfycbxuCLdv2UfBFzxyoG4d_dnk7q0vlyJ5r9560dg0JA969BPxXFz-2wVFgIe554b1GrJ0/exec",
  token: "marvel",
};
