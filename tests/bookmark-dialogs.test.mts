/// <reference path="./node-test-shims.d.ts" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("bookmark management uses dialog components instead of window prompts", async () => {
  const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const stylesheet = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.doesNotMatch(appSource, /window\.prompt/);
  assert.doesNotMatch(appSource, /window\.confirm/);
  assert.match(appSource, /BookmarkDialog/);
  assert.match(stylesheet, /\.dialog-backdrop/);
});
