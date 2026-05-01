/// <reference path="./node-test-shims.d.ts" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("bookmark menu leaf click closes menus and opens the bookmark in a new tab", async () => {
  const bookmarkComponentsSource = await readFile(new URL("../src/components/BookmarkComponents.tsx", import.meta.url), "utf8");
  const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

  assert.match(
    bookmarkComponentsSource,
    /onClick=\{\(\) => \{\s*onSelect\(node\.id\);\s*onCloseMenus\(\);\s*window\.open\(node\.url, "_blank", "noopener,noreferrer"\);\s*\}\}\s*title=\{node\.url\}/s,
  );
  assert.match(bookmarkComponentsSource, /<ExternalLink size=\{14\} className="menu-bookmark__chevron" \/>/);
  assert.match(bookmarkComponentsSource, /className=\{`icon-action menu-bookmark__star \$\{node\.starred \? "is-active" : ""\}`\}/);
  assert.match(bookmarkComponentsSource, /const menuNodes = normalizeBookmarkMenuRoots\(nodes\);/);
  assert.match(bookmarkComponentsSource, /function normalizeBookmarkMenuRoots\(nodes: BookmarkNode\[\]\)/);
  assert.match(bookmarkComponentsSource, /const orderedChildren = topLevel \? node\.children : orderSubmenuNodes\(node\.children\);/);
  assert.match(bookmarkComponentsSource, /function orderSubmenuNodes\(nodes: BookmarkNode\[\]\)/);
  assert.match(appSource, /const clickedWithinMenuBar = Boolean\(menuBarRef\.current\?\.contains\(target\)\);/);
  assert.match(appSource, /const clickedWithinOpenMenu =\s*Boolean\(target\?\.closest\("\.menu-flyout"\)\) \|\| Boolean\(target\?\.closest\("\.menu-folder__title\.is-top"\)\);/s);
  assert.match(appSource, /function handleMenuEscape\(event: KeyboardEvent\)\s*\{\s*if \(event\.key === "Escape"\) \{\s*setOpenMenuPath\(\[\]\);/s);
  assert.match(bookmarkComponentsSource, /\{topLevel \? null : \(\s*<div className="menu-bookmark__body">/s);
  assert.match(bookmarkComponentsSource, /\{topLevel \? null : \(\s*<div className="menu-bookmark__actions">/s);
});
