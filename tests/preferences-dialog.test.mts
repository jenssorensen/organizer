/// <reference path="./node-test-shims.d.ts" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("preferences dialog uses a fixed-height split layout with internal scrolling and is last in sidebar tools", async () => {
  const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const appTypesSource = await readFile(new URL("../src/appTypes.ts", import.meta.url), "utf8");
  const dialogsSource = await readFile(new URL("../src/components/Dialogs.tsx", import.meta.url), "utf8");
  const stylesSource = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  const shortcutsIndex = appSource.indexOf('<span>Shortcuts</span>');
  const preferencesIndex = appSource.indexOf('<span>Preferences</span>');
  assert.ok(shortcutsIndex >= 0 && preferencesIndex >= 0);
  assert.ok(shortcutsIndex < preferencesIndex);

  assert.match(dialogsSource, /className="prefs-content__body"/);
  assert.match(dialogsSource, /setActiveTab\("notes"\)/);
  assert.match(dialogsSource, /setActiveTab\("search"\)/);
  assert.match(dialogsSource, /activeTab === "general" \? "General" : activeTab === "notes" \? "Notes" : activeTab === "search" \? "Search" : "System"/);
  assert.match(dialogsSource, /Search entry point/);
  assert.match(dialogsSource, /Quick search overlay/);
  assert.match(dialogsSource, /Supported note file types/);
  assert.match(dialogsSource, /Allow scripts in preview iframe/);
  assert.match(dialogsSource, /allow-scripts/);
  assert.match(dialogsSource, /SUPPORTED_NOTE_FILE_TYPES\.map/);
  assert.match(appTypesSource, /SUPPORTED_NOTE_FILE_TYPES = \["\.md", "\.html", "\.mhtml", "\.txt"\]/);
  assert.match(dialogsSource, /Show “Open search panel” column/);
  assert.match(dialogsSource, /<Folder size=\{15\} \/>[\s\S]*Notes/);
  assert.match(dialogsSource, /<Search size=\{15\} \/>[\s\S]*Search/);
  assert.match(stylesSource, /\.prefs-dialog \{[\s\S]*height: min\(560px, 86vh\);/);
  assert.match(stylesSource, /\.prefs-content__body \{[\s\S]*overflow-y: auto;/);
});