/// <reference path="./node-test-shims.d.ts" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("recent and starred note lists use the shared recent-entry layout and search panel caps at 50", async () => {
  const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const stylesSource = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(appSource, /const visibleSearchEntries = useMemo\(\(\) => filteredEntries\.slice\(0, 50\), \[filteredEntries\]\);/);
  assert.match(appSource, /<NoteListCard/);
  assert.match(appSource, /<RecentDocumentCard/);
  assert.match(appSource, /className="recent-entry__meta-primary"/);
  assert.match(appSource, /<span className="category-badge is-bookmark">bookmark<\/span>/);
  assert.match(appSource, /<span className="recent-entry__filename">\{bookmark\.title\}<\/span>/);
  assert.doesNotMatch(appSource, /note-breadcrumbs note-breadcrumbs--header/);
  assert.match(stylesSource, /\.search-card \.search-groups \{/);
  assert.match(stylesSource, /\.recent-entry__meta-primary \{/);
  assert.match(stylesSource, /\.recent-entry__filename \{/);
  assert.match(stylesSource, /\.recent-entry__title \{/);
});
