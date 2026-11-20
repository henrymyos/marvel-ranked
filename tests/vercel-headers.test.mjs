// The scripts (data.js above all) and stylesheet load from fixed, unversioned
// URLs, so any browser max-age on them means a plain refresh after a deploy
// keeps running the old data: VisionQuest stayed in "Coming up" for anyone
// who had visited within the hour (2026-11-20). They must revalidate on every
// load; Vercel's default (max-age=0, must-revalidate) does that.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const root = new URL("../", import.meta.url);
const { headers = [] } = JSON.parse(readFileSync(new URL("vercel.json", root), "utf8"));
const unversioned = readdirSync(root).filter((f) => /\.(js|css)$/.test(f)).map((f) => `/${f}`);

test("scripts and stylesheet are never browser-cached without revalidating", () => {
  assert.ok(unversioned.includes("/data.js") && unversioned.includes("/app.js"));
  for (const path of unversioned) {
    for (const rule of headers) {
      if (!new RegExp(`^${rule.source}$`).test(path)) continue;
      for (const { key, value } of rule.headers) {
        if (key.toLowerCase() !== "cache-control") continue;
        const maxAge = Number(/max-age=(\d+)/.exec(value)?.[1] ?? 0);
        assert.ok(maxAge === 0 && !/stale-while-revalidate|immutable/.test(value),
          `${path} gets "${value}" from ${rule.source}`);
      }
    }
  }
});
