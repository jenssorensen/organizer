/// <reference path="./node-test-shims.d.ts" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("starred section renders starred bookmarks alongside starred notes", async () => {
  const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

  assert.match(appSource, /const starredBookmarks = useMemo\(\(\) => bookmarks\.filter\(\(item\) => item\.starred\), \[bookmarks\]\);/);
  assert.match(appSource, /count: starredNotes\.length \+ starredBookmarks\.length,/);
  assert.match(appSource, /starredBookmarks\.map\(\(bookmark\) => \(/);
});
