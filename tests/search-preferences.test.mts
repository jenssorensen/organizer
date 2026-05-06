/// <reference path="./node-test-shims.d.ts" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("search preferences wire topbar and overlay search modes through app state", async () => {
  const appTypesSource = await readFile(new URL("../src/appTypes.ts", import.meta.url), "utf8");
  const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const dialogsSource = await readFile(new URL("../src/components/Dialogs.tsx", import.meta.url), "utf8");

  assert.match(appTypesSource, /showCollapsedSearchCard: boolean;/);
  assert.match(appTypesSource, /searchInterface: "topbar" \| "palette";/);
  assert.match(appTypesSource, /supportedNoteFileTypes: SupportedNoteFileType\[\];/);
  assert.match(appTypesSource, /allowIframeScripts: boolean;/);
  assert.match(appSource, /showCollapsedSearchCard: parsed\.showCollapsedSearchCard !== false,/);
  assert.match(appSource, /searchInterface: parsed\.searchInterface === "palette" \? "palette" : "topbar",/);
  assert.match(appSource, /supportedNoteFileTypes: sanitizeSupportedNoteFileTypes\(parsed\.supportedNoteFileTypes\),/);
  assert.match(appSource, /allowIframeScripts: parsed\.allowIframeScripts === true,/);
  assert.match(appSource, /return \{[\s\S]*showCollapsedSearchCard: true,[\s\S]*searchInterface: "topbar",[\s\S]*supportedNoteFileTypes: \[\.\.\.DEFAULT_SUPPORTED_NOTE_FILE_TYPES\],[\s\S]*allowIframeScripts: false,[\s\S]*\};/);
  assert.match(appSource, /const \[isSearchDialogOpen, setIsSearchDialogOpen\] = useState\(false\);/);
  assert.match(appSource, /if \(isMod && \(event\.key === "f" \|\| event\.key === "F"\) && !showCollapsedSearchCard\) \{/);
  assert.match(appSource, /function openSearchSurface\(\) \{/);
  assert.match(appSource, /if \(prefs\.searchInterface === "palette"\) \{/);
  assert.match(appSource, /const searchShortcutTitle = platform === "mac"[\s\S]*"Search \(⌘F\)"[\s\S]*"Search \(Ctrl\+F\)";/);
  assert.match(appSource, /\{usesSearchPalette \? \([\s\S]*title=\{searchShortcutTitle\}[\s\S]*<span>Search<\/span>[\s\S]*\) : null\}/);
  assert.match(appSource, /const showCollapsedSearchCard =[\s\S]*!isMarkdownImmersive &&[\s\S]*immersiveChromeState\.showCollapsedSearchCard &&[\s\S]*prefs\.showCollapsedSearchCard;/);
  assert.doesNotMatch(appSource, /const showCollapsedSearchCard =[\s\S]*!usesSearchPalette/);
  assert.match(appSource, /\{showTopbarSearch \? \(/);
  assert.match(appSource, /<main className="main-area">[\s\S]*\{showTopbarSearch \? \([\s\S]*<header className=\{`topbar/);
  assert.match(appSource, /\{usesSearchPalette && isSearchDialogOpen \? \(/);
  assert.match(dialogsSource, /Search entry point/);
  assert.match(dialogsSource, /Show “Open search panel” column/);
});