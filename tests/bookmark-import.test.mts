/// <reference path="./node-test-shims.d.ts" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("bookmark import uses extracted Netscape parser and replace-style status messaging", async () => {
  const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

  assert.match(appSource, /import \{ parseNetscapeBookmarkHtml \} from "\.\/netscapeBookmarks"/);
  assert.match(appSource, /Imported \$\{result\.imported\} favorite/);
  assert.match(appSource, /replaced bookmarks/);
  assert.doesNotMatch(appSource, /duplicatesFiltered/);
});
